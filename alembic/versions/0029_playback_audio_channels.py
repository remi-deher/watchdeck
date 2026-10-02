"""Canaux audio ecoutes, detail de la conversion, numeros de saison et d'episode

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
        batch_op.add_column(sa.Column("transcode_details", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("season_number", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("episode_number", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("stream_details", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("is_download", sa.Boolean(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("playback_sessions") as batch_op:
        batch_op.drop_column("is_download")
        batch_op.drop_column("stream_details")
        batch_op.drop_column("episode_number")
        batch_op.drop_column("season_number")
        batch_op.drop_column("transcode_details")
        batch_op.drop_column("audio_channels")
