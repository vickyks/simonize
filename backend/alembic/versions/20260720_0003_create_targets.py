"""create targets

Revision ID: 20260720_0003
Revises: 20260712_0002
Create Date: 2026-07-20 00:03:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260720_0003"
down_revision: str | None = "20260712_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "targets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("value", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "type", name="uq_targets_user_type"),
    )
    op.create_index("ix_targets_user_id", "targets", ["user_id"])
    op.create_index("ix_targets_type", "targets", ["type"])


def downgrade() -> None:
    op.drop_index("ix_targets_type", table_name="targets")
    op.drop_index("ix_targets_user_id", table_name="targets")
    op.drop_table("targets")
