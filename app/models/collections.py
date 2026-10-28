"""Indexed collection projections, compatible with legacy request JSON writers."""

from datetime import datetime

from sqlalchemy import DDL, ForeignKey, Index, Text, event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..utils import now_utc_naive
from .base import Base


class RequestRequester(Base):
    __tablename__ = "request_requesters"
    request_id: Mapped[int] = mapped_column(ForeignKey("media_requests.id", ondelete="CASCADE"), primary_key=True)
    plex_user_id: Mapped[str] = mapped_column(Text, primary_key=True)
    is_primary: Mapped[bool]
    __table_args__ = (Index("ix_request_requester_user", "plex_user_id", "is_primary", "request_id"),)


class CalendarProjection(Base):
    __tablename__ = "calendar_projections"
    key: Mapped[str] = mapped_column(primary_key=True)
    start: Mapped[str]
    end: Mapped[str]
    events: Mapped[list] = mapped_column(JSONB)
    refreshed_at: Mapped[datetime] = mapped_column(default=now_utc_naive, index=True)


# Install on metadata.create_all too: tests and fresh schema users must have the
# same transactional compatibility guarantees as installations using Alembic.
REQUESTERS_FUNCTION = r"""
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
"""
REQUESTERS_TRIGGER = """CREATE TRIGGER watchdeck_requesters_sync
AFTER INSERT OR UPDATE OF plex_user_id, extra_requesters ON media_requests
FOR EACH ROW EXECUTE FUNCTION watchdeck_requesters_sync()"""
event.listen(RequestRequester.__table__, "after_create", DDL(REQUESTERS_FUNCTION))
event.listen(
    RequestRequester.__table__,
    "after_create",
    DDL("DROP TRIGGER IF EXISTS watchdeck_requesters_sync ON media_requests"),
)
event.listen(RequestRequester.__table__, "after_create", DDL(REQUESTERS_TRIGGER))
event.listen(
    RequestRequester.__table__, "before_drop", DDL("DROP TRIGGER IF EXISTS watchdeck_requesters_sync ON media_requests")
)
