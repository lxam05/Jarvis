from datetime import date, datetime

from pydantic import BaseModel, Field


class RecoveryCard(BaseModel):
    sleep_score: int | None = None
    sleep_hours: float | None = None
    hrv_ms: int | None = None
    hrv_status: str | None = None
    body_battery_min: int | None = None
    body_battery_max: int | None = None
    stress_avg: int | None = None
    recovery_score: float = 50.0


class TrainingCard(BaseModel):
    activities_today: list[dict] = Field(default_factory=list)
    weekly_load: float = 0
    weekly_activities: int = 0


class StreakCard(BaseModel):
    training_streak_days: int = 0


class InsightCard(BaseModel):
    title: str
    body: str
    category: str
    severity: str


class PillarScore(BaseModel):
    score: float
    label: str
    detail: str


class RaceReadinessCard(BaseModel):
    overall: float
    status: str
    weeks_to_race: int | None = None
    phase: str
    race_name: str | None = None
    race_date: date | None = None
    readiness: PillarScore
    training: PillarScore
    summary: str


class DashboardTodayResponse(BaseModel):
    date: date
    recovery: RecoveryCard
    training: TrainingCard
    streaks: StreakCard
    recent_activities: list[dict] = Field(default_factory=list)
    insights: list[InsightCard] = Field(default_factory=list)
    last_garmin_sync: datetime | None = None
    last_strava_sync: datetime | None = None
    # Day the recovery metrics came from when today's Garmin summary is not downloaded yet.
    garmin_metrics_as_of: date | None = None
    readiness: RaceReadinessCard | None = None


class WeeklySportDistancePoint(BaseModel):
    week_start: date
    label: str
    running_km: float = 0
    cycling_km: float = 0
    swimming_km: float = 0


class WeeklySportDistanceResponse(BaseModel):
    weeks: list[WeeklySportDistancePoint]

