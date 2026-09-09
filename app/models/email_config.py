"""Configuration normalisée des modèles et de l'habillage des emails."""

from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class EmailBranding(Base):
    __tablename__ = "email_branding"

    settings_id: Mapped[int] = mapped_column(ForeignKey("settings.id", ondelete="CASCADE"), primary_key=True)
    header_brand: Mapped[Optional[str]]
    header_subtitle: Mapped[Optional[str]]
    footer_template: Mapped[Optional[str]] = mapped_column(Text)
    templates_backup: Mapped[Optional[str]] = mapped_column(Text)
    show_poster: Mapped[Optional[bool]] = mapped_column(Boolean)
    show_genres: Mapped[Optional[bool]] = mapped_column(Boolean)
    show_requester: Mapped[Optional[bool]] = mapped_column(Boolean)
    requester_label: Mapped[Optional[str]]
    brand_color: Mapped[Optional[str]]
    show_header_subtitle: Mapped[Optional[bool]] = mapped_column(Boolean)
    poster_width: Mapped[Optional[int]] = mapped_column(Integer)
    media_layout: Mapped[Optional[str]]
    bg_color: Mapped[Optional[str]]
    card_bg_color: Mapped[Optional[str]]
    font_family: Mapped[Optional[str]]
    card_width: Mapped[Optional[int]] = mapped_column(Integer)
    card_border_radius: Mapped[Optional[int]] = mapped_column(Integer)
    synopsis_font_size: Mapped[Optional[str]]
    show_tmdb_link: Mapped[Optional[bool]] = mapped_column(Boolean)
    show_plex_button: Mapped[Optional[bool]] = mapped_column(Boolean)


class EmailTemplate(Base):
    __tablename__ = "email_templates"
    __table_args__ = (UniqueConstraint("settings_id", "event", name="uq_email_template_event"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    settings_id: Mapped[int] = mapped_column(ForeignKey("settings.id", ondelete="CASCADE"))
    event: Mapped[str]
    template: Mapped[Optional[str]] = mapped_column(Text)
    subject: Mapped[Optional[str]]
    accent_color: Mapped[Optional[str]]
    badge_text: Mapped[Optional[str]]
    headline_text: Mapped[Optional[str]]
    show_synopsis: Mapped[Optional[bool]] = mapped_column(Boolean)


class MessageReason(Base):
    """Motif réutilisable et son message, pour les annulations et les corrections.

    Un administrateur qui annule une demande écrivait son explication à la main, à chaque
    fois : le même refus se formulait donc différemment d'une fois à l'autre, et les
    tournures les plus utiles se perdaient. Un motif porte un libellé — ce qu'on choisit
    dans la liste — et le message envoyé au demandeur, modifiable.
    """

    __tablename__ = "message_reasons"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    #: "cancelled" ou "correction" : un motif d'annulation n'a pas de sens sur une correction.
    event: Mapped[str] = mapped_column(index=True)
    label: Mapped[str]
    message: Mapped[str] = mapped_column(Text)
    #: Ordre d'affichage dans la liste ; à égalité, le libellé départage.
    position: Mapped[int] = mapped_column(default=0)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
