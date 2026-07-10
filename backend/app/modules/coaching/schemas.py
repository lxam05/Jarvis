from datetime import date, datetime, timedelta
from decimal import Decimal

from pydantic import BaseModel


class ActivitySummary(BaseModel):
    name: str | None
    sport: str | None
    start_at: datetime
    calories: int | None
    duration_seconds: int | None


class CoachingContext(BaseModel):
    date: date
    sleep_score: int | None = None
    hrv_status: str | None = None
    hrv_last_night: int | None = None
    body_battery_min: int | None = None
    stress_avg: int | None = None
    training_load_7d: float = 0
    activities_today: list[ActivitySummary] = []
    calories_consumed: int = 0
    calories_goal: int | None = None
    protein_consumed_g: float = 0
    protein_goal_g: int | None = None
    weight_trend_7d: list[float] = []
    recovery_score: float = 50.0


class CoachingFlag(BaseModel):
    category: str
    severity: str
    code: str
    message: str
    data: dict | None = None


class InsightOutput(BaseModel):
    category: str
    severity: str
    title: str
    body: str
