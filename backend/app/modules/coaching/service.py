import json
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from fastapi import HTTPException, status
from openai import AsyncOpenAI
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import session_scope
from app.core.events import DomainEvent
from app.modules.coaching.models import CoachingInsight
from app.modules.coaching.schemas import (
    ActivitySummary,
    ChatMessage,
    CoachingContext,
    CoachingFlag,
    InsightOutput,
    SessionRecommendationResponse,
    SportSession,
)
from app.modules.core.models import UserSettings
from app.modules.garmin.models import GarminDailySummary, GarminHrv, GarminSleep
from app.modules.strava.models import StravaActivity

client = AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

SPORTS = ("running", "cycling", "swimming")


@dataclass
class RaceInfo:
    name: str | None
    race_date: date | None
    weeks_to_race: int | None
    phase: str


def _phase_for_weeks(weeks: int | None) -> str:
    if weeks is None:
        return "base"
    if weeks <= 0:
        return "race"
    if weeks <= 2:
        return "taper"
    if weeks <= 4:
        return "peak"
    if weeks <= 6:
        return "build"
    return "base"


async def get_race(db: AsyncSession, user_id: uuid.UUID) -> RaceInfo:
    """Upcoming race from Settings; a past or missing race means general base training."""
    user_settings = await db.get(UserSettings, user_id)
    race_date = user_settings.race_date if user_settings else None
    if race_date is None or race_date < date.today():
        return RaceInfo(name=None, race_date=None, weeks_to_race=None, phase="base")
    weeks = (race_date - date.today()).days // 7
    return RaceInfo(
        name=(user_settings.race_name or "Race"),
        race_date=race_date,
        weeks_to_race=weeks,
        phase=_phase_for_weeks(weeks),
    )


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
        select(func.coalesce(func.sum(StravaActivity.training_load), 0)).where(
            StravaActivity.user_id == user_id,
            StravaActivity.start_at >= week_start,
        )
    )
    training_load_7d = float(load_result.scalar_one() or 0)

    act_result = await db.execute(
        select(StravaActivity)
        .where(StravaActivity.user_id == user_id, StravaActivity.start_at >= start, StravaActivity.start_at < end)
        .order_by(StravaActivity.start_at.desc())
    )
    activities = [
        ActivitySummary(
            name=a.name,
            sport=a.sport,
            start_at=a.start_at,
            calories=a.calories,
            duration_seconds=a.moving_seconds or a.elapsed_seconds,
        )
        for a in act_result.scalars()
    ]

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

    # Strava relative effort: ~500/week is a big training week for most amateurs.
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
                        "You are an endurance coach. Given context and rule flags, produce 1-3 concise, "
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
    if event.name in ("garmin.synced", "strava.synced"):
        user_id = uuid.UUID(event.payload["user_id"])
        async with session_scope() as db:
            await regenerate_insights(db, user_id)


async def latest_recovery_rows(db: AsyncSession, user_id: uuid.UUID):
    """Newest sleep, daily summary and HRV rows on or before today.

    Garmin publishes these on different schedules (a day can have a summary but no
    sleep yet), so each comes from its own latest day instead of one shared day.
    Returns (sleep, daily, hrv, metrics_day) where metrics_day is the newest of them.
    """
    today = date.today()

    async def latest(model):
        result = await db.execute(
            select(model)
            .where(model.user_id == user_id, model.day <= today)
            .order_by(model.day.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    sleep = await latest(GarminSleep)
    daily = await latest(GarminDailySummary)
    hrv = await latest(GarminHrv)
    days = [row.day for row in (sleep, daily, hrv) if row is not None]
    metrics_day = max(days) if days else today
    return sleep, daily, hrv, metrics_day


async def _latest_recovery(db: AsyncSession, user_id: uuid.UUID) -> tuple[float, int | None, str | None]:
    sleep, daily, hrv, _ = await latest_recovery_rows(db, user_id)
    recovery = _compute_recovery_score(sleep, hrv, daily)
    return recovery, sleep.score if sleep else None, hrv.status if hrv else None


async def _sport_volume_7d(db: AsyncSession, user_id: uuid.UUID) -> dict[str, float]:
    since = datetime.now(UTC) - timedelta(days=7)
    result = await db.execute(
        select(StravaActivity.sport, StravaActivity.distance_m).where(
            StravaActivity.user_id == user_id,
            StravaActivity.start_at >= since,
        )
    )
    volumes = {s: 0.0 for s in SPORTS}
    for sport, distance_m in result.all():
        key = (sport or "").lower().strip()
        if key in volumes:
            volumes[key] += float(distance_m or 0) / 1000.0
    return volumes


async def _days_since_sport(db: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
    out = {s: 99 for s in SPORTS}
    for sport in out:
        result = await db.execute(
            select(StravaActivity.start_at)
            .where(StravaActivity.user_id == user_id, StravaActivity.sport == sport)
            .order_by(StravaActivity.start_at.desc())
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
    race = await get_race(db, user_id)
    phase = race.phase
    recovery, sleep_score, hrv_status = await _latest_recovery(db, user_id)
    volumes = await _sport_volume_7d(db, user_id)
    days_since = await _days_since_sport(db, user_id)

    # Triathlon emphasis: bike > run > swim for volume, but rotate neglected sports.
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
    race_bit = f"{race.weeks_to_race}w to {race.name}" if race.race_date else "no race set"
    reasons.append(
        f"{recommended.capitalize()} is the priority today "
        f"({days_since[recommended]}d since last, phase={phase}, {race_bit})."
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
                            "You are a triathlon coach. Given recovery + recent training, "
                            "return JSON with keys: recommended_sport (running|cycling|swimming), "
                            "reason (2 short sentences), sessions (array of 3 objects with sport, title, "
                            "duration_min, intensity, description, focus). Keep sessions practical."
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "race": race.name,
                                "weeks_to_race": race.weeks_to_race,
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
            if data.get("recommended_sport") in SPORTS:
                recommended = data["recommended_sport"]
            if data.get("reason"):
                reason = str(data["reason"])
            if isinstance(data.get("sessions"), list) and len(data["sessions"]) >= 3:
                parsed = [SportSession(**item) for item in data["sessions"][:3]]
                if {s.sport for s in parsed} >= set(SPORTS):
                    sessions = sorted(parsed, key=lambda s: 0 if s.sport == recommended else 1)
        except Exception:
            pass

    return SessionRecommendationResponse(
        race_name=race.name,
        race_date=race.race_date,
        weeks_to_race=race.weeks_to_race,
        phase=phase,
        recovery_score=recovery,
        sleep_score=sleep_score,
        hrv_status=hrv_status,
        recommended_sport=recommended,
        reason=reason,
        sessions=sessions,
        recent_mix={k: round(v, 2) for k, v in volumes.items()},
    )


COACH_SYSTEM_PROMPT = """You are the athlete's personal endurance coach (run, bike, swim / triathlon).
You get a JSON snapshot of their real data: Strava activities, weekly volume, and Garmin recovery
(sleep, HRV, body battery, resting HR). Answer their question using that data.

- Be specific: cite actual sessions, dates, distances, paces and trends from the snapshot.
- Be concise and practical. Use km, min/km for running, km/h for cycling, min/100m for swimming.
- If the data needed to answer is missing or stale, say so plainly instead of guessing.
- Give training advice, not medical diagnoses; suggest seeing a professional for pain or injury."""

CHAT_HISTORY_LIMIT = 20


def _pace_summary(a: StravaActivity) -> str | None:
    if not a.distance_m or not a.moving_seconds:
        return None
    km = float(a.distance_m) / 1000.0
    if km <= 0:
        return None
    if a.sport == "running":
        sec = a.moving_seconds / km
        return f"{int(sec // 60)}:{int(sec % 60):02d} min/km"
    if a.sport == "swimming":
        sec = a.moving_seconds / (km * 10)
        return f"{int(sec // 60)}:{int(sec % 60):02d} min/100m"
    return f"{km / (a.moving_seconds / 3600):.1f} km/h"


async def _coach_snapshot(db: AsyncSession, user_id: uuid.UUID) -> dict:
    today = date.today()
    race = await get_race(db, user_id)
    sleep, daily, hrv, metrics_day = await latest_recovery_rows(db, user_id)

    acts = await db.execute(
        select(StravaActivity)
        .where(StravaActivity.user_id == user_id)
        .order_by(StravaActivity.start_at.desc())
        .limit(30)
    )
    recent = [
        {
            "date": a.start_at.date().isoformat(),
            "sport": a.sport_type or a.sport,
            "name": a.name,
            "distance_km": round(float(a.distance_m) / 1000, 2) if a.distance_m else None,
            "moving_min": round(a.moving_seconds / 60) if a.moving_seconds else None,
            "pace_or_speed": _pace_summary(a),
            "elevation_m": round(float(a.elevation_gain_m)) if a.elevation_gain_m else None,
            "avg_hr": a.avg_hr,
            "max_hr": a.max_hr,
            "avg_watts": float(a.avg_watts) if a.avg_watts else None,
            "relative_effort": float(a.training_load) if a.training_load else None,
        }
        for a in acts.scalars()
    ]

    weeks = 12
    monday = today - timedelta(days=today.weekday())
    since = datetime.combine(monday - timedelta(weeks=weeks - 1), datetime.min.time(), tzinfo=UTC)
    vol = await db.execute(
        select(StravaActivity.sport, StravaActivity.start_at, StravaActivity.distance_m, StravaActivity.moving_seconds)
        .where(StravaActivity.user_id == user_id, StravaActivity.start_at >= since)
    )
    weekly: dict[str, dict] = {}
    for i in range(weeks):
        wk = (monday - timedelta(weeks=weeks - 1 - i)).isoformat()
        weekly[wk] = {"run_km": 0.0, "ride_km": 0.0, "swim_km": 0.0, "hours": 0.0, "sessions": 0}
    keys = {"running": "run_km", "cycling": "ride_km", "swimming": "swim_km"}
    for sport, start_at, distance_m, moving in vol.all():
        d = start_at.astimezone(UTC).date()
        wk = (d - timedelta(days=d.weekday())).isoformat()
        if wk not in weekly:
            continue
        row = weekly[wk]
        row["sessions"] += 1
        row["hours"] += (moving or 0) / 3600
        if sport in keys and distance_m:
            row[keys[sport]] += float(distance_m) / 1000
    weekly_volume = [
        {"week_of": wk, **{k: round(v, 1) if isinstance(v, float) else v for k, v in row.items()}}
        for wk, row in weekly.items()
    ]

    recovery_since = today - timedelta(days=14)
    sleep_rows = await db.execute(
        select(GarminSleep.day, GarminSleep.score, GarminSleep.total_seconds)
        .where(GarminSleep.user_id == user_id, GarminSleep.day >= recovery_since)
        .order_by(GarminSleep.day)
    )
    hrv_rows = await db.execute(
        select(GarminHrv.day, GarminHrv.last_night_avg_ms, GarminHrv.status)
        .where(GarminHrv.user_id == user_id, GarminHrv.day >= recovery_since)
    )
    daily_rows = await db.execute(
        select(GarminDailySummary.day, GarminDailySummary.rhr, GarminDailySummary.bb_max)
        .where(GarminDailySummary.user_id == user_id, GarminDailySummary.day >= recovery_since)
    )
    trend: dict[date, dict] = {}
    for day, score, total in sleep_rows.all():
        trend.setdefault(day, {})["sleep_score"] = score
        trend[day]["sleep_h"] = round(total / 3600, 1) if total else None
    for day, ms, hrv_status in hrv_rows.all():
        trend.setdefault(day, {}).update({"hrv_ms": ms, "hrv_status": hrv_status})
    for day, rhr, bb in daily_rows.all():
        trend.setdefault(day, {}).update({"rhr": rhr, "body_battery_max": bb})

    return {
        "today": today.isoformat(),
        "race": (
            {"name": race.name, "date": race.race_date.isoformat(), "weeks_to_go": race.weeks_to_race}
            if race.race_date
            else None
        ),
        "training_phase": race.phase,
        "recovery_latest": {
            "as_of": metrics_day.isoformat(),
            "recovery_score": round(_compute_recovery_score(sleep, hrv, daily)),
            "sleep_score": sleep.score if sleep else None,
            "hrv_ms": hrv.last_night_avg_ms if hrv else None,
            "hrv_status": hrv.status if hrv else None,
            "body_battery_min": daily.bb_min if daily else None,
            "resting_hr": daily.rhr if daily else None,
        },
        "recovery_last_14d": [{"day": d.isoformat(), **v} for d, v in sorted(trend.items())],
        "weekly_volume_last_12w": weekly_volume,
        "recent_activities": recent,
    }


async def chat_with_coach(db: AsyncSession, user_id: uuid.UUID, messages: list[ChatMessage]) -> str:
    if not (client and settings.openai_api_key):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Coach needs OPENAI_API_KEY set on the server")

    snapshot = await _coach_snapshot(db, user_id)
    response = await client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": COACH_SYSTEM_PROMPT},
            {"role": "system", "content": "Athlete data snapshot:\n" + json.dumps(snapshot, default=str)},
            *[{"role": m.role, "content": m.content} for m in messages[-CHAT_HISTORY_LIMIT:]],
        ],
    )
    return response.choices[0].message.content or ""
