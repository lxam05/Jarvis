import re
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from openai import AsyncOpenAI
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.nutrition.models import Meal, MealTemplate
from app.modules.nutrition.schemas import MealItemEstimate, ParsedMeal


client = AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

MEMORY_PATTERNS = [
    r"\bmy (?:normal|usual|regular)\b",
    r"\bsame (?:as|dinner|breakfast|lunch)\b",
    r"\byesterday\b",
    r"\bgym wrap\b",
]


async def classify_intent(message: str) -> str:
    lower = message.lower().strip()
    if re.search(r"\bweigh(?:ed|t)?\b|\b\d+\.?\d*\s*kg\b", lower):
        return "weight"
    if any(re.search(p, lower) for p in MEMORY_PATTERNS):
        return "memory"
    if re.search(r"\b(how am i|recovery|protein|calories remaining|coach)\b", lower):
        return "coaching"
    return "meal"


async def resolve_template(
    db: AsyncSession,
    user_id: uuid.UUID,
    message: str,
) -> MealTemplate | None:
    lower = message.lower().strip()

    result = await db.execute(select(MealTemplate).where(MealTemplate.user_id == user_id))
    templates = result.scalars().all()

    for template in templates:
        if template.name.lower() in lower:
            return template
        for alias in template.aliases:
            if alias.lower() in lower:
                return template

    if client and settings.openai_api_key:
        embedding = await _get_embedding(message)
        if embedding:
            query = text(
                """
                SELECT id FROM meal_templates
                WHERE user_id = :user_id AND embedding IS NOT NULL
                ORDER BY embedding <=> :embedding
                LIMIT 1
                """
            )
            row = await db.execute(query, {"user_id": str(user_id), "embedding": str(embedding)})
            match = row.first()
            if match:
                tmpl = await db.get(MealTemplate, match[0])
                if tmpl:
                    return tmpl

    if "yesterday" in lower or "same" in lower:
        yesterday = datetime.now(UTC) - timedelta(days=1)
        start = datetime.combine(yesterday.date(), datetime.min.time(), tzinfo=UTC)
        end = start + timedelta(days=1)
        meal_type = _infer_meal_type(lower)
        q = select(Meal).where(
            Meal.user_id == user_id,
            Meal.status == "confirmed",
            Meal.logged_at >= start,
            Meal.logged_at < end,
        )
        if meal_type:
            q = q.where(Meal.meal_type == meal_type)
        q = q.order_by(Meal.logged_at.desc()).limit(1)
        result = await db.execute(q)
        prior = result.scalar_one_or_none()
        if prior and prior.resolved_from_template_id:
            return await db.get(MealTemplate, prior.resolved_from_template_id)

    return None


def _infer_meal_type(text: str) -> str | None:
    for mt in ("breakfast", "lunch", "dinner", "snack"):
        if mt in text:
            return mt
    return None


async def parse_meal_with_ai(
    message: str,
    weight_context: dict,
    clarification: str | None = None,
) -> ParsedMeal:
    if not client or not settings.openai_api_key:
        return _fallback_parse(message)

    user_content = message
    if clarification:
        user_content = f"Original: {message}\nClarification: {clarification}"

    response = await client.beta.chat.completions.parse(
        model=settings.openai_model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a nutrition assistant. Estimate calories, protein, carbs, and fat "
                    "for food described in natural language. Use UK portion sizes unless specified. "
                    "Set confidence 0-1 based on specificity. Ask follow-up questions if confidence "
                    f"would be below {settings.meal_confidence_threshold}. "
                    f"User weight context: {weight_context}"
                ),
            },
            {"role": "user", "content": user_content},
        ],
        response_format=ParsedMeal,
    )
    parsed = response.choices[0].message.parsed
    if parsed.confidence < settings.meal_confidence_threshold and not parsed.follow_up_questions:
        parsed.follow_up_questions = [
            "Can you specify portion sizes?",
            "Was this a standard or large serving?",
        ]
    return parsed


def template_to_parsed(template: MealTemplate) -> ParsedMeal:
    return ParsedMeal(
        items=[
            MealItemEstimate(
                name=template.name,
                quantity=None,
                calories=template.calories or 0,
                protein_g=float(template.protein_g or 0),
                carbs_g=float(template.carbs_g or 0),
                fat_g=float(template.fat_g or 0),
            )
        ],
        total_calories=template.calories or 0,
        total_protein_g=float(template.protein_g or 0),
        total_carbs_g=float(template.carbs_g or 0),
        total_fat_g=float(template.fat_g or 0),
        confidence=float(template.confidence or 0.95),
        assumptions=[f"Recalled from saved meal: {template.name}"],
        follow_up_questions=[],
        suggested_template_name=template.name,
    )


async def _get_embedding(text: str) -> list[float] | None:
    if not client:
        return None
    response = await client.embeddings.create(
        model=settings.openai_embedding_model,
        input=text,
    )
    return response.data[0].embedding


async def create_or_update_template(
    db: AsyncSession,
    user_id: uuid.UUID,
    name: str,
    parsed: ParsedMeal,
    aliases: list[str] | None = None,
) -> MealTemplate:
    embedding = await _get_embedding(f"{name}: {parsed.items[0].name if parsed.items else name}")
    template = MealTemplate(
        user_id=user_id,
        name=name,
        aliases=aliases or [name.lower()],
        description=", ".join(i.name for i in parsed.items),
        calories=parsed.total_calories,
        protein_g=Decimal(str(parsed.total_protein_g)),
        carbs_g=Decimal(str(parsed.total_carbs_g)),
        fat_g=Decimal(str(parsed.total_fat_g)),
        confidence=Decimal(str(parsed.confidence)),
        embedding=embedding,
        use_count=1,
        last_used_at=datetime.now(UTC),
    )
    db.add(template)
    await db.flush()
    return template


def _fallback_parse(message: str) -> ParsedMeal:
    return ParsedMeal(
        items=[
            MealItemEstimate(
                name=message,
                quantity=None,
                calories=400,
                protein_g=20,
                carbs_g=40,
                fat_g=15,
            )
        ],
        total_calories=400,
        total_protein_g=20,
        total_carbs_g=40,
        total_fat_g=15,
        confidence=0.3,
        assumptions=["OpenAI not configured — placeholder estimate"],
        follow_up_questions=["Please configure OPENAI_API_KEY for accurate estimates."],
    )
