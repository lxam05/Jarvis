import json
import uuid
from datetime import UTC, date, datetime, timedelta

from openai import AsyncOpenAI
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import session_scope
from app.core.events import DomainEvent
from app.modules.coaching.models import CoachingInsight
from app.modules.coaching.schemas import ActivitySummary, CoachingContext, CoachingFlag, InsightOutput
from app.modules.core.models import UserSettings
from app.modules.garmin.models import GarminActivity, GarminDailySummary, GarminHrv, GarminSleep
from app.modules.nutrition.models import BodyWeightEntry, Meal

client = AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None


async def build_context(db: AsyncSession, user_id: uuid.UUID, target_date: date | None = None) -> CoachingContext:
    today = target_date or date.today()
    start = datetime.combine(today, datetime.min.time(), tzinfo=UTC)
    end = start + timedelta(days=1)

    sleep_result = await db.execute(
        select(GarminSleep).where(GarminSleep.user_id == user_id, GarminSleep.day == today)
    )
    sleep = sleep_result.scalar_one_or_none()

    hrv_result = await db.execute(
        select(GarminHrv).where(GarminHrv.user_id == user_id, GarminHrv.day == today)
    )
    hrv = hrv_result.scalar_one_or_none()

    daily_result = await db.execute(
        select(GarminDailySummary).where(GarminDailySummary.user_id == user_id, GarminDailySummary.day == today)
    )
    daily = daily_result.scalar_one_or_none()

    week_start = start - timedelta(days=7)
    load_result = await db.execute(
        select(func.coalesce(func.sum(GarminActivity.training_load), 0)).where(
            GarminActivity.user_id == user_id,
            GarminActivity.start_at >= week_start,
        )
    )
    training_load_7d = float(load_result.scalar_one() or 0)

    act_result = await db.execute(
        select(GarminActivity)
        .where(GarminActivity.user_id == user_id, GarminActivity.start_at >= start, GarminActivity.start_at < end)
        .order_by(GarminActivity.start_at.desc())
    )
    activities = [
        ActivitySummary(
            name=a.name,
            sport=a.sport,
            start_at=a.start_at,
            calories=a.calories,
            duration_seconds=a.elapsed_seconds,
        )
        for a in act_result.scalars()
    ]

    meal_result = await db.execute(
        select(
            func.coalesce(func.sum(Meal.calories), 0),
            func.coalesce(func.sum(Meal.protein_g), 0),
        ).where(
            Meal.user_id == user_id,
            Meal.status == "confirmed",
            Meal.logged_at >= start,
            Meal.logged_at < end,
        )
    )
    cal_row = meal_result.one()

    settings_result = await db.execute(select(UserSettings).where(UserSettings.user_id == user_id))
    user_settings = settings_result.scalar_one_or_none()

    weight_result = await db.execute(
        select(BodyWeightEntry.weight_kg)
        .where(BodyWeightEntry.user_id == user_id, BodyWeightEntry.measured_at >= week_start)
        .order_by(BodyWeightEntry.measured_at.asc())
    )
    weight_trend = [float(w) for w in weight_result.scalars()]

    recovery = _compute_recovery_score(sleep, hrv, daily)

    return CoachingContext(
        date=today,
        sleep_score=sleep.score if sleep else None,
        hrv_status=hrv.status if hrv else None,
        hrv_last_night=hrv.last_night_avg_ms if hrv else None,
        body_battery_min=daily.bb_min if daily else None,
        stress_avg=daily.stress_avg if daily else None,
        training_load_7d=training_load_7d,
        activities_today=activities,
        calories_consumed=int(cal_row[0]),
        calories_goal=user_settings.calorie_goal if user_settings else None,
        protein_consumed_g=float(cal_row[1]),
        protein_goal_g=user_settings.protein_goal_g if user_settings else None,
        weight_trend_7d=weight_trend,
        recovery_score=recovery,
    )


def _compute_recovery_score(sleep, hrv, daily) -> float:
    score = 50.0
    if sleep and sleep.score:
        score += (sleep.score - 50) * 0.4
    if hrv and hrv.status:
        if hrv.status.upper() in ("BALANCED", "GOOD"):
            score += 15
        elif hrv.status.upper() in ("LOW", "POOR", "UNBALANCED"):
            score -= 20
    if daily and daily.bb_min:
        score += (daily.bb_min - 50) * 0.2
    return max(0, min(100, score))


def run_rule_engine(ctx: CoachingContext) -> list[CoachingFlag]:
    flags: list[CoachingFlag] = []

    if ctx.calories_goal:
        remaining = ctx.calories_goal - ctx.calories_consumed
        if remaining > 800:
            flags.append(
                CoachingFlag(
                    category="nutrition",
                    severity="info",
                    code="calories_short",
                    message=f"You're {remaining} kcal short of your goal.",
                    data={"remaining": remaining},
                )
            )
        elif remaining < -300:
            flags.append(
                CoachingFlag(
                    category="nutrition",
                    severity="warning",
                    code="calories_over",
                    message=f"You're {abs(remaining)} kcal over your goal.",
                    data={"over": abs(remaining)},
                )
            )

    if ctx.protein_goal_g:
        pct = ctx.protein_consumed_g / ctx.protein_goal_g
        if pct < 0.7:
            remaining = ctx.protein_goal_g - ctx.protein_consumed_g
            flags.append(
                CoachingFlag(
                    category="nutrition",
                    severity="warning",
                    code="protein_low",
                    message=f"Protein is low — {ctx.protein_consumed_g:.0f}g of {ctx.protein_goal_g}g target.",
                    data={"remaining_g": remaining},
                )
            )

    if ctx.sleep_score is not None and ctx.sleep_score < 60:
        flags.append(
            CoachingFlag(
                category="recovery",
                severity="warning",
                code="sleep_poor",
                message="Sleep quality was poor last night. Prioritize recovery today.",
                data={"sleep_score": ctx.sleep_score},
            )
        )

    if ctx.hrv_status and ctx.hrv_status.upper() in ("LOW", "POOR", "UNBALANCED"):
        flags.append(
            CoachingFlag(
                category="recovery",
                severity="critical",
                code="hrv_low",
                message="HRV is below baseline. Consider skipping high-intensity intervals.",
                data={"hrv_status": ctx.hrv_status},
            )
        )

    if ctx.recovery_score < 40:
        flags.append(
            CoachingFlag(
                category="recovery",
                severity="warning",
                code="recovery_poor",
                message="Recovery is poor. Take it easy today.",
                data={"recovery_score": ctx.recovery_score},
            )
        )

    if ctx.training_load_7d > 500 and ctx.recovery_score < 50:
        flags.append(
            CoachingFlag(
                category="training",
                severity="warning",
                code="high_load_low_recovery",
                message="High training load with low recovery — consider a rest day.",
                data={"training_load_7d": ctx.training_load_7d},
            )
        )

    return flags


async def synthesize_insights(ctx: CoachingContext, flags: list[CoachingFlag]) -> list[InsightOutput]:
    if not flags:
        return [
            InsightOutput(
                category="general",
                severity="info",
                title="Looking good",
                body="No major flags today. Keep up your current routine.",
            )
        ]

    if client and settings.openai_api_key:
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a fitness coach. Given context and rule flags, produce 1-3 concise, "
                        "actionable insights. Return JSON array of objects with category, severity, title, body."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {"context": ctx.model_dump(mode="json"), "flags": [f.model_dump() for f in flags]}
                    ),
                },
            ],
            response_format={"type": "json_object"},
        )
        try:
            data = json.loads(response.choices[0].message.content or "{}")
            items = data.get("insights", data if isinstance(data, list) else [])
            return [InsightOutput(**item) for item in items[:3]]
        except (json.JSONDecodeError, TypeError, ValueError):
            pass

    return [
        InsightOutput(
            category=f.category,
            severity=f.severity,
            title=f.code.replace("_", " ").title(),
            body=f.message,
        )
        for f in flags[:3]
    ]


async def regenerate_insights(db: AsyncSession, user_id: uuid.UUID) -> None:
    ctx = await build_context(db, user_id)
    flags = run_rule_engine(ctx)
    insights = await synthesize_insights(ctx, flags)

    await db.execute(
        update(CoachingInsight)
        .where(CoachingInsight.user_id == user_id)
        .where(CoachingInsight.dismissed_at.is_(None))
        .values(dismissed_at=datetime.now(UTC))
    )

    for insight in insights:
        db.add(
            CoachingInsight(
                user_id=user_id,
                category=insight.category,
                severity=insight.severity,
                title=insight.title,
                body=insight.body,
                data={"flags": [f.model_dump() for f in flags]},
                expires_at=datetime.now(UTC) + timedelta(hours=24),
            )
        )


async def on_domain_event(event: DomainEvent) -> None:
    if event.name in ("garmin.synced", "meal.logged", "weight.updated"):
        user_id = uuid.UUID(event.payload["user_id"])
        async with session_scope() as db:
            await regenerate_insights(db, user_id)
