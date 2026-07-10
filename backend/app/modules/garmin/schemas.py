from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class DailySummaryDTO(BaseModel):
    day: date
    steps: int | None = None
    step_goal: int | None = None
    stress_avg: int | None = None
    calories_total: int | None = None
    calories_active: int | None = None
    calories_bmr: int | None = None
    bb_min: int | None = None
    bb_max: int | None = None
    bb_charged: int | None = None
    rhr: int | None = None
    hr_min: int | None = None
    hr_max: int | None = None
    distance_m: Decimal | None = None
    intensity_seconds: int | None = None
    raw: dict[str, Any] | None = None


class SleepDTO(BaseModel):
    day: date
    start_at: datetime | None = None
    end_at: datetime | None = None
    total_seconds: int | None = None
    deep_seconds: int | None = None
    light_seconds: int | None = None
    rem_seconds: int | None = None
    awake_seconds: int | None = None
    score: int | None = None
    avg_spo2: Decimal | None = None
    avg_stress: Decimal | None = None
    raw: dict[str, Any] | None = None


class HrvDTO(BaseModel):
    day: date
    weekly_avg_ms: int | None = None
    last_night_avg_ms: int | None = None
    last_night_5min_high_ms: int | None = None
    baseline_low_ms: int | None = None
    baseline_upper_ms: int | None = None
    status: str | None = None
    raw: dict[str, Any] | None = None


class ActivityDTO(BaseModel):
    garmin_activity_id: str
    name: str | None = None
    sport: str | None = None
    sub_sport: str | None = None
    start_at: datetime
    elapsed_seconds: int | None = None
    moving_seconds: int | None = None
    distance_m: Decimal | None = None
    calories: int | None = None
    avg_hr: int | None = None
    max_hr: int | None = None
    training_load: Decimal | None = None
    training_effect: Decimal | None = None
    raw: dict[str, Any] | None = None


class WeightDTO(BaseModel):
    measured_at: datetime
    weight_kg: Decimal
    raw: dict[str, Any] | None = None


class GarminSyncBatch(BaseModel):
    daily_summaries: list[DailySummaryDTO] = Field(default_factory=list)
    sleep: list[SleepDTO] = Field(default_factory=list)
    hrv: list[HrvDTO] = Field(default_factory=list)
    activities: list[ActivityDTO] = Field(default_factory=list)
    weight: list[WeightDTO] = Field(default_factory=list)


class GarminSyncRequest(BaseModel):
    agent_version: str = "1.0.0"
    cursors: dict[str, datetime | None] = Field(default_factory=dict)
    batch: GarminSyncBatch


class GarminSyncResponse(BaseModel):
    sync_run_id: str
    status: str
    records_upserted: dict[str, int]
    cursors: dict[str, datetime | None]


class GarminSyncStatusResponse(BaseModel):
    last_sync_at: datetime | None
    last_status: str | None
    records_upserted: dict[str, int] | None
    cursors: dict[str, datetime | None]
