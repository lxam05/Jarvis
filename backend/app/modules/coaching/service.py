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
from app.modules.coaching.schemas import (
    ActivitySummary,
    CoachingContext,
    CoachingFlag,
    InsightOutput,
    SessionRecommendationResponse,
    SportSession,
)
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


def _parse_race_date() -> date:
    try:
        return date.fromisoformat(settings.half_ironman_race_date)
    except ValueError:
        return date.today() + timedelta(weeks=8)


def _phase_for_weeks(weeks: int) -> str:
    if weeks <= 0:
        return "race"
    if weeks <= 2:
        return "taper"
    if weeks <= 4:
        return "peak"
    if weeks <= 6:
        return "build"
    return "base"


async def _latest_recovery(db: AsyncSession, user_id: uuid.UUID) -> tuple[float, int | None, str | None]:
    """Prefer today; fall back to newest sleep/daily day (same as dashboard)."""
    today = date.today()
    sleep_result = await db.execute(
        select(GarminSleep).where(GarminSleep.user_id == user_id, GarminSleep.day == today)
    )
    sleep = sleep_result.scalar_one_or_none()
    daily_result = await db.execute(
        select(GarminDailySummary).where(GarminDailySummary.user_id == user_id, GarminDailySummary.day == today)
    )
    daily = daily_result.scalar_one_or_none()
    hrv_result = await db.execute(
        select(GarminHrv).where(GarminHrv.user_id == user_id, GarminHrv.day == today)
    )
    hrv = hrv_result.scalar_one_or_none()
    metrics_day = today

    if sleep is None and daily is None:
        latest_daily = await db.execute(
            select(GarminDailySummary)
            .where(GarminDailySummary.user_id == user_id)
            .order_by(GarminDailySummary.day.desc())
            .limit(1)
        )
        daily = latest_daily.scalar_one_or_none()
        if daily is not None:
            metrics_day = daily.day
            sleep_result = await db.execute(
                select(GarminSleep).where(GarminSleep.user_id == user_id, GarminSleep.day == metrics_day)
            )
            sleep = sleep_result.scalar_one_or_none()
            hrv_result = await db.execute(
                select(GarminHrv).where(GarminHrv.user_id == user_id, GarminHrv.day == metrics_day)
            )
            hrv = hrv_result.scalar_one_or_none()
        else:
            latest_sleep = await db.execute(
                select(GarminSleep)
                .where(GarminSleep.user_id == user_id)
                .order_by(GarminSleep.day.desc())
                .limit(1)
            )
            sleep = latest_sleep.scalar_one_or_none()
            if sleep is not None:
                metrics_day = sleep.day
                hrv_result = await db.execute(
                    select(GarminHrv).where(GarminHrv.user_id == user_id, GarminHrv.day == metrics_day)
                )
                hrv = hrv_result.scalar_one_or_none()

    recovery = _compute_recovery_score(sleep, hrv, daily)
    return recovery, sleep.score if sleep else None, hrv.status if hrv else None


async def _sport_volume_7d(db: AsyncSession, user_id: uuid.UUID) -> dict[str, float]:
    since = datetime.now(UTC) - timedelta(days=7)
    result = await db.execute(
        select(GarminActivity.sport, GarminActivity.distance_m).where(
            GarminActivity.user_id == user_id,
            GarminActivity.start_at >= since,
        )
    )
    volumes = {"running": 0.0, "cycling": 0.0, "swimming": 0.0}
    for sport, distance_m in result.all():
        key = (sport or "").lower().strip()
        if key in volumes:
            volumes[key] += float(distance_m or 0) / 1000.0
    return volumes


async def _days_since_sport(db: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
    out = {"running": 99, "cycling": 99, "swimming": 99}
    for sport in out:
        result = await db.execute(
            select(GarminActivity.start_at)
            .where(GarminActivity.user_id == user_id, func.lower(GarminActivity.sport) == sport)
            .order_by(GarminActivity.start_at.desc())
            .limit(1)
        )
        start_at = result.scalar_one_or_none()
        if start_at is not None:
            out[sport] = max(0, (datetime.now(UTC) - start_at).days)
    return out


def _build_sessions(phase: str, recovery: float, recommended: str) -> list[SportSession]:
    easy = recovery < 50
    hard_ok = recovery >= 65 and phase in ("base", "build", "peak")

    if phase == "taper":
        return [
            SportSession(
                sport="running",
                title="Taper run",
                duration_min=35 if recommended == "running" else 30,
                intensity="easy",
                description="Keep cadence light. Include 4×20s strides if legs feel good.",
                focus="Freshness for race day",
            ),
            SportSession(
                sport="cycling",
                title="Taper spin",
                duration_min=50 if recommended == "cycling" else 40,
                intensity="easy",
                description="Z2 spin, smooth cadence. Optional 3×1 min openers.",
                focus="Keep bike feel without fatigue",
            ),
            SportSession(
                sport="swimming",
                title="Taper swim",
                duration_min=30 if recommended == "swimming" else 25,
                intensity="easy",
                description="Technique + 4×50 race-pace feelers. Long rest.",
                focus="Touch race pace, stay sharp",
            ),
        ]

    if easy or phase == "race":
        return [
            SportSession(
                sport="running",
                title="Recovery jog",
                duration_min=30,
                intensity="recovery",
                description="Very easy conversational pace. Stop if form breaks down.",
                focus="Flush legs / restore",
            ),
            SportSession(
                sport="cycling",
                title="Easy spin",
                duration_min=45,
                intensity="recovery",
                description="Flat Z1–Z2. High cadence, low torque.",
                focus="Active recovery",
            ),
            SportSession(
                sport="swimming",
                title="Technique swim",
                duration_min=30,
                intensity="recovery",
                description="Drills + easy continuous swim. No hard sets.",
                focus="Skill without stress",
            ),
        ]

    run = SportSession(
        sport="running",
        title="Threshold bricks" if hard_ok and recommended == "running" else "Aerobic run",
        duration_min=55 if recommended == "running" else 45,
        intensity="threshold" if hard_ok and recommended == "running" else "endurance",
        description=(
            "20 min easy + 3×8 min @ threshold (2 min easy) + cool-down."
            if hard_ok and recommended == "running"
            else "Steady Z2. Finish with 4×20s strides."
        ),
        focus="Half marathon durability",
    )
    bike = SportSession(
        sport="cycling",
        title="Long aerobic ride" if recommended == "cycling" else "Endurance ride",
        duration_min=120 if recommended == "cycling" and phase in ("build", "peak") else 75,
        intensity="endurance",
        description=(
            "Mostly Z2. Add 3×8 min sweet-spot late if feeling strong."
            if recommended == "cycling"
            else "Z2 hills optional. Fuel as you would on race day."
        ),
        focus="90 km bike durability",
    )
    swim = SportSession(
        sport="swimming",
        title="CSS intervals" if hard_ok and recommended == "swimming" else "Aerobic swim",
        duration_min=45 if recommended == "swimming" else 35,
        intensity="threshold" if hard_ok and recommended == "swimming" else "endurance",
        description=(
            "8×200 @ CSS with 20–30s rest, then easy 200."
            if hard_ok and recommended == "swimming"
            else "Continuous aerobic with pull buoy / paddles sets."
        ),
        focus="1.9 km swim confidence",
    )
    return [run, bike, swim]


async def recommend_session(db: AsyncSession, user_id: uuid.UUID) -> SessionRecommendationResponse:
    race_date = _parse_race_date()
    weeks = max(0, (race_date - date.today()).days // 7)
    phase = _phase_for_weeks(weeks)
    recovery, sleep_score, hrv_status = await _latest_recovery(db, user_id)
    volumes = await _sport_volume_7d(db, user_id)
    days_since = await _days_since_sport(db, user_id)

    # HIM emphasis: bike > run > swim for volume, but rotate neglected sports.
    need = {
        "cycling": days_since["cycling"] * 1.2 + (40 - min(volumes["cycling"], 40)) * 0.15,
        "running": days_since["running"] * 1.0 + (25 - min(volumes["running"], 25)) * 0.2,
        "swimming": days_since["swimming"] * 1.1 + (4 - min(volumes["swimming"], 4)) * 1.5,
    }
    if recovery < 45:
        need = {
            "swimming": need["swimming"] + 5,
            "cycling": need["cycling"] + 2,
            "running": need["running"],
        }
    if phase == "taper":
        need["running"] += 1
    if phase == "peak":
        need["cycling"] += 3

    recommended = max(need, key=need.get)

    reasons: list[str] = []
    if recovery < 45:
        reasons.append(f"Recovery is low ({recovery:.0f}/100), so intensity stays easy.")
    elif sleep_score is not None and sleep_score < 65:
        reasons.append(f"Sleep scored {sleep_score} — avoid a hard hammer session.")
    else:
        reasons.append(f"Recovery looks workable ({recovery:.0f}/100).")

    reasons.append(
        f"Last 7d mix: run {volumes['running']:.1f} km · ride {volumes['cycling']:.1f} km · "
        f"swim {volumes['swimming']:.1f} km."
    )
    reasons.append(
        f"{recommended.capitalize()} is the priority today "
        f"({days_since[recommended]}d since last, phase={phase}, {weeks}w to race)."
    )
    reason = " ".join(reasons)

    sessions = _build_sessions(phase, recovery, recommended)
    sessions = sorted(sessions, key=lambda s: 0 if s.sport == recommended else 1)

    if client and settings.openai_api_key:
        try:
            response = await client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a Half Ironman coach. Given recovery + recent training, "
                            "return JSON with keys: recommended_sport (running|cycling|swimming), "
                            "reason (2 short sentences), sessions (array of 3 objects with sport, title, "
                            "duration_min, intensity, description, focus). Keep sessions practical."
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "weeks_to_race": weeks,
                                "phase": phase,
                                "recovery_score": recovery,
                                "sleep_score": sleep_score,
                                "hrv_status": hrv_status,
                                "volume_7d_km": volumes,
                                "days_since": days_since,
                                "rule_recommended": recommended,
                                "draft_sessions": [s.model_dump() for s in sessions],
                            }
                        ),
                    },
                ],
                response_format={"type": "json_object"},
            )
            data = json.loads(response.choices[0].message.content or "{}")
            if data.get("recommended_sport") in ("running", "cycling", "swimming"):
                recommended = data["recommended_sport"]
            if data.get("reason"):
                reason = str(data["reason"])
            if isinstance(data.get("sessions"), list) and len(data["sessions"]) >= 3:
                parsed = [SportSession(**item) for item in data["sessions"][:3]]
                if {s.sport for s in parsed} >= {"running", "cycling", "swimming"}:
                    sessions = sorted(parsed, key=lambda s: 0 if s.sport == recommended else 1)
        except Exception:
            pass

    return SessionRecommendationResponse(
        race_name="Half Ironman",
        race_date=race_date,
        weeks_to_race=weeks,
        phase=phase,
        recovery_score=recovery,
        sleep_score=sleep_score,
        hrv_status=hrv_status,
        recommended_sport=recommended,
        reason=reason,
        sessions=sessions,
        recent_mix={k: round(v, 2) for k, v in volumes.items()},
    )
