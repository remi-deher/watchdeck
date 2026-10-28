"""Indexed requester relation, calendar periods and collection search/seek indexes."""

from alembic import op

revision = "0055_collection_projections"
down_revision = "0054_analytics_projection"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE EXTENSION IF NOT EXISTS pg_trgm
    """)
    op.execute("""
        CREATE TABLE request_requesters (
            request_id INTEGER NOT NULL,
            plex_user_id TEXT NOT NULL,
            is_primary BOOLEAN NOT NULL,
            PRIMARY KEY (request_id, plex_user_id),
            FOREIGN KEY(request_id) REFERENCES media_requests (id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        CREATE INDEX ix_request_requester_user ON request_requesters (plex_user_id, is_primary, request_id)
    """)
    op.execute("""
        CREATE TABLE calendar_projections (
            key VARCHAR NOT NULL,
            start VARCHAR NOT NULL,
            "end" VARCHAR NOT NULL,
            events JSONB NOT NULL,
            refreshed_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
            PRIMARY KEY (key)
        )
    """)
    op.execute("""
        CREATE INDEX ix_calendar_projections_refreshed_at ON calendar_projections (refreshed_at)
    """)
    op.execute("""
        CREATE OR REPLACE FUNCTION watchdeck_requesters_sync() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE extras jsonb;
        BEGIN
            DELETE FROM request_requesters WHERE request_id = NEW.id;
            IF coalesce(NEW.plex_user_id, '') <> '' THEN
                INSERT INTO request_requesters VALUES (NEW.id, NEW.plex_user_id, true);
            END IF;
            BEGIN
                extras := coalesce(NEW.extra_requesters, '[]')::jsonb;
            EXCEPTION WHEN invalid_text_representation THEN
                extras := '[]'::jsonb;
            END;
            IF jsonb_typeof(extras) = 'array' THEN
                INSERT INTO request_requesters (request_id, plex_user_id, is_primary)
                SELECT DISTINCT NEW.id, uid, false FROM (
                    SELECT CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}'
                                WHEN jsonb_typeof(e->'plex_user_id') = 'string' THEN e->>'plex_user_id' END AS uid
                    FROM jsonb_array_elements(extras) AS e
                ) AS normalized WHERE coalesce(uid, '') <> '' AND uid IS DISTINCT FROM NEW.plex_user_id
                ON CONFLICT DO NOTHING;
            END IF;
            RETURN NEW;
        END $$
    """)
    op.execute("""
        CREATE TRIGGER watchdeck_requesters_sync
        AFTER INSERT OR UPDATE OF plex_user_id, extra_requesters ON media_requests
        FOR EACH ROW EXECUTE FUNCTION watchdeck_requesters_sync()
    """)
    op.execute("""
        UPDATE media_requests SET extra_requesters = extra_requesters
    """)
    op.execute("""
        CREATE INDEX ix_library_added_seek ON library_items (added_at DESC NULLS LAST, title, id)
    """)
    op.execute("""
        CREATE INDEX ix_library_title_id ON library_items (title, id)
    """)
    op.execute("""
        CREATE INDEX ix_library_title_trgm ON library_items USING gin (title gin_trgm_ops)
    """)
    op.execute("""
        CREATE INDEX ix_library_year_seek ON library_items (year DESC NULLS LAST, title, id)
    """)
    op.execute("""
        CREATE INDEX ix_notification_recipient_sent ON notification_logs (lower(trim(recipient)), sent_at DESC, id DESC)
    """)


def downgrade():
    op.drop_index("ix_library_title_id")
    op.drop_index("ix_library_title_trgm")
    op.drop_index("ix_library_added_seek")
    op.drop_index("ix_library_year_seek")
    op.drop_index("ix_notification_recipient_sent")
    op.execute("DROP TRIGGER IF EXISTS watchdeck_requesters_sync ON media_requests")
    op.execute("DROP FUNCTION IF EXISTS watchdeck_requesters_sync()")
    op.drop_table("request_requesters")
    op.drop_table("calendar_projections")
    # Keep pg_trgm: other application schemas can depend on this extension.
