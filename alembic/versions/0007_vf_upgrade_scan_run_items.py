"""vf_upgrade_scan_run_items table (detail par media d'un cycle de scan)

Revision ID: 0007_vf_upgrade_scan_run_items
Revises: 0006_vf_upgrade_scan_runs
Create Date: 2026-08-21
"""

import sqlalchemy as sa

from alembic import op

revision = "0007_vf_upgrade_scan_run_items"
down_revision = "0006_vf_upgrade_scan_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vf_upgrade_scan_run_items",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("vf_upgrade_scan_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_type", sa.String(), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("season_number", sa.Integer(), nullable=True),
        sa.Column("episode_number", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="running"),
        sa.Column("release_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_vf_upgrade_scan_run_items_run", "vf_upgrade_scan_run_items", ["run_id"])


def downgrade() -> None:
    op.drop_index("ix_vf_upgrade_scan_run_items_run", table_name="vf_upgrade_scan_run_items")
    op.drop_table("vf_upgrade_scan_run_items")
