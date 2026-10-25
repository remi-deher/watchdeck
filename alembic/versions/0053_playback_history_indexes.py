"""Index de performance pour l'historique des lectures."""

import sqlalchemy as sa
from alembic import op

revision = "0053_playback_history_indexes"
down_revision = "0052_library_performance_indexes"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index(
        "ix_playback_sessions_history_recent",
        "playback_sessions",
        [sa.text("started_at DESC"), sa.text("id DESC")],
        postgresql_where=sa.text("ended_at IS NOT NULL"),
    )


def downgrade():
    op.drop_index("ix_playback_sessions_history_recent", table_name="playback_sessions")
