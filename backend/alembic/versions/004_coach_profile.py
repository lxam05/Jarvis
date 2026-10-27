"""Athlete sports and coach profile on user settings

Revision ID: 004
Revises: 003
Create Date: 2026-10-27
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_settings", sa.Column("sports", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("user_settings", sa.Column("coach_profile", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("user_settings", "coach_profile")
    op.drop_column("user_settings", "sports")
