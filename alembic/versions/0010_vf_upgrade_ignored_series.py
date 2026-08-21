"""vf_upgrade_ignored_series table

Revision ID: 0010_vf_upgrade_ignored_series
Revises: 0009_vf_upgrade_search_stagger
Create Date: 2026-08-21
"""

import sqlalchemy as sa

from alembic import op

revision = "0010_vf_upgrade_ignored_series"
down_revision = "0009_vf_upgrade_search_stagger"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vf_upgrade_ignored_series",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.String(), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("ignored_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_type", "source_id", name="uq_vf_upgrade_ignored_series"),
    )


def downgrade() -> None:
    op.drop_table("vf_upgrade_ignored_series")
