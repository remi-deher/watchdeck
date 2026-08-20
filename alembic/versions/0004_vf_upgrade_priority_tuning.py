"""vf_upgrade_episodic_fallback_limit / vf_upgrade_episodic_fallback_days settings

Revision ID: 0004_vf_upgrade_priority_tuning
Revises: 0003_vf_upgrade_episodic_fallback
Create Date: 2026-08-20
"""

import sqlalchemy as sa

from alembic import op

revision = "0004_vf_upgrade_priority_tuning"
down_revision = "0003_vf_upgrade_episodic_fallback"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.add_column(
            sa.Column("vf_upgrade_episodic_fallback_limit", sa.Integer(), nullable=False, server_default="5")
        )
        batch_op.add_column(
            sa.Column("vf_upgrade_episodic_fallback_days", sa.Integer(), nullable=False, server_default="30")
        )


def downgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.drop_column("vf_upgrade_episodic_fallback_days")
        batch_op.drop_column("vf_upgrade_episodic_fallback_limit")
