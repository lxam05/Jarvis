import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class StravaConnection(Base):
    __tablename__ = "strava_connections"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    athlete_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    athlete_name: Mapped[str | None] = mapped_column(String, nullable=True)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    scope: Mapped[str | None] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class StravaActivity(Base):
    __tablename__ = "strava_activities"
    __table_args__ = (UniqueConstraint("user_id", "strava_activity_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    strava_activity_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    # Normalised to running / cycling / swimming where possible; sport_type keeps Strava's value.
    sport: Mapped[str | None] = mapped_column(String, nullable=True)
    sport_type: Mapped[str | None] = mapped_column(String, nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    elapsed_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    moving_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    distance_m: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    elevation_gain_m: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    calories: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_watts: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    # Strava "relative effort" (suffer_score) — used as the training load signal.
    training_load: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    route: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    raw: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
