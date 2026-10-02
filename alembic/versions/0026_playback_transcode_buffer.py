"""Tampon, vitesse et bridage du transcodage des sessions Plex

Revision ID: 0026_playback_transcode_buffer
Revises: 0025_notification_log_reason
Create Date: 2026-09-24
"""

import sqlalchemy as sa

from alembic import op

revision = "0026_playback_transcode_buffer"
down_revision = "0025_notification_log_reason"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("playback_sessions") as batch_op:
        batch_op.add_column(sa.Column("transcode_buffer_ms", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("transcode_speed", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("transcode_throttled", sa.Boolean(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("playback_sessions") as batch_op:
        batch_op.drop_column("transcode_throttled")
        batch_op.drop_column("transcode_speed")
        batch_op.drop_column("transcode_buffer_ms")
