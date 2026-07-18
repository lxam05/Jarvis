from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.coaching.models import CoachingInsight
from app.modules.coaching.service import _compute_recovery_score, build_context
from app.modules.core.models import UserSettings
from app.modules.dashboard.schemas import (
    DashboardTodayResponse,
    GoalsCard,
    InsightCard,
    MacroSummary,
    RecoveryCard,
    StreakCard,
    TrainingCard,
    WeeklyTrainingResponse,
    WeightCard,
    WeightTrendPoint,
    WeightTrendResponse,
)
from app.modules.garmin.models import GarminActivity, GarminDailySummary, GarminHrv, GarminSleep, GarminSyncRun
from app.modules.nutrition.models import BodyWeightEntry, Meal


def _activity_dict(a: GarminActivity) -> dict:
    return {
        "id": str(a.id),
        "name": a.name,
        "sport": a.sport,
        "start_at": a.start_at.isoformat(),
        "calories": a.calories,
        "duration_seconds": a.elapsed_seconds,
        "distance_m": float(a.distance_m) if a.distance_m else None,
    }


async def get_dashboard_today(db, user_id) -> DashboardTodayResponse:
    today = date.today()
    start = datetime.combine(today, datetime.min.time(), tzinfo=UTC)
    end = start + timedelta(days=1)

    ctx = await build_context(db, user_id, today)

    settings_result = await db.execute(select(UserSettings).where(UserSettings.user_id == user_id))
    settings = settings_result.scalar_one_or_none()

    meal_totals = await db.execute(
        select(
            func.coalesce(func.sum(Meal.calories), 0),
            func.coalesce(func.sum(Meal.protein_g), 0),
            func.coalesce(func.sum(Meal.carbs_g), 0),
            func.coalesce(func.sum(Meal.fat_g), 0),
        ).where(
            Meal.user_id == user_id,
            Meal.status == "confirmed",
            Meal.logged_at >= start,
            Meal.logged_at < end,
        )
    )
    mt = meal_totals.one()
    cal_goal = settings.calorie_goal if settings else None
    prot_goal = settings.protein_goal_g if settings else None

    macros = MacroSummary(
        calories=int(mt[0]),
        protein_g=float(mt[1]),
        carbs_g=float(mt[2]),
        fat_g=float(mt[3]),
        calorie_goal=cal_goal,
        protein_goal_g=prot_goal,
        calories_remaining=(cal_goal - int(mt[0])) if cal_goal else None,
        protein_remaining_g=(prot_goal - float(mt[1])) if prot_goal else None,
    )

    weight_since = start - timedelta(days=30)
    weight_rows = await db.execute(
        select(BodyWeightEntry.weight_kg)
        .where(BodyWeightEntry.user_id == user_id, BodyWeightEntry.measured_at >= weight_since)
        .order_by(BodyWeightEntry.measured_at.asc())
    )
    weight_trend = [float(w) for w in weight_rows.scalars()]
    if not weight_trend:
        latest_weight = await db.execute(
            select(BodyWeightEntry.weight_kg)
            .where(BodyWeightEntry.user_id == user_id)
            .order_by(BodyWeightEntry.measured_at.desc())
            .limit(1)
        )
        w = latest_weight.scalar_one_or_none()
        if w is not None:
            weight_trend = [float(w)]

    weight = WeightCard(
        current_kg=weight_trend[-1] if weight_trend else None,
        goal_kg=float(settings.goal_weight_kg) if settings and settings.goal_weight_kg else None,
        weekly_change_kg=(
            round(weight_trend[-1] - weight_trend[0], 2) if len(weight_trend) >= 2 else None
        ),
        trend_7d=weight_trend[-7:] if weight_trend else [],
    )

    sleep_result = await db.execute(
        select(GarminSleep).where(GarminSleep.user_id == user_id, GarminSleep.day == today)
    )
    sleep = sleep_result.scalar_one_or_none()
    daily_result = await db.execute(
        select(GarminDailySummary).where(
            GarminDailySummary.user_id == user_id, GarminDailySummary.day == today
        )
    )
    daily = daily_result.scalar_one_or_none()
    hrv_result = await db.execute(
        select(GarminHrv).where(GarminHrv.user_id == user_id, GarminHrv.day == today)
    )
    hrv = hrv_result.scalar_one_or_none()
    recovery = RecoveryCard(
        sleep_score=sleep.score if sleep else None,
        sleep_hours=round(sleep.total_seconds / 3600, 1) if sleep and sleep.total_seconds else None,
        hrv_ms=hrv.last_night_avg_ms if hrv else None,
        hrv_status=hrv.status if hrv else None,
        body_battery_min=daily.bb_min if daily else None,
        body_battery_max=daily.bb_max if daily else None,
        stress_avg=daily.stress_avg if daily else None,
        recovery_score=ctx.recovery_score,
    )

    week_start = start - timedelta(days=7)
    week_acts = await db.execute(
        select(func.count(GarminActivity.id), func.coalesce(func.sum(GarminActivity.training_load), 0)).where(
            GarminActivity.user_id == user_id,
            GarminActivity.start_at >= week_start,
            GarminActivity.start_at < end,
        )
    )
    week_row = week_acts.one()

    today_acts = await db.execute(
        select(GarminActivity)
        .where(
            GarminActivity.user_id == user_id,
            GarminActivity.start_at >= start,
            GarminActivity.start_at < end,
        )
        .order_by(GarminActivity.start_at.desc())
    )
    today_list = today_acts.scalars().all()
    activity_burned = sum(a.calories or 0 for a in today_list)
    calories_burned = daily.calories_total if daily and daily.calories_total else activity_burned

    training = TrainingCard(
        activities_today=[_activity_dict(a) for a in today_list],
        weekly_load=float(week_row[1] or 0),
        weekly_activities=int(week_row[0] or 0),
        total_calories_burned_today=calories_burned,
    )

    streaks = StreakCard(
        logging_streak_days=await _meal_logging_streak(db, user_id),
        training_streak_days=await _training_streak(db, user_id, today),
    )

    goals = GoalsCard(
        calorie_goal=cal_goal,
        protein_goal_g=prot_goal,
        step_goal=daily.step_goal if daily else None,
        steps_today=daily.steps if daily else None,
    )

    recent = await db.execute(
        select(GarminActivity)
        .where(GarminActivity.user_id == user_id)
        .order_by(GarminActivity.start_at.desc())
        .limit(40)
    )
    recent_activities = [_activity_dict(a) for a in recent.scalars()]

    insight_result = await db.execute(
        select(CoachingInsight)
        .where(CoachingInsight.user_id == user_id, CoachingInsight.dismissed_at.is_(None))
        .order_by(CoachingInsight.generated_at.desc())
        .limit(3)
    )
    insights = [
        InsightCard(title=i.title, body=i.body, category=i.category, severity=i.severity)
        for i in insight_result.scalars()
    ]

    sync_result = await db.execute(
        select(GarminSyncRun).order_by(GarminSyncRun.started_at.desc()).limit(1)
    )
    last_sync = sync_result.scalar_one_or_none()

    return DashboardTodayResponse(
        date=today,
        macros=macros,
        weight=weight,
        recovery=recovery,
        training=training,
        streaks=streaks,
        goals=goals,
        recent_activities=recent_activities,
        insights=insights,
        last_garmin_sync=last_sync.finished_at if last_sync else None,
        calories_burned=calories_burned,
    )


async def get_weight_trend(db: AsyncSession, user_id, days: int = 30) -> WeightTrendResponse:
    since = datetime.now(UTC) - timedelta(days=days)
    result = await db.execute(
        select(BodyWeightEntry.measured_at, BodyWeightEntry.weight_kg)
        .where(BodyWeightEntry.user_id == user_id, BodyWeightEntry.measured_at >= since)
        .order_by(BodyWeightEntry.measured_at.asc())
    )
    points = [
        WeightTrendPoint(date=row.measured_at.date(), weight_kg=float(row.weight_kg))
        for row in result.all()
    ]
    return WeightTrendResponse(points=points)


async def get_weekly_training(db: AsyncSession, user_id) -> WeeklyTrainingResponse:
    today = date.today()
    days_data = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        start = datetime.combine(d, datetime.min.time(), tzinfo=UTC)
        end = start + timedelta(days=1)
        result = await db.execute(
            select(func.count(GarminActivity.id), func.coalesce(func.sum(GarminActivity.calories), 0)).where(
                GarminActivity.user_id == user_id,
                GarminActivity.start_at >= start,
                GarminActivity.start_at < end,
            )
        )
        row = result.one()
        days_data.append({"date": d.isoformat(), "activities": int(row[0]), "calories": int(row[1])})
    return WeeklyTrainingResponse(days=days_data)


async def _meal_logging_streak(db: AsyncSession, user_id) -> int:
    streak = 0
    d = date.today()
    while True:
        start = datetime.combine(d, datetime.min.time(), tzinfo=UTC)
        end = start + timedelta(days=1)
        result = await db.execute(
            select(func.count(Meal.id)).where(
                Meal.user_id == user_id, Meal.status == "confirmed", Meal.logged_at >= start, Meal.logged_at < end
            )
        )
        if int(result.scalar_one()) > 0:
            streak += 1
            d -= timedelta(days=1)
        else:
            break
        if streak > 365:
            break
    return streak


async def _training_streak(db: AsyncSession, user_id, anchor: date | None = None) -> int:
    streak = 0
    d = anchor or date.today()
    while True:
        start = datetime.combine(d, datetime.min.time(), tzinfo=UTC)
        end = start + timedelta(days=1)
        result = await db.execute(
            select(func.count(GarminActivity.id)).where(
                GarminActivity.user_id == user_id, GarminActivity.start_at >= start, GarminActivity.start_at < end
            )
        )
        if int(result.scalar_one()) > 0:
            streak += 1
            d -= timedelta(days=1)
        else:
            break
        if streak > 365:
            break
    return streak
