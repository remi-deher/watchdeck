"""Canaux de la piste audio ecoutee, pour situer la raison de Plex

Revision ID: 0029_playback_audio_channels
Revises: 0028_playback_transcode_reason
Create Date: 2026-09-27
"""

import sqlalchemy as sa

from alembic import op

revision = "0029_playback_audio_channels"
down_revision = "0028_playback_transcode_reason"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("playback_sessions") as batch_op:
        batch_op.add_column(sa.Column("audio_channels", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("playback_sessions") as batch_op:
        batch_op.drop_column("audio_channels")
