"""Strava connection + activities; race goal on user settings

Revision ID: 003
Revises: 002
Create Date: 2026-10-26
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "strava_connections",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("athlete_id", sa.BigInteger(), nullable=False),
        sa.Column("athlete_name", sa.String(), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("scope", sa.String(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "strava_activities",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("strava_activity_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("sport", sa.String(), nullable=True),
        sa.Column("sport_type", sa.String(), nullable=True),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("elapsed_seconds", sa.Integer(), nullable=True),
        sa.Column("moving_seconds", sa.Integer(), nullable=True),
        sa.Column("distance_m", sa.Numeric(), nullable=True),
        sa.Column("elevation_gain_m", sa.Numeric(), nullable=True),
        sa.Column("calories", sa.Integer(), nullable=True),
        sa.Column("avg_hr", sa.Integer(), nullable=True),
        sa.Column("max_hr", sa.Integer(), nullable=True),
        sa.Column("avg_watts", sa.Numeric(), nullable=True),
        sa.Column("training_load", sa.Numeric(), nullable=True),
        sa.Column("route", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("raw", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "strava_activity_id"),
    )
    op.create_index("ix_strava_activities_user_start", "strava_activities", ["user_id", "start_at"])

    op.add_column("user_settings", sa.Column("race_name", sa.String(), nullable=True))
    op.add_column("user_settings", sa.Column("race_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("user_settings", "race_date")
    op.drop_column("user_settings", "race_name")
    op.drop_index("ix_strava_activities_user_start", table_name="strava_activities")
    op.drop_table("strava_activities")
    op.drop_table("strava_connections")
