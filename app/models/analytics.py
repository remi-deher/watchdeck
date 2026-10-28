"""Immutable analytics generations and incremental playback contributions."""

from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Index, Text, desc, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..utils import now_utc_naive
from .base import Base


class AnalyticsGeneration(Base):
    __tablename__ = "analytics_generations"
    id: Mapped[str] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(default=now_utc_naive, index=True)
    generated_at: Mapped[str]
    catalog_fingerprint: Mapped[str | None] = mapped_column(Text)
    format_version: Mapped[int]
    summary: Mapped[dict] = mapped_column(JSONB)


class AnalyticsItem(Base):
    __tablename__ = "analytics_items"
    generation_id: Mapped[str] = mapped_column(
        ForeignKey("analytics_generations.id", ondelete="CASCADE"), primary_key=True
    )
    ordinal: Mapped[int] = mapped_column(primary_key=True)
    rating_key: Mapped[str] = mapped_column(Text)
    data: Mapped[dict] = mapped_column(JSONB)
    search_text: Mapped[str] = mapped_column(Text)
    sort_title: Mapped[str] = mapped_column(Text)
    sort_library: Mapped[str] = mapped_column(Text)
    sort_studio: Mapped[str] = mapped_column(Text)
    sort_container: Mapped[str] = mapped_column(Text)
    sort_viewer: Mapped[str] = mapped_column(Text)
    sort_video_codec: Mapped[str] = mapped_column(Text)
    sort_audio_codec: Mapped[str] = mapped_column(Text)
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    duration_ms: Mapped[int] = mapped_column(BigInteger)
    play_count: Mapped[int]
    watch_time_ms: Mapped[int] = mapped_column(BigInteger)
    video_rank: Mapped[int]
    audio_track_count: Mapped[int]
    subtitle_count: Mapped[int | None]
    last_viewed_at: Mapped[str] = mapped_column(Text)
    __table_args__ = (
        Index("ix_analytics_rating", "generation_id", "rating_key"),
        Index("ix_analytics_title", "generation_id", text('sort_title COLLATE "C"'), "ordinal"),
        Index("ix_analytics_size", "generation_id", desc("size_bytes"), "ordinal"),
        Index("ix_analytics_plays", "generation_id", desc("play_count"), "ordinal"),
        Index("ix_analytics_data", "data", postgresql_using="gin", postgresql_ops={"data": "jsonb_path_ops"}),
    )


class AnalyticsPlayback(Base):
    __tablename__ = "analytics_playback"
    session_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    rating_key: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text)
    grandparent_title: Mapped[str | None] = mapped_column(Text)
    user_name: Mapped[str | None] = mapped_column(Text)
    watched_ms: Mapped[int | None] = mapped_column(BigInteger)
    progress_ms: Mapped[int | None] = mapped_column(BigInteger)
    started_at: Mapped[datetime | None]
    last_seen_at: Mapped[datetime | None]
    player_title: Mapped[str | None] = mapped_column(Text)
    product: Mapped[str | None] = mapped_column(Text)
    platform: Mapped[str | None] = mapped_column(Text)
    key_primary: Mapped[str | None] = mapped_column(Text, index=True)
    key_fallback: Mapped[str | None] = mapped_column(Text, index=True)
