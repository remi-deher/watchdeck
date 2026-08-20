"""vf_upgrade_no_result_backoff_base_hours / vf_upgrade_no_result_backoff_max_hours settings

Revision ID: 0005_vf_upgrade_no_result_backoff
Revises: 0004_vf_upgrade_priority_tuning
Create Date: 2026-08-20
"""

import sqlalchemy as sa

from alembic import op

revision = "0005_vf_upgrade_no_result_backoff"
down_revision = "0004_vf_upgrade_priority_tuning"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.add_column(
            sa.Column("vf_upgrade_no_result_backoff_base_hours", sa.Integer(), nullable=False, server_default="6")
        )
        batch_op.add_column(
            sa.Column("vf_upgrade_no_result_backoff_max_hours", sa.Integer(), nullable=False, server_default="48")
        )


def downgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.drop_column("vf_upgrade_no_result_backoff_max_hours")
        batch_op.drop_column("vf_upgrade_no_result_backoff_base_hours")
