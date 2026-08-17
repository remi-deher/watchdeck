"""Caches persistes."""

from datetime import datetime
from typing import Optional

from sqlalchemy import LargeBinary, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..utils import now_utc_naive
from .base import Base


class SearchCache(Base):
    __tablename__ = "search_cache"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    query: Mapped[str]
    category: Mapped[Optional[str]]  # "movie" | "tv"
    results_json: Mapped[str] = mapped_column(Text)
    cached_at: Mapped[datetime] = mapped_column(default=now_utc_naive)


class TrackerFavicon(Base):
    __tablename__ = "tracker_favicons"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    host: Mapped[str] = mapped_column(unique=True, index=True)
    source_url: Mapped[Optional[str]]
    content: Mapped[Optional[bytes]] = mapped_column(LargeBinary)
    content_type: Mapped[Optional[str]]
    status: Mapped[str] = mapped_column(default="missing")
    fetched_at: Mapped[datetime] = mapped_column(default=now_utc_naive)
    expires_at: Mapped[datetime]
