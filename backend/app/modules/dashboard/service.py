from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.coaching.models import CoachingInsight
from app.modules.coaching.service import (
    RaceInfo,
    _compute_recovery_score,
    get_athlete,
    get_race,
    latest_recovery_rows,
)
from app.modules.dashboard.schemas import (
    DashboardTodayResponse,
    InsightCard,
    PillarScore,
    RaceReadinessCard,
    RecoveryCard,
    StreakCard,
    TrainingCard,
    WeeklySportDistancePoint,
    WeeklySportDistanceResponse,
)
from app.modules.garmin.models import GarminSyncRun
from app.modules.strava.models import StravaActivity, StravaConnection
from app.modules.strava.service import activity_summary


async def get_dashboard_today(db, user_id) -> DashboardTodayResponse:
    today = date.today()
    start = datetime.combine(today, datetime.min.time(), tzinfo=UTC)
    end = start + timedelta(days=1)

    # Prefer today's Garmin rows; if Connect hasn't published today's downloadable
    # summary yet, fall back to the latest day we have so recovery still shows.
    sleep, daily, hrv, metrics_day = await latest_recovery_rows(db, user_id)
    recovery = RecoveryCard(
        sleep_score=sleep.score if sleep else None,
        sleep_hours=round(sleep.total_seconds / 3600, 1) if sleep and sleep.total_seconds else None,
        hrv_ms=hrv.last_night_avg_ms if hrv else None,
        hrv_status=hrv.status if hrv else None,
        body_battery_min=daily.bb_min if daily else None,
        body_battery_max=daily.bb_max if daily else None,
        stress_avg=daily.stress_avg if daily else None,
        recovery_score=_compute_recovery_score(sleep, hrv, daily),
    )

    week_start = start - timedelta(days=7)
    week_acts = await db.execute(
        select(func.count(StravaActivity.id), func.coalesce(func.sum(StravaActivity.training_load), 0)).where(
            StravaActivity.user_id == user_id,
            StravaActivity.start_at >= week_start,
            StravaActivity.start_at < end,
        )
    )
    week_row = week_acts.one()

    today_acts = await db.execute(
        select(StravaActivity)
        .where(
            StravaActivity.user_id == user_id,
            StravaActivity.start_at >= start,
            StravaActivity.start_at < end,
        )
        .order_by(StravaActivity.start_at.desc())
    )

    training = TrainingCard(
        activities_today=[activity_summary(a) for a in today_acts.scalars()],
        weekly_load=float(week_row[1] or 0),
        weekly_activities=int(week_row[0] or 0),
    )

    recent = await db.execute(
        select(StravaActivity)
        .where(StravaActivity.user_id == user_id)
        .order_by(StravaActivity.start_at.desc())
        .limit(40)
    )
    recent_activities = [activity_summary(a) for a in recent.scalars()]

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
    strava = await db.get(StravaConnection, user_id)

    race = await get_race(db, user_id)
    readiness = await _compute_readiness(
        db,
        user_id,
        race=race,
        recovery_score=recovery.recovery_score,
        weekly_activities=training.weekly_activities,
    )

    return DashboardTodayResponse(
        date=today,
        recovery=recovery,
        training=training,
        streaks=StreakCard(training_streak_days=await _training_streak(db, user_id, today)),
        recent_activities=recent_activities,
        insights=insights,
        last_garmin_sync=last_sync.finished_at if last_sync else None,
        last_strava_sync=strava.last_synced_at if strava else None,
        garmin_metrics_as_of=metrics_day if metrics_day != today else None,
        readiness=readiness,
    )


def _monday_on_or_before(d: date) -> date:
    return d - timedelta(days=(d.weekday()))  # Monday=0


async def get_weekly_sport_distance(
    db: AsyncSession, user_id, weeks: int = 8
) -> WeeklySportDistanceResponse:
    today = date.today()
    this_monday = _monday_on_or_before(today)
    range_start = this_monday - timedelta(weeks=weeks - 1)
    start_dt = datetime.combine(range_start, datetime.min.time(), tzinfo=UTC)
    end_dt = datetime.combine(this_monday + timedelta(days=7), datetime.min.time(), tzinfo=UTC)

    result = await db.execute(
        select(StravaActivity.sport, StravaActivity.start_at, StravaActivity.distance_m).where(
            StravaActivity.user_id == user_id,
            StravaActivity.start_at >= start_dt,
            StravaActivity.start_at < end_dt,
        )
    )

    buckets: dict[date, dict[str, float]] = {
        this_monday - timedelta(weeks=i): {"running": 0.0, "cycling": 0.0, "swimming": 0.0}
        for i in range(weeks - 1, -1, -1)
    }

    for sport, start_at, distance_m in result.all():
        if distance_m is None:
            continue
        sport_key = (sport or "").lower().strip()
        if sport_key not in ("running", "cycling", "swimming"):
            continue
        week_start = _monday_on_or_before(start_at.astimezone(UTC).date())
        if week_start not in buckets:
            continue
        buckets[week_start][sport_key] += float(distance_m) / 1000.0

    points = [
        WeeklySportDistancePoint(
            week_start=week_start,
            label=week_start.strftime("%d %b"),
            running_km=round(vals["running"], 2),
            cycling_km=round(vals["cycling"], 2),
            swimming_km=round(vals["swimming"], 2),
        )
        for week_start, vals in buckets.items()
    ]
    return WeeklySportDistanceResponse(weeks=points)


def _weekly_volume_targets(phase: str, sports: list[str]) -> dict[str, float]:
    """Soft weekly km targets by training phase, for the sports the athlete trains."""
    if sports == ["running"]:
        # Half-marathon style build: peak around 40 km, short taper.
        run_only = {"base": 30.0, "build": 35.0, "peak": 40.0, "taper": 20.0, "race": 10.0}
        return {"running": run_only.get(phase, 30.0)}
    targets = {
        "base": {"running": 25.0, "cycling": 80.0, "swimming": 3.0},
        "build": {"running": 35.0, "cycling": 120.0, "swimming": 4.0},
        "peak": {"running": 40.0, "cycling": 150.0, "swimming": 5.0},
        "taper": {"running": 18.0, "cycling": 50.0, "swimming": 2.5},
        "race": {"running": 8.0, "cycling": 20.0, "swimming": 1.5},
    }
    chosen = targets.get(phase, targets["base"])
    return {sport: km for sport, km in chosen.items() if sport in sports}


def _pillar_label(score: float) -> str:
    if score >= 80:
        return "Strong"
    if score >= 65:
        return "Good"
    if score >= 45:
        return "Okay"
    return "Needs work"


def _overall_status(score: float) -> str:
    if score >= 80:
        return "on_track"
    if score >= 65:
        return "solid"
    if score >= 45:
        return "caution"
    return "off_track"


async def _week_sport_km(db: AsyncSession, user_id) -> dict[str, float]:
    today = date.today()
    monday = _monday_on_or_before(today)
    start_dt = datetime.combine(monday, datetime.min.time(), tzinfo=UTC)
    end_dt = datetime.combine(monday + timedelta(days=7), datetime.min.time(), tzinfo=UTC)
    result = await db.execute(
        select(StravaActivity.sport, StravaActivity.distance_m).where(
            StravaActivity.user_id == user_id,
            StravaActivity.start_at >= start_dt,
            StravaActivity.start_at < end_dt,
        )
    )
    volumes = {"running": 0.0, "cycling": 0.0, "swimming": 0.0}
    for sport, distance_m in result.all():
        key = (sport or "").lower().strip()
        if key in volumes and distance_m is not None:
            volumes[key] += float(distance_m) / 1000.0
    return volumes


async def _compute_readiness(
    db: AsyncSession,
    user_id,
    *,
    race: RaceInfo,
    recovery_score: float,
    weekly_activities: int,
) -> RaceReadinessCard:
    phase = race.phase

    readiness_score = float(max(0.0, min(100.0, recovery_score)))
    readiness = PillarScore(
        score=round(readiness_score, 1),
        label=_pillar_label(readiness_score),
        detail=f"Recovery {readiness_score:.0f}/100 from sleep · HRV · body battery",
    )

    volumes = await _week_sport_km(db, user_id)
    athlete = await get_athlete(db, user_id)
    targets = _weekly_volume_targets(phase, athlete.sports)
    sport_scores = []
    for sport, target in targets.items():
        actual = volumes[sport]
        sport_scores.append(min(100.0, (actual / target) * 100.0) if target > 0 else 0.0)
    volume_score = sum(sport_scores) / len(sport_scores) if sport_scores else 0.0
    # Target ~5 quality sessions / week in build; fewer in taper
    session_target = 3 if phase in ("taper", "race") else 5
    session_score = min(100.0, (weekly_activities / session_target) * 100.0)
    training_score = volume_score * 0.7 + session_score * 0.3
    training = PillarScore(
        score=round(training_score, 1),
        label=_pillar_label(training_score),
        detail=(
            ", ".join(f"{sport} {volumes[sport]:.0f} of {target:.0f} km" for sport, target in targets.items())
            + f" this week, {weekly_activities} sessions"
        ),
    )

    overall = (readiness_score + training_score) / 2.0
    status = _overall_status(overall)
    status_copy = {
        "on_track": "On track.",
        "solid": "Solid — a few gaps to close.",
        "caution": "Caution — recovery or volume needs attention.",
        "off_track": "Off track — prioritize the weakest pillar today.",
    }[status]
    weakest = "recovery" if readiness_score < training_score else "training volume"
    when = f"{race.days_to_race} days to {race.name} ({phase})" if race.race_date else "No race set (base)"
    summary = f"{status_copy} {when}. Weakest today: {weakest}."

    return RaceReadinessCard(
        overall=round(overall, 1),
        status=status,
        weeks_to_race=race.weeks_to_race,
        phase=phase,
        race_name=race.name,
        race_date=race.race_date,
        readiness=readiness,
        training=training,
        summary=summary,
    )


async def _training_streak(db: AsyncSession, user_id, anchor: date | None = None) -> int:
    streak = 0
    d = anchor or date.today()
    while True:
        start = datetime.combine(d, datetime.min.time(), tzinfo=UTC)
        end = start + timedelta(days=1)
        result = await db.execute(
            select(func.count(StravaActivity.id)).where(
                StravaActivity.user_id == user_id, StravaActivity.start_at >= start, StravaActivity.start_at < end
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
