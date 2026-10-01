"""Instances externes configurees : serveurs Plex, Sonarr/Radarr/Prowlarr, clients de telechargement, fournisseurs d'email."""

from datetime import datetime
from typing import Optional

from sqlalchemy import ForeignKey, Index, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from ..crypto import EncryptedText
from ..utils import now_utc_naive
from .base import Base


class PlexServer(Base):
    """Un serveur Plex suivi par Watchdeck.

    Le serveur principal (`is_primary`) n'a ni URL ni jeton ici : il reste configure par
    les champs `plex_url` / `plex_token` / `vff_libraries` de `Settings`, que lisent
    toujours les fonctions mono-serveur (VF, activite, SSO...). Sa ligne existe pour
    que les emplacements de bibliotheque (`LibraryItemLocation`) aient un serveur
    auquel se rattacher. Les serveurs supplementaires portent leur propre connexion.
    Voir services/plex_servers.py pour la resolution.
    """

    __tablename__ = "plex_servers"
    __table_args__ = (Index("uq_plex_servers_primary", "is_primary", unique=True, postgresql_where=text("is_primary")),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str]  # ex: "Plex 4K"
    is_primary: Mapped[bool] = mapped_column(default=False)
    url: Mapped[Optional[str]]
    token: Mapped[Optional[str]] = mapped_column(EncryptedText)
    # Bibliotheques suivies, meme format JSON que Settings.vff_libraries. NULL = memes
    # noms que le serveur principal.
    libraries: Mapped[Optional[str]] = mapped_column(Text)
    machine_identifier: Mapped[Optional[str]]
    enabled: Mapped[bool] = mapped_column(default=True)
    # Tautulli propre a ce serveur (un Tautulli ne suit qu'un serveur). Le principal
    # garde le sien dans Settings.
    tautulli_url: Mapped[Optional[str]]
    tautulli_api_key: Mapped[Optional[str]] = mapped_column(EncryptedText)
    created_at: Mapped[Optional[datetime]] = mapped_column(default=now_utc_naive)


class LibraryItemLocation(Base):
    """Presence d'un media de la bibliotheque sur un serveur Plex donne.

    Un media reste une seule ligne `LibraryItem`, quel que soit le nombre de serveurs
    qui le portent ; chaque serveur ou il est vu ajoute ici sa propre cle Plex.
    """

    __tablename__ = "library_item_locations"
    __table_args__ = (
        UniqueConstraint("server_id", "rating_key", name="uq_library_item_location_server_key"),
        Index("ix_library_item_locations_item", "library_item_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    library_item_id: Mapped[int] = mapped_column(ForeignKey("library_items.id", ondelete="CASCADE"))
    server_id: Mapped[int] = mapped_column(ForeignKey("plex_servers.id", ondelete="CASCADE"), index=True)
    rating_key: Mapped[str]
    plex_guid: Mapped[Optional[str]]
    seen_at: Mapped[Optional[datetime]] = mapped_column(default=now_utc_naive)


class ArrInstance(Base):
    __tablename__ = "arr_instances"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str]  # ex: "Sonarr 4K"
    arr_type: Mapped[str]  # "sonarr" | "radarr" | "prowlarr"
    url: Mapped[str]
    api_key: Mapped[str] = mapped_column(EncryptedText)
    quality_profile_id: Mapped[Optional[int]]
    root_folder: Mapped[Optional[str]]
    minimum_availability: Mapped[str] = mapped_column(default="released")  # radarr only
    enabled: Mapped[bool] = mapped_column(default=True)
    is_default: Mapped[bool] = mapped_column(default=False)
    indexer_ids: Mapped[Optional[str]]  # JSON list d'int, indexeurs à utiliser (null = tous)
    # Serveur Plex qui recoit les imports de cette instance (ex: Radarr 4K -> Plex 4K) :
    # c'est lui qu'on previent d'un import. NULL = serveur principal.
    plex_server_id: Mapped[Optional[int]] = mapped_column(ForeignKey("plex_servers.id", ondelete="SET NULL"))


class DownloadClient(Base):
    __tablename__ = "download_clients"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str]  # ex: "Seedbox qBittorrent"
    client_type: Mapped[str]  # "qbittorrent" | "transmission"
    url: Mapped[str]
    username: Mapped[Optional[str]]
    password: Mapped[Optional[str]] = mapped_column(EncryptedText)
    category: Mapped[Optional[str]]  # ex: "watchdeck"
    tags: Mapped[Optional[str]]  # comma-separated tags
    is_default: Mapped[bool] = mapped_column(default=False)
    enabled: Mapped[bool] = mapped_column(default=True)


class EmailProvider(Base):
    """Un moyen d'envoyer des emails (SMTP classique, SMTP+OAuth2 Microsoft, ou API Brevo).

    Plusieurs fournisseurs peuvent etre configures et actifs simultanement : l'envoi
    (voir email_providers.py) essaie chaque fournisseur actif par ordre de `priority`
    croissante et bascule sur le suivant en cas d'echec, jusqu'a un envoi reussi.
    """

    __tablename__ = "email_providers"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str]  # ex: "Hotmail perso"
    provider_type: Mapped[str]  # "smtp" | "smtp_oauth2" | "brevo"
    enabled: Mapped[bool] = mapped_column(default=True)
    priority: Mapped[int] = mapped_column(default=0)  # ordre d'essai croissant

    # --- SMTP (provider_type "smtp" et "smtp_oauth2") ---
    smtp_host: Mapped[Optional[str]]
    smtp_port: Mapped[int] = mapped_column(default=587)
    smtp_tls: Mapped[bool] = mapped_column(default=True)
    smtp_user: Mapped[Optional[str]]  # "smtp" uniquement
    smtp_password: Mapped[Optional[str]] = mapped_column(EncryptedText)  # "smtp" uniquement

    # --- SMTP OAuth2 Microsoft ("smtp_oauth2" uniquement) ---
    oauth_tenant: Mapped[str] = mapped_column(default="consumers")
    oauth_client_id: Mapped[Optional[str]]
    oauth_client_secret: Mapped[Optional[str]] = mapped_column(EncryptedText)
    oauth_mailbox: Mapped[Optional[str]]
    oauth_refresh_token: Mapped[Optional[str]] = mapped_column(EncryptedText)
    oauth_access_token: Mapped[Optional[str]] = mapped_column(EncryptedText)
    oauth_token_expires_at: Mapped[Optional[datetime]]

    # --- Brevo ("brevo" uniquement) ---
    brevo_api_key: Mapped[Optional[str]] = mapped_column(EncryptedText)
