from typing import Annotated
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser
from app.core.db import get_db
from app.core.events import DomainEvent, event_bus
from app.modules.nutrition.chat_service import confirm_meal, get_today_meals, handle_chat
from app.modules.nutrition.models import MealTemplate
from app.modules.nutrition.schemas import (
    ChatRequest,
    ChatResponse,
    ConfirmMealRequest,
    MealResponse,
    MealTemplateResponse,
    WeightLogRequest,
)
from app.modules.nutrition.weight_service import log_weight

router = APIRouter(prefix="/nutrition", tags=["nutrition"])


@router.post("/chat", response_model=ChatResponse)
async def nutrition_chat(
    request: ChatRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: CurrentUser,
) -> ChatResponse:
    try:
        return await handle_chat(db, user, request)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/meals/{meal_id}/confirm", response_model=MealResponse)
async def confirm_meal_endpoint(
    meal_id: uuid.UUID,
    request: ConfirmMealRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: CurrentUser,
) -> MealResponse:
    try:
        return await confirm_meal(db, user, meal_id, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/meals/today", response_model=list[MealResponse])
async def meals_today(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: CurrentUser,
) -> list[MealResponse]:
    return await get_today_meals(db, user.id)


@router.get("/templates", response_model=list[MealTemplateResponse])
async def list_templates(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: CurrentUser,
) -> list[MealTemplateResponse]:
    result = await db.execute(
        select(MealTemplate).where(MealTemplate.user_id == user.id).order_by(MealTemplate.use_count.desc())
    )
    return [
        MealTemplateResponse(
            id=t.id,
            name=t.name,
            aliases=t.aliases,
            description=t.description,
            calories=t.calories,
            protein_g=float(t.protein_g) if t.protein_g else None,
            carbs_g=float(t.carbs_g) if t.carbs_g else None,
            fat_g=float(t.fat_g) if t.fat_g else None,
            use_count=t.use_count,
        )
        for t in result.scalars()
    ]


@router.post("/weight")
async def log_weight_endpoint(
    request: WeightLogRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: CurrentUser,
) -> dict:
    entry = await log_weight(db, user.id, request.weight_kg, request.measured_at, request.note)
    await event_bus.publish(DomainEvent("weight.updated", {"user_id": str(user.id)}))
    return {"id": str(entry.id), "weight_kg": float(entry.weight_kg)}
