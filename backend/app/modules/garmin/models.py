import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class GarminSyncRun(Base):
    __tablename__ = "garmin_sync_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False)
    records_upserted: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class GarminSyncCursor(Base):
    __tablename__ = "garmin_sync_cursors"

    source: Mapped[str] = mapped_column(String, primary_key=True)
    last_modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_external_id: Mapped[str | None] = mapped_column(String, nullable=True)


class GarminDailySummary(Base):
    __tablename__ = "garmin_daily_summaries"
    __table_args__ = (UniqueConstraint("user_id", "day"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    steps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    step_goal: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stress_avg: Mapped[int | None] = mapped_column(Integer, nullable=True)
    calories_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    calories_active: Mapped[int | None] = mapped_column(Integer, nullable=True)
    calories_bmr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bb_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bb_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bb_charged: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rhr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hr_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hr_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    distance_m: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    intensity_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GarminSleep(Base):
    __tablename__ = "garmin_sleep"
    __table_args__ = (UniqueConstraint("user_id", "day"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    deep_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    light_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rem_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    awake_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_spo2: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    avg_stress: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    raw: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GarminHrv(Base):
    __tablename__ = "garmin_hrv"
    __table_args__ = (UniqueConstraint("user_id", "day"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    weekly_avg_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_night_avg_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_night_5min_high_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    baseline_low_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    baseline_upper_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str | None] = mapped_column(String, nullable=True)
    raw: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GarminActivity(Base):
    __tablename__ = "garmin_activities"
    __table_args__ = (UniqueConstraint("user_id", "garmin_activity_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    garmin_activity_id: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    sport: Mapped[str | None] = mapped_column(String, nullable=True)
    sub_sport: Mapped[str | None] = mapped_column(String, nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    elapsed_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    moving_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    distance_m: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    calories: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    training_load: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    training_effect: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    route: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    raw: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GarminWeight(Base):
    __tablename__ = "garmin_weight"
    __table_args__ = (UniqueConstraint("user_id", "measured_at", "source"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False, default="garmin")
    raw: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
