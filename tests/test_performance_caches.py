"""Tests des mémorisations qui évitent de recalculer ce qui n'a pas changé.

Trois valeurs étaient recalculées en boucle par des tâches de fond, mesuré en
production sur sept jours :

- la correspondance IMDB -> TMDB d'un item de watchlist (2,4 s par cycle, 2880 cycles
  par jour) alors qu'un film ne change jamais de fiche TMDB ;
- le nom du compte Plex (0,57 s par cycle) alors qu'il ne change quasiment jamais ;
- l'analyse complète de la bibliothèque, recalculée 90 fois par jour en retéléchargeant
  plus de vingt mille fiches.
"""

import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.cache import cache
from app.models import Settings
from app.services import library_analytics, plex_api
from app.services.watchlist_poller import (
    _TMDB_RESOLUTION_MISS_TTL,
    _TMDB_RESOLUTION_TTL,
    _ensure_tmdb_id,
    _tmdb_cache_key,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    cache._memory.clear()
    yield
    cache._memory.clear()


# ---------------------------------------------------------------------------
# Résolution IMDB -> TMDB
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tmdb_resolution_is_resolved_once_then_reused():
    item = {"title": "Un Film", "media_type": "movie", "imdb_id": "tt0001"}
    resolve = AsyncMock(return_value={**item, "tmdb_id": "42"})

    with patch("app.services.watchlist_poller._resolve_tmdb_id_uncached", new=resolve):
        first = await _ensure_tmdb_id(item, Settings(), None, None)
        second = await _ensure_tmdb_id(item, Settings(), None, None)
        third = await _ensure_tmdb_id(dict(item), Settings(), None, None)

    assert first["tmdb_id"] == second["tmdb_id"] == third["tmdb_id"] == "42"
    resolve.assert_awaited_once()


@pytest.mark.asyncio
async def test_an_item_that_already_carries_its_tmdb_id_resolves_nothing():
    resolve = AsyncMock()
    item = {"title": "Un Film", "media_type": "movie", "tmdb_id": "99", "imdb_id": "tt0001"}

    with patch("app.services.watchlist_poller._resolve_tmdb_id_uncached", new=resolve):
        assert (await _ensure_tmdb_id(item, Settings(), None, None))["tmdb_id"] == "99"

    resolve.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_failed_resolution_is_kept_only_briefly():
    """Un échec n'est pas définitif : un film trop récent pour Radarr sera résolu plus
    tard. Il est mémorisé juste assez pour ne pas refaire l'appel à chaque cycle d'une
    même heure — jamais les trente jours d'un succès."""
    item = {"title": "Film Très Récent", "media_type": "movie", "imdb_id": "tt0002"}

    with patch("app.services.watchlist_poller._resolve_tmdb_id_uncached", new=AsyncMock(return_value=item)):
        await _ensure_tmdb_id(item, Settings(), None, None)

    assert _TMDB_RESOLUTION_MISS_TTL < _TMDB_RESOLUTION_TTL
    payload, expires_at = cache._memory[_tmdb_cache_key(item)]
    assert json.loads(payload) == {"tmdb_id": None}
    assert expires_at - time.time() <= _TMDB_RESOLUTION_MISS_TTL


@pytest.mark.asyncio
async def test_an_item_without_any_external_id_is_never_memorised():
    """Sans identifiant externe, la résolution retombe sur le titre : deux œuvres
    peuvent le partager, mémoriser serait faux."""
    item = {"title": "Sans Identifiant", "media_type": "movie"}
    resolve = AsyncMock(side_effect=lambda *a, **kw: {**item, "tmdb_id": "7"})

    assert _tmdb_cache_key(item) is None
    with patch("app.services.watchlist_poller._resolve_tmdb_id_uncached", new=resolve):
        await _ensure_tmdb_id(item, Settings(), None, None)
        await _ensure_tmdb_id(item, Settings(), None, None)

    assert resolve.await_count == 2


@pytest.mark.asyncio
async def test_movies_and_shows_do_not_share_a_cache_entry():
    film = {"title": "X", "media_type": "movie", "imdb_id": "tt9"}
    serie = {"title": "X", "media_type": "show", "imdb_id": "tt9"}

    assert _tmdb_cache_key(film) != _tmdb_cache_key(serie)


# ---------------------------------------------------------------------------
# Nom du compte Plex
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_plex_username_is_fetched_once_then_reused():
    headers = {"X-Plex-Token": "token-a"}
    response = MagicMock()
    response.json.return_value = {"username": "remi"}
    response.raise_for_status = MagicMock()
    client = MagicMock()
    client.get = AsyncMock(return_value=response)

    assert await plex_api._get_account_username(client, headers) == "remi"
    assert await plex_api._get_account_username(client, headers) == "remi"

    client.get.assert_awaited_once()


@pytest.mark.asyncio
async def test_a_different_token_resolves_again():
    """La clé dérive du token : changer de compte doit relire, pas servir l'ancien nom."""
    response = MagicMock()
    response.json.return_value = {"username": "remi"}
    response.raise_for_status = MagicMock()
    client = MagicMock()
    client.get = AsyncMock(return_value=response)

    await plex_api._get_account_username(client, {"X-Plex-Token": "token-a"})
    await plex_api._get_account_username(client, {"X-Plex-Token": "token-b"})

    assert client.get.await_count == 2
    # Le token lui-même ne doit pas apparaître dans la clé : elle se retrouve en clair
    # dans les journaux et les outils d'inspection Redis.
    assert "token-a" not in plex_api._username_cache_key("token-a")


@pytest.mark.asyncio
async def test_a_network_failure_is_not_memorised():
    """Sinon un incident passager figerait le repli « admin » pour vingt-quatre heures."""
    client = MagicMock()
    client.get = AsyncMock(side_effect=httpx.ConnectError("réseau"))

    assert await plex_api._get_account_username(client, {"X-Plex-Token": "tok"}) == "admin"

    ok = MagicMock()
    ok.json.return_value = {"username": "remi"}
    ok.raise_for_status = MagicMock()
    client.get = AsyncMock(return_value=ok)
    assert await plex_api._get_account_username(client, {"X-Plex-Token": "tok"}) == "remi"


# ---------------------------------------------------------------------------
# Instantané analytique
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_analytics_skips_the_full_catalog_when_nothing_changed():
    """Le calcul retéléchargeait tout le catalogue Plex toutes les dix minutes pour
    aboutir au même résultat."""
    snapshot = MagicMock()
    snapshot.payload_json = json.dumps({"summary": {"items": 3}})
    snapshot.source_fingerprint = "empreinte#lectures"
    db = MagicMock()
    db.get = AsyncMock(return_value=snapshot)
    db.commit = AsyncMock()
    fetch = AsyncMock()

    with (
        patch("app.services.library_analytics._catalog_fingerprint", new=AsyncMock(return_value="empreinte")),
        patch("app.services.library_analytics._playback_fingerprint", new=AsyncMock(return_value="lectures")),
        patch("app.services.library_analytics.fetch_plex_catalog", new=fetch),
    ):
        payload = await library_analytics.refresh_library_analytics_snapshot(Settings(), db)

    assert payload == {"summary": {"items": 3}}
    fetch.assert_not_awaited()


@pytest.mark.asyncio
async def test_analytics_recomputes_when_playback_changed_even_if_catalog_did_not():
    """L'historique de lecture alimente aussi la charge utile : une bibliothèque
    inchangée ne suffit pas à conclure que l'instantané est encore juste."""
    snapshot = MagicMock()
    snapshot.payload_json = json.dumps({"summary": {"items": 3}})
    snapshot.source_fingerprint = "empreinte#anciennes-lectures"
    db = MagicMock()
    db.get = AsyncMock(return_value=snapshot)
    db.commit = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalars=lambda: MagicMock(all=lambda: [])))
    fetch = AsyncMock(return_value={"items": [], "generated_at": "2026-09-14T00:00:00", "libraries": []})

    with (
        patch("app.services.library_analytics._catalog_fingerprint", new=AsyncMock(return_value="empreinte")),
        patch("app.services.library_analytics._playback_fingerprint", new=AsyncMock(return_value="NOUVELLES")),
        patch("app.services.library_analytics.fetch_plex_catalog", new=fetch),
    ):
        await library_analytics.refresh_library_analytics_snapshot(Settings(), db)

    fetch.assert_awaited_once()


@pytest.mark.asyncio
async def test_analytics_recomputes_when_the_probe_is_unavailable():
    """Une sonde en échec ne doit jamais figer l'instantané."""
    snapshot = MagicMock()
    snapshot.payload_json = json.dumps({"summary": {"items": 3}})
    snapshot.source_fingerprint = "empreinte#lectures"
    db = MagicMock()
    db.get = AsyncMock(return_value=snapshot)
    db.commit = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalars=lambda: MagicMock(all=lambda: [])))
    fetch = AsyncMock(return_value={"items": [], "generated_at": "2026-09-14T00:00:00", "libraries": []})

    with (
        patch("app.services.library_analytics._catalog_fingerprint", new=AsyncMock(return_value=None)),
        patch("app.services.library_analytics.fetch_plex_catalog", new=fetch),
    ):
        await library_analytics.refresh_library_analytics_snapshot(Settings(), db)

    fetch.assert_awaited_once()


# ---------------------------------------------------------------------------
# Disponibilité épisode : seules les séries signalées par Sonarr sont rechargées
# ---------------------------------------------------------------------------


def _availability_db(watermark):
    """Session simulée : une seule série, et un filigrane réglable."""
    from app.models import ArrInstance, MediaRequest, RequestStatus

    serie = MediaRequest(
        id=1, plex_user_id="u", title="Une Série", media_type="show", arr_id=1592, status=RequestStatus.available
    )
    settings = Settings(episode_availability_last_at=watermark)
    db = MagicMock()
    db.close = AsyncMock()
    db.commit = AsyncMock()

    resultats = [
        MagicMock(scalars=lambda: MagicMock(all=lambda: [serie])),  # requests
        MagicMock(scalars=lambda: MagicMock(all=lambda: [])),  # library items
        MagicMock(scalars=lambda: MagicMock(first=lambda: settings)),  # settings
    ]
    db.execute = AsyncMock(side_effect=resultats)
    inst = ArrInstance(id=1, name="Sonarr", arr_type="sonarr", url="http://s", api_key="k", enabled=True)
    return db, settings, inst


@pytest.mark.asyncio
async def test_availability_skips_series_sonarr_reports_as_untouched():
    """Une série dont aucun fichier n'a bougé a forcément la même disponibilité qu'au
    passage précédent : la recharger coûtait un aller-retour Sonarr pour rien."""
    from datetime import timedelta

    from app.services import episode_availability
    from app.utils import now_utc_naive

    db, settings, inst = _availability_db(now_utc_naive() - timedelta(minutes=10))
    fetch = AsyncMock()

    with (
        patch("app.services.episode_availability.AsyncSessionLocal", return_value=db),
        patch("app.services.episode_availability._resolve_sonarr_instance", new=AsyncMock(return_value=inst)),
        # Sonarr ne signale aucun evenement sur cette serie.
        patch("app.services.episode_availability._series_changed_since", new=AsyncMock(return_value={999})),
        patch("app.services.episode_availability._fetch_show_episodes", new=fetch),
    ):
        await episode_availability.check_episode_availability()

    fetch.assert_not_awaited()
    assert settings.episode_availability_last_at is not None


@pytest.mark.asyncio
async def test_availability_refreshes_a_series_sonarr_reports_as_changed():
    from datetime import timedelta

    from app.services import episode_availability
    from app.utils import now_utc_naive

    db, _settings, inst = _availability_db(now_utc_naive() - timedelta(minutes=10))
    fetch = AsyncMock(return_value=[])

    with (
        patch("app.services.episode_availability.AsyncSessionLocal", return_value=db),
        patch("app.services.episode_availability._resolve_sonarr_instance", new=AsyncMock(return_value=inst)),
        patch("app.services.episode_availability._series_changed_since", new=AsyncMock(return_value={1592})),
        patch("app.services.episode_availability._fetch_show_episodes", new=fetch),
        patch("app.services.episode_availability._upsert_availability", new=AsyncMock()),
    ):
        await episode_availability.check_episode_availability()

    fetch.assert_awaited_once()


@pytest.mark.asyncio
async def test_availability_falls_back_to_a_full_resync_when_history_is_unreadable():
    """Un historique illisible ne doit jamais faire ne rafraîchir qu'une partie de la
    bibliothèque en silence."""
    from datetime import timedelta

    from app.services import episode_availability
    from app.utils import now_utc_naive

    db, _settings, inst = _availability_db(now_utc_naive() - timedelta(minutes=10))
    fetch = AsyncMock(return_value=[])

    with (
        patch("app.services.episode_availability.AsyncSessionLocal", return_value=db),
        patch("app.services.episode_availability._resolve_sonarr_instance", new=AsyncMock(return_value=inst)),
        patch("app.services.episode_availability._series_changed_since", new=AsyncMock(return_value=None)),
        patch("app.services.episode_availability._fetch_show_episodes", new=fetch),
        patch("app.services.episode_availability._upsert_availability", new=AsyncMock()),
    ):
        await episode_availability.check_episode_availability()

    fetch.assert_awaited_once()
