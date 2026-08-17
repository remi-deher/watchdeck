"""playback_session_segments

Revision ID: 0002_playback_session_segments
Revises: 0001_initial_schema
Create Date: 2026-08-18
"""

import sqlalchemy as sa

from alembic import op

revision = "0002_playback_session_segments"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "playback_session_segments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(), nullable=False, server_default="playing"),
        sa.Column("playback_method", sa.String(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("duration_ms", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("view_offset_start_ms", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("view_offset_end_ms", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["playback_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_playback_session_segments_session_id", "playback_session_segments", ["session_id"])
    op.create_index("ix_playback_session_segments_started_at", "playback_session_segments", ["started_at"])


def downgrade() -> None:
    op.drop_index("ix_playback_session_segments_started_at", table_name="playback_session_segments")
    op.drop_index("ix_playback_session_segments_session_id", table_name="playback_session_segments")
    op.drop_table("playback_session_segments")
