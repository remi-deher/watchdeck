"""Réparation des affiches dont la source a expiré."""

from unittest.mock import AsyncMock

import pytest

from app.models import LibraryItem, MediaRequest
from app.services.poster_repair import poster_is_fragile, repair_posters

PLEX_POSTER = "https://metadata-static.plex.tv/6/gracenote/673b1b58.jpg"
TMDB_POSTER = "https://image.tmdb.org/t/p/w342/abc.jpg"


def test_only_expiring_sources_are_considered_fragile():
    """Les affiches TMDB et TheTVDB tiennent : les remplacer serait du travail inutile."""
    assert poster_is_fragile(PLEX_POSTER) is True
    assert poster_is_fragile(None) is True
    assert poster_is_fragile("") is True
    assert poster_is_fragile(TMDB_POSTER) is False
    assert poster_is_fragile("https://artworks.thetvdb.com/banners/v4/series/1/posters/x.jpg") is False


@pytest.mark.asyncio
async def test_a_dead_plex_poster_is_rebuilt_from_tmdb(async_db, monkeypatch):
    """Une URL `metadata-static.plex.tv` finit par répondre 403 : la carte reste vide.

    TMDB construit ses URL à partir d'un chemin stable — connaissant le `tmdb_id`, on
    peut donc reconstruire l'affiche à tout moment.
    """
    request = MediaRequest(
        plex_user_id="alice", title="The Hunger Games", media_type="movie", tmdb_id="70160", poster_url=PLEX_POSTER
    )
    item = LibraryItem(title="Dune", media_type="movie", tmdb_id="438631", poster_url=None)
    async_db.add_all([request, item])
    async_db.commit()
    monkeypatch.setattr("app.services.poster_repair.poster_url_for", AsyncMock(return_value=TMDB_POSTER))

    result = await repair_posters(async_db)

    assert result["repaired"] == 2
    assert request.poster_url == TMDB_POSTER
    assert item.poster_url == TMDB_POSTER


@pytest.mark.asyncio
async def test_a_healthy_poster_is_left_alone(async_db, monkeypatch):
    """Rien ne justifie de toucher une affiche qui fonctionne."""
    request = MediaRequest(
        plex_user_id="alice", title="Dune", media_type="movie", tmdb_id="438631", poster_url=TMDB_POSTER
    )
    async_db.add(request)
    async_db.commit()
    lookup = AsyncMock(return_value="https://image.tmdb.org/t/p/w342/autre.jpg")
    monkeypatch.setattr("app.services.poster_repair.poster_url_for", lookup)

    result = await repair_posters(async_db)

    assert result["repaired"] == 0
    lookup.assert_not_awaited()
    assert request.poster_url == TMDB_POSTER


@pytest.mark.asyncio
async def test_a_media_unknown_to_tmdb_keeps_its_poster(async_db, monkeypatch):
    """Sans affiche de remplacement, on ne remplace rien — le composant affiche son repli."""
    request = MediaRequest(
        plex_user_id="alice", title="Inconnu", media_type="movie", tmdb_id="999999", poster_url=PLEX_POSTER
    )
    async_db.add(request)
    async_db.commit()
    monkeypatch.setattr("app.services.poster_repair.poster_url_for", AsyncMock(return_value=None))

    result = await repair_posters(async_db)

    assert result == {"scanned": 1, "repaired": 0, "unresolved": 1}
    assert request.poster_url == PLEX_POSTER


@pytest.mark.asyncio
async def test_a_row_without_tmdb_id_is_not_even_looked_up(async_db, monkeypatch):
    """Sans identifiant TMDB il n'y a rien à reconstruire : inutile d'interroger l'API."""
    request = MediaRequest(
        plex_user_id="alice", title="Playthrough", media_type="movie", tmdb_id=None, poster_url=PLEX_POSTER
    )
    async_db.add(request)
    async_db.commit()
    lookup = AsyncMock(return_value=TMDB_POSTER)
    monkeypatch.setattr("app.services.poster_repair.poster_url_for", lookup)

    result = await repair_posters(async_db)

    assert result["scanned"] == 0
    lookup.assert_not_awaited()


def test_the_maintenance_catalog_exposes_the_repair():
    """L'action doit être proposée dans Maintenance, sinon personne ne la déclenchera."""
    from app.routers.maintenance import _ACTION_RUNNERS, ACTIONS_META

    assert "repair-posters" in ACTIONS_META
    assert callable(_ACTION_RUNNERS["repair-posters"])
