"""Disponibilité observée : Plex, fichiers *ARR et langues restent distincts."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class EpisodeCoverage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: Literal["arr"]
    state: Literal["unknown", "absent", "partial", "up_to_date"]
    available: int | None
    aired: int | None
    total: int | None
    seasons_available: int | None
    seasons_total: int | None


class MediaLanguages(BaseModel):
    model_config = ConfigDict(extra="forbid")
    has_vf: bool | None
    vf_granularity: str | None
    fr_is_default: bool | None
    sub_fr_status: (
        Literal["absent", "default", "not_default", "ok", "forced_default", "forced_not_default", "no_track"] | None
    )
    forced_fr_status: Literal["none", "ok", "not_default", "absent"] | None


class MediaQuality(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: Literal["plex", "unknown"]
    resolution: str | None


class MediaAvailability(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plex: Literal["present", "absent", "unknown"]
    library_id: int | None
    episodes: EpisodeCoverage
    languages: MediaLanguages
    quality: MediaQuality


def _get(item: Any, key: str, default=None):
    return item.get(key, default) if isinstance(item, dict) else getattr(item, key, default)


def media_availability(
    item: Any, *, library=None, plex_present: bool | None = None, season_rows: list[dict] | None = None
) -> dict:
    """Un statut *ARR disponible ne constitue jamais une confirmation Plex.

    Les compteurs portent sur les épisodes diffusés : les épisodes futurs ne rendent
    pas une série incomplète. Les données de langue de la bibliothèque priment.
    """
    library_id = _get(library, "id") if library is not None else _get(item, "library_item_id", _get(item, "library_id"))
    if library is not None:
        plex_present = True
    elif plex_present is None and library_id is not None:
        plex_present = True
    available = _get(item, "episodes_available_count")
    aired = _get(item, "episodes_aired_count")
    total = _get(item, "episodes_total_count")
    coverage = "unknown"
    if available is not None and aired is not None and aired > 0:
        coverage = "absent" if available == 0 else ("partial" if available < aired else "up_to_date")
    language_source = library if library is not None else item
    return MediaAvailability(
        plex="unknown" if plex_present is None else ("present" if plex_present else "absent"),
        library_id=library_id,
        episodes=EpisodeCoverage(
            source="arr",
            state=coverage,
            available=available,
            aired=aired,
            total=total,
            seasons_available=sum(row.get("status") == "available" for row in season_rows)
            if season_rows is not None
            else None,
            seasons_total=len(season_rows) if season_rows is not None else None,
        ),
        quality=MediaQuality(
            source="plex" if _get(library or item, "video_resolution") else "unknown",
            resolution=_get(library or item, "video_resolution"),
        ),
        languages=MediaLanguages(**{key: _get(language_source, key) for key in MediaLanguages.model_fields}),
    ).model_dump()
