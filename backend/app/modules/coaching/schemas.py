from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


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


class SportSession(BaseModel):
    sport: str
    title: str
    duration_min: int
    intensity: str
    description: str
    focus: str


class SessionRecommendationResponse(BaseModel):
    race_name: str | None = None
    race_date: date | None = None
    weeks_to_race: int | None = None
    phase: str
    recovery_score: float
    sleep_score: int | None = None
    hrv_status: str | None = None
    recommended_sport: str
    reason: str
    sessions: list[SportSession]
    recent_mix: dict[str, float] = {}



class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class CoachChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)


class CoachChatResponse(BaseModel):
    reply: str
