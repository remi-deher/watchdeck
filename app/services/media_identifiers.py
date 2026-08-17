"""Gestion unifiée des identifiants et rapprochements de médias (Plex, TMDB, TVDB, IMDB, *arr).

Fournit une structure de données `MediaIdentifiers` et des fonctions utilitaires
pour parser les GUIDs URI et comparer l'identité de médias provenant de sources variées.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


def parse_guid_uri(uri: str | None) -> tuple[str, str] | None:
    """Extrait le schéma et l'identifiant d'une URI GUID (ex: 'imdb://tt123456' -> ('imdb', 'tt123456'))."""
    if not uri or not isinstance(uri, str):
        return None
    match = re.match(r"^([a-zA-Z0-9_-]+)://(.+)$", uri.strip())
    if match:
        return match.group(1).lower(), match.group(2)
    return None


@dataclass
class MediaIdentifiers:
    """Représentation canonique des identifiants d'un média."""

    plex_guid: str | None = None
    tmdb_id: str | None = None
    tvdb_id: str | None = None
    imdb_id: str | None = None
    arr_id: int | None = None
    title: str | None = None
    year: int | None = None
    media_type: str | None = None

    @classmethod
    def from_record(cls, rec: Any) -> MediaIdentifiers:
        """Construit une instance à partir d'un dictionnaire, modèle SQLAlchemy ou objet quelconque."""
        if rec is None:
            return cls()

        def _get(key: str) -> Any:
            if isinstance(rec, dict):
                return rec.get(key)
            return getattr(rec, key, None)

        def _str(val: Any) -> str | None:
            if val is None or val == "":
                return None
            return str(val).strip()

        def _int(val: Any) -> int | None:
            if val is None or val == "":
                return None
            try:
                return int(val)
            except (ValueError, TypeError):
                return None

        arr_id_raw = (
            _get("arr_id") or _get("id") if isinstance(_get("id"), int) and not _get("plex_guid") else _get("arr_id")
        )

        return cls(
            plex_guid=_str(_get("plex_guid") or _get("guid")),
            tmdb_id=_str(_get("tmdb_id")),
            tvdb_id=_str(_get("tvdb_id")),
            imdb_id=_str(_get("imdb_id")),
            arr_id=_int(arr_id_raw),
            title=_str(_get("title") or _get("name")),
            year=_int(_get("year")),
            media_type=_str(_get("media_type") or _get("type")),
        )

    def identity_keys(self) -> list[tuple]:
        """Génère la liste ordonnée des clés d'identité (GUID > TMDB > TVDB > IMDB > Titre+Année+Type)."""
        keys: list[tuple] = []
        if self.plex_guid:
            keys.append(("guid", self.plex_guid))
        if self.tmdb_id:
            keys.append(("tmdb", str(self.tmdb_id)))
        if self.tvdb_id:
            keys.append(("tvdb", str(self.tvdb_id)))
        if self.imdb_id:
            keys.append(("imdb", str(self.imdb_id)))
        keys.append(("title", (self.title or "").lower().strip(), self.year, self.media_type))
        return keys

    def matches(self, other: MediaIdentifiers | Any) -> bool:
        """Vérifie si deux médias correspondent avec certitude selon la hiérarchie des identifiants."""
        if not isinstance(other, MediaIdentifiers):
            other = MediaIdentifiers.from_record(other)

        # 1. Correspondance GUID Plex
        if self.plex_guid and other.plex_guid and self.plex_guid == other.plex_guid:
            return True

        # 2. Correspondance IDs externes forts
        if self.tmdb_id and other.tmdb_id and str(self.tmdb_id) == str(other.tmdb_id):
            return True
        if self.tvdb_id and other.tvdb_id and str(self.tvdb_id) == str(other.tvdb_id):
            return True
        if self.imdb_id and other.imdb_id and str(self.imdb_id) == str(other.imdb_id):
            return True

        # 3. Correspondance par titre, année et type
        if self.title and other.title:
            s_title = re.sub(r"[^a-z0-9]+", " ", self.title.lower()).strip()
            o_title = re.sub(r"[^a-z0-9]+", " ", other.title.lower()).strip()
            if s_title and o_title and s_title == o_title:
                # Si les deux ont une année renseignée, elle doit correspondre
                if self.year and other.year and self.year != other.year:
                    return False
                # Si les deux ont un type renseigné, il doit correspondre
                if self.media_type and other.media_type and self.media_type != other.media_type:
                    return False
                return True

        return False

    def as_dict(self) -> dict[str, Any]:
        """Exporte les identifiants sous forme de dictionnaire épuré."""
        return {
            k: v
            for k, v in {
                "plex_guid": self.plex_guid,
                "tmdb_id": self.tmdb_id,
                "tvdb_id": self.tvdb_id,
                "imdb_id": self.imdb_id,
                "arr_id": self.arr_id,
                "title": self.title,
                "year": self.year,
                "media_type": self.media_type,
            }.items()
            if v is not None
        }
