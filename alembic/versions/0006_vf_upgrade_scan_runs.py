"""vf_upgrade_scan_runs table (historique des cycles de scan)

Revision ID: 0006_vf_upgrade_scan_runs
Revises: 0005_vf_upgrade_no_result_backoff
Create Date: 2026-08-20
"""

import sqlalchemy as sa

from alembic import op

revision = "0006_vf_upgrade_scan_runs"
down_revision = "0005_vf_upgrade_no_result_backoff"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vf_upgrade_scan_runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="running"),
        sa.Column("trigger", sa.String(), nullable=False, server_default="auto"),
        sa.Column("tasks_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tasks_scanned", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("suggestions_found", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
    )
    op.create_index("ix_vf_upgrade_scan_runs_started_at", "vf_upgrade_scan_runs", ["started_at"])


def downgrade() -> None:
    op.drop_index("ix_vf_upgrade_scan_runs_started_at", table_name="vf_upgrade_scan_runs")
    op.drop_table("vf_upgrade_scan_runs")
