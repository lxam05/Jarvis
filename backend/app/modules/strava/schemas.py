from datetime import datetime

from pydantic import BaseModel, Field


class StravaStatusResponse(BaseModel):
    configured: bool
    connected: bool
    athlete_name: str | None = None
    last_synced_at: datetime | None = None
    activity_count: int = 0


class StravaConnectResponse(BaseModel):
    url: str


class StravaSyncResponse(BaseModel):
    activities_upserted: int
    last_synced_at: datetime


class ActivityDetailResponse(BaseModel):
    id: str
    strava_activity_id: int
    strava_url: str
    name: str | None
    sport: str | None
    sport_type: str | None
    start_at: datetime
    elapsed_seconds: int | None
    moving_seconds: int | None
    distance_m: float | None
    calories: int | None
    avg_hr: int | None
    max_hr: int | None
    avg_watts: float | None
    training_load: float | None
    ascent_m: float | None
    avg_speed_mps: float | None
    max_speed_mps: float | None
    route: list[list[float]] = Field(default_factory=list)
