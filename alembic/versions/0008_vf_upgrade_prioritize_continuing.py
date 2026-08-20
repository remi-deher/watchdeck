"""vf_upgrade_prioritize_continuing setting

Revision ID: 0008_vf_upgrade_prioritize_continuing
Revises: 0007_vf_upgrade_scan_run_items
Create Date: 2026-08-21
"""

import sqlalchemy as sa

from alembic import op

revision = "0008_vf_upgrade_prioritize_continuing"
down_revision = "0007_vf_upgrade_scan_run_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.add_column(
            sa.Column("vf_upgrade_prioritize_continuing", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.drop_column("vf_upgrade_prioritize_continuing")
