"""Raison du transcodage : deduite des sessions et relue dans les journaux Plex

Revision ID: 0028_playback_transcode_reason
Revises: 0027_unwrap_stored_proxy_posters
Create Date: 2026-09-26
"""

import sqlalchemy as sa

from alembic import op

revision = "0028_playback_transcode_reason"
down_revision = "0027_unwrap_stored_proxy_posters"
branch_labels = None
depends_on = None

_COLUMNS = (
    ("transcode_session", sa.String()),
    ("transcode_reason", sa.Text()),
    ("transcode_hw", sa.String()),
    ("plex_decision_code", sa.Integer()),
    ("plex_decision_text", sa.Text()),
    ("plex_decision_details", sa.Text()),
)


def upgrade() -> None:
    with op.batch_alter_table("playback_sessions") as batch_op:
        for name, type_ in _COLUMNS:
            batch_op.add_column(sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("playback_sessions") as batch_op:
        for name, _ in reversed(_COLUMNS):
            batch_op.drop_column(name)
