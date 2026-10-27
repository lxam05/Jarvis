from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token, get_user_from_token, hash_password, verify_password
from app.core.config import settings
from app.core.db import get_db
from app.modules.core.models import User, UserSettings
from app.modules.core.schemas import LoginRequest, TokenResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


Sport = Literal["running", "cycling", "swimming"]


class SettingsUpdate(BaseModel):
    race_name: str | None = None
    race_date: date | None = None
    sports: list[Sport] | None = Field(default=None, min_length=1)
    coach_profile: str | None = Field(default=None, max_length=4000)


class SettingsResponse(BaseModel):
    race_name: str | None = None
    race_date: date | None = None
    sports: list[Sport] = ["running", "cycling", "swimming"]
    coach_profile: str | None = None


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


@router.get("/settings", response_model=SettingsResponse)
async def get_settings(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_user_from_token)],
) -> SettingsResponse:
    s = await db.get(UserSettings, user.id)
    if s is None:
        return SettingsResponse()
    return SettingsResponse(
        race_name=s.race_name,
        race_date=s.race_date,
        sports=s.sports or ["running", "cycling", "swimming"],
        coach_profile=s.coach_profile,
    )


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

    db.add(UserSettings(user_id=user.id))
    return user
