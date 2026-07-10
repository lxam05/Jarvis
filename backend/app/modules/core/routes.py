from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token, get_user_from_token, hash_password, verify_password
from app.core.config import settings
from app.core.db import get_db
from app.modules.core.models import User, UserSettings
from app.modules.core.schemas import LoginRequest, TokenResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


class SettingsUpdate(BaseModel):
    calorie_goal: int | None = None
    protein_goal_g: int | None = None
    carbs_goal_g: int | None = None
    fat_goal_g: int | None = None
    goal_weight_kg: float | None = None
    maintenance_calories: int | None = None


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: Annotated[AsyncSession, Depends(get_db)]) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()
    if user is None or not user.password_hash or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserResponse)
async def me(user: Annotated[User, Depends(get_user_from_token)]) -> UserResponse:
    return UserResponse(id=str(user.id), email=user.email, timezone=user.timezone)


@router.put("/settings")
async def update_settings(
    body: SettingsUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_user_from_token)],
) -> dict:
    result = await db.execute(select(UserSettings).where(UserSettings.user_id == user.id))
    s = result.scalar_one_or_none()
    if s is None:
        s = UserSettings(user_id=user.id)
        db.add(s)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(s, field, value)
    return {"ok": True}


async def seed_default_user(db: AsyncSession) -> User:
    result = await db.execute(select(User).limit(1))
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    user = User(
        email=settings.default_user_email,
        password_hash=hash_password("jarvis"),
        timezone="Europe/London",
    )
    db.add(user)
    await db.flush()

    db.add(
        UserSettings(
            user_id=user.id,
            calorie_goal=2500,
            protein_goal_g=160,
            carbs_goal_g=250,
            fat_goal_g=80,
            goal_weight_kg=78.0,
            maintenance_calories=2650,
        )
    )
    return user
