"""create observations

Revision ID: 20260712_0002
Revises: 20260704_0001
Create Date: 2026-07-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260712_0002"
down_revision: str | None = "20260704_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "observations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "date", "type", name="uq_observations_user_date_type"
        ),
    )
    op.create_index("ix_observations_user_id", "observations", ["user_id"])
    op.create_index("ix_observations_date", "observations", ["date"])
    op.create_index("ix_observations_type", "observations", ["type"])


def downgrade() -> None:
    op.drop_index("ix_observations_type", table_name="observations")
    op.drop_index("ix_observations_date", table_name="observations")
    op.drop_index("ix_observations_user_id", table_name="observations")
    op.drop_table("observations")
