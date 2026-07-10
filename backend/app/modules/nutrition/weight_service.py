import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.core.models import User, UserSettings
from app.modules.nutrition.models import BodyWeightEntry, Meal
from app.modules.nutrition.schemas import WeightContext


async def get_weight_context(db: AsyncSession, user_id: uuid.UUID) -> WeightContext:
    settings_result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user_id)
    )
    settings = settings_result.scalar_one_or_none()

    latest_result = await db.execute(
        select(BodyWeightEntry)
        .where(BodyWeightEntry.user_id == user_id)
        .order_by(BodyWeightEntry.measured_at.desc())
        .limit(1)
    )
    latest = latest_result.scalar_one_or_none()

    week_ago = datetime.now(UTC) - timedelta(days=7)
    trend_result = await db.execute(
        select(BodyWeightEntry.weight_kg, BodyWeightEntry.measured_at)
        .where(BodyWeightEntry.user_id == user_id)
        .where(BodyWeightEntry.measured_at >= week_ago)
        .order_by(BodyWeightEntry.measured_at.asc())
    )
    trend_rows = trend_result.all()
    trend_7d = [float(row.weight_kg) for row in trend_rows]

    weekly_change = None
    if len(trend_7d) >= 2:
        weekly_change = round(trend_7d[-1] - trend_7d[0], 2)

    calories_today = await _calories_consumed_today(db, user_id)
    maintenance = settings.maintenance_calories if settings else None
    deficit = None
    if maintenance is not None:
        deficit = calories_today - maintenance

    return WeightContext(
        current_weight_kg=float(latest.weight_kg) if latest else None,
        goal_weight_kg=float(settings.goal_weight_kg) if settings and settings.goal_weight_kg else None,
        weekly_change_kg=weekly_change,
        maintenance_calories=maintenance,
        estimated_deficit_today=deficit,
        trend_7d=trend_7d,
    )


async def _calories_consumed_today(db: AsyncSession, user_id: uuid.UUID) -> int:
    today = date.today()
    start = datetime.combine(today, datetime.min.time(), tzinfo=UTC)
    end = start + timedelta(days=1)
    result = await db.execute(
        select(func.coalesce(func.sum(Meal.calories), 0))
        .where(Meal.user_id == user_id)
        .where(Meal.status == "confirmed")
        .where(Meal.logged_at >= start)
        .where(Meal.logged_at < end)
    )
    return int(result.scalar_one())


async def log_weight(
    db: AsyncSession,
    user_id: uuid.UUID,
    weight_kg: float,
    measured_at: datetime | None = None,
    note: str | None = None,
    source: str = "manual",
) -> BodyWeightEntry:
    entry = BodyWeightEntry(
        user_id=user_id,
        measured_at=measured_at or datetime.now(UTC),
        weight_kg=Decimal(str(weight_kg)),
        source=source,
        note=note,
    )
    db.add(entry)
    await db.flush()
    return entry
