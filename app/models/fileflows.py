"""Historique des traitements FileFlows : un enregistrement par passage d'un fichier.

Garde l'état avant/après (pistes, codecs, tailles) et les durées de chaque traitement,
pour les statistiques d'Encodage et pour des usages futurs. Alimenté par la tâche
`fileflows-monitor` (voir services/fileflows_history.py).
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, BigInteger, ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..utils import now_utc_naive
from .base import Base


class FileflowsProcessing(Base):
    __tablename__ = "fileflows_processing"
    __table_args__ = (
        UniqueConstraint("file_uid", "ended_at", name="uq_fileflows_processing_run"),
        Index("ix_fileflows_processing_ended", "ended_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    file_uid: Mapped[str] = mapped_column(index=True)
    # "processed" | "failed"
    status: Mapped[str]
    # "encode" | "rewrite" | "in_place" | "conform" | None (flow sans cette information)
    kind: Mapped[Optional[str]]
    path: Mapped[str] = mapped_column(Text)
    library: Mapped[Optional[str]]
    disk: Mapped[Optional[str]] = mapped_column(index=True)
    flow: Mapped[Optional[str]]
    library_item_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("library_items.id", ondelete="SET NULL"), index=True
    )
    started_at: Mapped[Optional[datetime]]
    ended_at: Mapped[datetime]
    total_seconds: Mapped[Optional[float]]
    wait_seconds: Mapped[Optional[float]]
    processing_seconds: Mapped[Optional[float]]
    original_size: Mapped[Optional[int]] = mapped_column(BigInteger)
    final_size: Mapped[Optional[int]] = mapped_column(BigInteger)
    failure_reason: Mapped[Optional[str]] = mapped_column(Text)
    # Résumés {duration, size, video, audio[], subtitles[], attachments} ; `after` n'existe
    # que si le flow l'a écrit dans son journal (ligne WATCHDECK_RESULT).
    before: Mapped[Optional[dict]] = mapped_column(JSON)
    after: Mapped[Optional[dict]] = mapped_column(JSON)
    steps: Mapped[Optional[list]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(default=now_utc_naive)
