from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from pydantic import BaseModel, Field


class MacroSummary(BaseModel):
    calories: int = 0
    protein_g: float = 0
    carbs_g: float = 0
    fat_g: float = 0
    calorie_goal: int | None = None
    protein_goal_g: int | None = None
    calories_remaining: int | None = None
    protein_remaining_g: float | None = None


class WeightCard(BaseModel):
    current_kg: float | None = None
    goal_kg: float | None = None
    weekly_change_kg: float | None = None
    trend_7d: list[float] = Field(default_factory=list)


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
    total_calories_burned_today: int = 0


class StreakCard(BaseModel):
    logging_streak_days: int = 0
    training_streak_days: int = 0


class GoalsCard(BaseModel):
    calorie_goal: int | None = None
    protein_goal_g: int | None = None
    step_goal: int | None = None
    steps_today: int | None = None


class InsightCard(BaseModel):
    title: str
    body: str
    category: str
    severity: str


class DashboardTodayResponse(BaseModel):
    date: date
    macros: MacroSummary
    weight: WeightCard
    recovery: RecoveryCard
    training: TrainingCard
    streaks: StreakCard
    goals: GoalsCard
    recent_activities: list[dict] = Field(default_factory=list)
    insights: list[InsightCard] = Field(default_factory=list)
    last_garmin_sync: datetime | None = None
    calories_burned: int = 0
    # Day sleep/steps/burn came from when today's Garmin summary is not downloaded yet.
    garmin_metrics_as_of: date | None = None


class WeightTrendPoint(BaseModel):
    date: date
    weight_kg: float


class WeightTrendResponse(BaseModel):
    points: list[WeightTrendPoint]


class WeeklyTrainingResponse(BaseModel):
    days: list[dict]
