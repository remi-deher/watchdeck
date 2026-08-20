"""vf_upgrade_episodic_fallback setting

Revision ID: 0003_vf_upgrade_episodic_fallback
Revises: 0002_playback_session_segments
Create Date: 2026-08-20
"""

import sqlalchemy as sa

from alembic import op

revision = "0003_vf_upgrade_episodic_fallback"
down_revision = "0002_playback_session_segments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.add_column(
            sa.Column("vf_upgrade_episodic_fallback", sa.Boolean(), nullable=False, server_default=sa.true())
        )


def downgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.drop_column("vf_upgrade_episodic_fallback")
