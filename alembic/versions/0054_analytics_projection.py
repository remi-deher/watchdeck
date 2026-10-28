"""Versioned analytics projection and incremental playback contributions."""

import sqlalchemy as sa

from alembic import op

revision = "0054_analytics_projection"
down_revision = "0053_playback_history_indexes"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE analytics_generations (
            id VARCHAR NOT NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
            generated_at VARCHAR NOT NULL,
            catalog_fingerprint TEXT,
            format_version INTEGER NOT NULL,
            summary JSONB NOT NULL,
            PRIMARY KEY (id)
        )
    """)
    op.execute("""
        CREATE INDEX ix_analytics_generations_created_at ON analytics_generations (created_at)
    """)
    op.execute("""
        CREATE TABLE analytics_items (
            generation_id VARCHAR NOT NULL,
            ordinal INTEGER NOT NULL,
            rating_key TEXT NOT NULL,
            data JSONB NOT NULL,
            search_text TEXT NOT NULL,
            sort_title TEXT NOT NULL,
            sort_library TEXT NOT NULL,
            sort_studio TEXT NOT NULL,
            sort_container TEXT NOT NULL,
            sort_viewer TEXT NOT NULL,
            sort_video_codec TEXT NOT NULL,
            sort_audio_codec TEXT NOT NULL,
            size_bytes BIGINT NOT NULL,
            duration_ms BIGINT NOT NULL,
            play_count INTEGER NOT NULL,
            watch_time_ms BIGINT NOT NULL,
            video_rank INTEGER NOT NULL,
            audio_track_count INTEGER NOT NULL,
            subtitle_count INTEGER,
            last_viewed_at TEXT NOT NULL,
            PRIMARY KEY (generation_id, ordinal),
            FOREIGN KEY(generation_id) REFERENCES analytics_generations (id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        CREATE INDEX ix_analytics_data ON analytics_items USING gin (data jsonb_path_ops)
    """)
    op.execute("""
        CREATE INDEX ix_analytics_plays ON analytics_items (generation_id, play_count DESC, ordinal)
    """)
    op.execute("""
        CREATE INDEX ix_analytics_rating ON analytics_items (generation_id, rating_key)
    """)
    op.execute("""
        CREATE INDEX ix_analytics_size ON analytics_items (generation_id, size_bytes DESC, ordinal)
    """)
    op.execute("""
        CREATE INDEX ix_analytics_title ON analytics_items (generation_id, sort_title COLLATE "C", ordinal)
    """)
    op.execute("""
        CREATE TABLE analytics_playback (
            session_id INTEGER NOT NULL,
            rating_key TEXT,
            title TEXT,
            grandparent_title TEXT,
            user_name TEXT,
            watched_ms BIGINT,
            progress_ms BIGINT,
            started_at TIMESTAMP WITHOUT TIME ZONE,
            last_seen_at TIMESTAMP WITHOUT TIME ZONE,
            player_title TEXT,
            product TEXT,
            platform TEXT,
            key_primary TEXT,
            key_fallback TEXT,
            PRIMARY KEY (session_id)
        )
    """)
    op.execute("""
        CREATE INDEX ix_analytics_playback_key_fallback ON analytics_playback (key_fallback)
    """)
    op.execute("""
        CREATE INDEX ix_analytics_playback_key_primary ON analytics_playback (key_primary)
    """)
    op.add_column("library_analytics_snapshots", sa.Column("generation_id", sa.String(), nullable=True))


def downgrade():
    op.drop_column("library_analytics_snapshots", "generation_id")
    op.drop_table("analytics_items")
    op.drop_table("analytics_generations")
    op.drop_table("analytics_playback")
