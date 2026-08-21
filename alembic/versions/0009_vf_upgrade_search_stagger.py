"""vf_upgrade_search_stagger_ms setting

Revision ID: 0009_vf_upgrade_search_stagger
Revises: 0008_vf_upgrade_prioritize_continuing
Create Date: 2026-08-21
"""

import sqlalchemy as sa

from alembic import op

revision = "0009_vf_upgrade_search_stagger"
down_revision = "0008_vf_upgrade_prioritize_continuing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.add_column(
            sa.Column("vf_upgrade_search_stagger_ms", sa.Integer(), nullable=False, server_default="0")
        )


def downgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.drop_column("vf_upgrade_search_stagger_ms")
