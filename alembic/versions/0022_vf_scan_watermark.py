"""Filigrane du scan VF incremental

Revision ID: 0022_vf_scan_watermark
Revises: 0021_vf_upgrade_lifecycle
Create Date: 2026-09-14
"""

import sqlalchemy as sa

from alembic import op

revision = "0022_vf_scan_watermark"
down_revision = "0021_vf_upgrade_lifecycle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.add_column(sa.Column("vf_scan_last_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.drop_column("vf_scan_last_at")
