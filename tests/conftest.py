"""Configuration pytest partagée : suppression des ResourceWarning SQLite et patch du démarrage."""

from unittest.mock import AsyncMock, patch

import pytest

from tests.async_support import close_leaked_sessions, make_test_session, reset_postgres_state

# Le filtre des ResourceWarning "unclosed database" vit desormais dans pytest.ini :
# pose ici, il etait reinitialise par pytest avant chaque test et n'avait donc aucun effet.


@pytest.fixture(autouse=True)
def _patch_app_startup():
    """Empêche le scheduler et le worker de démarrer pendant les tests."""
    with (
        patch("app.scheduler.start_scheduler"),
        patch("app.notification_queue.start_worker", return_value=None),
    ):
        yield


@pytest.fixture(autouse=True)
def _isolate_application_cache(monkeypatch):
    """Keep cache tests deterministic when CI exposes a shared Redis service.

    Redis transport itself is covered by test_realtime_redis.py. Endpoint and
    stale-while-revalidate tests must use their per-instance memory cache;
    otherwise fixed production keys leak values between otherwise isolated tests.
    """
    from app.cache import Cache, _refreshing_keys, cache

    async def memory_only_client(self):
        return None

    monkeypatch.setattr(Cache, "_client", memory_only_client)
    cache._memory.clear()
    _refreshing_keys.clear()
    yield
    cache._memory.clear()
    _refreshing_keys.clear()


@pytest.fixture(autouse=True)
def _isolate_shared_scan_state(monkeypatch):
    """Isole le miroir Redis de l'état de scan quand la CI expose un vrai Redis.

    Les clés sont fixes (`watchdeck:scan-state:v1:*`) : un test qui laisse une section
    à « running » fait échouer les suivants, dont la garde « déjà en cours » de
    `_run_vf_scan` annule alors silencieusement le scan. Le miroir lui-même est
    couvert par test_scan_state.py, qui rebranche `_client` sur son propre faux Redis.
    """
    from app.services import scan_state

    async def local_only_client():
        return None

    monkeypatch.setattr(scan_state, "_client", local_only_client)
    yield


@pytest.fixture(autouse=True)
def _isolate_arr_catalog_cache():
    """Vide le cache de catalogue Sonarr/Radarr (`app.services.arr_catalog`) entre les
    tests. Sans ça, deux tests réutilisant la même URL/clé factice (voir tests/test_radarr.py,
    tests/test_sonarr.py) partagent le même catalogue en cache (TTL 90s) : le premier test
    exécuté peuple le cache avec ses données mockées, et le suivant reçoit ce résultat
    périmé au lieu d'appeler son propre client HTTP mocké."""
    from app.services import arr_catalog

    arr_catalog.invalidate()
    yield
    arr_catalog.invalidate()


@pytest.fixture(autouse=True)
def _close_leaked_sessions():
    """Ferme les sessions ouvertes par un test sans avoir ete liberees.

    Beaucoup de tests appellent make_test_session() a la volee sans fermer. Sous
    SQLite en memoire c'etait invisible (chaque session avait sa propre base). Sous
    PostgreSQL, une session fuitee retient une connexion avec une transaction
    ouverte : le test suivant qui ecrit les memes lignes attend indefiniment le
    verrou. Constate en pratique -- la suite se figeait des le deuxieme fichier.
    """
    yield
    close_leaked_sessions()
    # Annule la transaction PostgreSQL du test (sans effet en mode SQLite).
    reset_postgres_state()


@pytest.fixture()
def async_db():
    """Hybrid session for synchronous TestClient tests of async endpoints."""
    db = make_test_session()
    yield db
    db.close()
