import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import DomainEvent, event_bus
from app.modules.core.models import User
from app.modules.nutrition.ai_service import (
    classify_intent,
    create_or_update_template,
    parse_meal_with_ai,
    resolve_template,
    template_to_parsed,
)
from app.modules.nutrition.models import Meal, MealItem, MealTemplate, NutritionConversation, NutritionMessage
from app.modules.nutrition.schemas import MealItemEstimate
from app.modules.nutrition.schemas import (
    ChatRequest,
    ChatResponse,
    ConfirmMealRequest,
    MealDraft,
    MealItemResponse,
    MealResponse,
    ParsedMeal,
)
from app.modules.nutrition.weight_service import get_weight_context, log_weight


async def handle_chat(
    db: AsyncSession,
    user: User,
    request: ChatRequest,
) -> ChatResponse:
    if request.conversation_id:
        conv = await db.get(NutritionConversation, request.conversation_id)
        if conv is None or conv.user_id != user.id:
            raise ValueError("Conversation not found")
    else:
        conv = NutritionConversation(user_id=user.id)
        db.add(conv)
        await db.flush()

    db.add(NutritionMessage(conversation_id=conv.id, role="user", content=request.message))
    await db.flush()

    intent = await classify_intent(request.message)
    weight_ctx = await get_weight_context(db, user.id)
    weight_dict = weight_ctx.model_dump()

    if intent == "weight":
        import re

        match = re.search(r"(\d+\.?\d*)\s*kg", request.message.lower())
        if match:
            entry = await log_weight(db, user.id, float(match.group(1)), source="ai")
            reply = f"Logged weight: {entry.weight_kg} kg."
            db.add(NutritionMessage(conversation_id=conv.id, role="assistant", content=reply))
            await event_bus.publish(DomainEvent("weight.updated", {"user_id": str(user.id)}))
            return ChatResponse(conversation_id=conv.id, reply=reply, state="confirmed")

    if intent == "coaching":
        reply = (
            "Check your dashboard for coaching insights — I combine your Garmin data, "
            "nutrition, and weight trends to make recommendations."
        )
        db.add(NutritionMessage(conversation_id=conv.id, role="assistant", content=reply))
        return ChatResponse(conversation_id=conv.id, reply=reply, state="idle")

    template = None
    if intent == "memory":
        template = await resolve_template(db, user.id, request.message)

    if template:
        parsed = template_to_parsed(template)
        template.use_count += 1
        template.last_used_at = datetime.now(UTC)
        resolved_id = template.id
    else:
        last_msg = await _get_pending_clarification(db, conv.id)
        clarification = request.message if last_msg else None
        parsed = await parse_meal_with_ai(
            last_msg or request.message,
            weight_dict,
            clarification=clarification if last_msg else None,
        )
        resolved_id = None

    if parsed.confidence < 0.75 and parsed.follow_up_questions:
        reply = parsed.follow_up_questions[0]
        if parsed.assumptions:
            reply += f"\n\nAssumptions so far: {', '.join(parsed.assumptions)}"
        metadata = {
            "state": "clarifying",
            "pending_input": last_msg or request.message,
            "partial_parse": parsed.model_dump(),
        }
        db.add(
            NutritionMessage(
                conversation_id=conv.id,
                role="assistant",
                content=reply,
                metadata_=metadata,
            )
        )
        return ChatResponse(
            conversation_id=conv.id,
            reply=reply,
            state="clarifying",
            follow_up_questions=parsed.follow_up_questions,
        )

    draft_meal = Meal(
        user_id=user.id,
        raw_input=request.message,
        meal_type=parsed.meal_type,
        resolved_from_template_id=resolved_id,
        calories=parsed.total_calories,
        protein_g=Decimal(str(parsed.total_protein_g)),
        carbs_g=Decimal(str(parsed.total_carbs_g)),
        fat_g=Decimal(str(parsed.total_fat_g)),
        confidence=Decimal(str(parsed.confidence)),
        status="draft",
        ai_reasoning=", ".join(parsed.assumptions),
    )
    db.add(draft_meal)
    await db.flush()

    for item in parsed.items:
        db.add(
            MealItem(
                meal_id=draft_meal.id,
                name=item.name,
                quantity=item.quantity,
                calories=item.calories,
                protein_g=Decimal(str(item.protein_g)),
                carbs_g=Decimal(str(item.carbs_g)),
                fat_g=Decimal(str(item.fat_g)),
            )
        )

    summary = (
        f"**Estimated meal:** {parsed.total_calories} kcal | "
        f"P: {parsed.total_protein_g}g | C: {parsed.total_carbs_g}g | F: {parsed.total_fat_g}g\n"
        f"Confidence: {parsed.confidence:.0%}\n\n"
        "Reply **confirm** or tap Confirm to save."
    )
    metadata = {
        "state": "confirming",
        "meal_draft_id": str(draft_meal.id),
        "parsed": parsed.model_dump(),
    }
    db.add(
        NutritionMessage(
            conversation_id=conv.id,
            role="assistant",
            content=summary,
            metadata_=metadata,
        )
    )

    return ChatResponse(
        conversation_id=conv.id,
        reply=summary,
        state="confirming",
        meal_draft=MealDraft(id=draft_meal.id, parsed=parsed, raw_input=request.message, resolved_from_template_id=resolved_id),
    )


async def confirm_meal(
    db: AsyncSession,
    user: User,
    meal_id: uuid.UUID,
    request: ConfirmMealRequest,
) -> MealResponse:
    meal = await db.get(Meal, meal_id)
    if meal is None or meal.user_id != user.id:
        raise ValueError("Meal not found")
    if meal.status != "draft":
        raise ValueError("Meal already confirmed")

    meal.status = "confirmed"
    meal.logged_at = datetime.now(UTC)

    if request.save_as_template:
        name = request.template_name or meal.raw_input[:50]
        parsed = ParsedMeal(
            items=[],
            total_calories=meal.calories,
            total_protein_g=float(meal.protein_g),
            total_carbs_g=float(meal.carbs_g),
            total_fat_g=float(meal.fat_g),
            confidence=float(meal.confidence),
        )
        result = await db.execute(select(MealItem).where(MealItem.meal_id == meal.id))
        for item in result.scalars():
            parsed.items.append(
                MealItemEstimate(
                    name=item.name,
                    quantity=item.quantity,
                    calories=item.calories or 0,
                    protein_g=float(item.protein_g or 0),
                    carbs_g=float(item.carbs_g or 0),
                    fat_g=float(item.fat_g or 0),
                )
            )
        template = await create_or_update_template(db, user.id, name, parsed)
        meal.resolved_from_template_id = template.id

    await event_bus.publish(DomainEvent("meal.logged", {"user_id": str(user.id), "meal_id": str(meal.id)}))
    return _meal_to_response(meal, await _get_meal_items(db, meal.id))


async def _get_pending_clarification(db: AsyncSession, conversation_id: uuid.UUID) -> str | None:
    result = await db.execute(
        select(NutritionMessage)
        .where(NutritionMessage.conversation_id == conversation_id)
        .where(NutritionMessage.role == "assistant")
        .order_by(NutritionMessage.created_at.desc())
        .limit(1)
    )
    msg = result.scalar_one_or_none()
    if msg and msg.metadata_ and msg.metadata_.get("state") == "clarifying":
        return msg.metadata_.get("pending_input")
    return None


async def _get_meal_items(db: AsyncSession, meal_id: uuid.UUID) -> list[MealItem]:
    result = await db.execute(select(MealItem).where(MealItem.meal_id == meal_id))
    return list(result.scalars())


def _meal_to_response(meal: Meal, items: list[MealItem]) -> MealResponse:
    return MealResponse(
        id=meal.id,
        logged_at=meal.logged_at,
        meal_type=meal.meal_type,
        raw_input=meal.raw_input,
        calories=meal.calories,
        protein_g=float(meal.protein_g),
        carbs_g=float(meal.carbs_g),
        fat_g=float(meal.fat_g),
        confidence=float(meal.confidence),
        status=meal.status,
        items=[
            MealItemResponse(
                name=i.name,
                quantity=i.quantity,
                calories=i.calories,
                protein_g=float(i.protein_g) if i.protein_g else None,
                carbs_g=float(i.carbs_g) if i.carbs_g else None,
                fat_g=float(i.fat_g) if i.fat_g else None,
            )
            for i in items
        ],
    )


async def get_today_meals(db: AsyncSession, user_id: uuid.UUID) -> list[MealResponse]:
    today_start = datetime.combine(datetime.now(UTC).date(), datetime.min.time(), tzinfo=UTC)
    result = await db.execute(
        select(Meal)
        .where(Meal.user_id == user_id, Meal.status == "confirmed", Meal.logged_at >= today_start)
        .order_by(Meal.logged_at.desc())
    )
    meals = result.scalars().all()
    responses = []
    for meal in meals:
        items = await _get_meal_items(db, meal.id)
        responses.append(_meal_to_response(meal, items))
    return responses
