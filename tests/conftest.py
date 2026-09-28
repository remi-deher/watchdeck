"""Configuration pytest partagée : base PostgreSQL de test et isolation entre les tests."""

import os
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio

# app.database refuse de s'importer sans URL PostgreSQL. Le moteur applicatif n'est jamais
# utilise tel quel par les tests (sessions injectees), mais il doit pouvoir etre construit.
os.environ.setdefault("DATABASE_URL", "postgresql://watchdeck:watchdeck-test@127.0.0.1:5433/watchdeck_test")

from tests.async_support import (  # noqa: E402 - doit suivre la definition de DATABASE_URL
    close_leaked_sessions,
    make_test_session,
    open_async_test_database,
    open_committed_async_test_database,
    reset_postgres_state,
)


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

    Beaucoup de tests appellent make_test_session() a la volee sans fermer. Une session
    fuitee retient une connexion avec une transaction ouverte : le test suivant qui
    ecrit les memes lignes attend indefiniment le verrou. Constate en pratique -- la suite se figeait des le deuxieme fichier.
    """
    yield
    close_leaked_sessions()
    # Annule la transaction PostgreSQL du test.
    reset_postgres_state()


@pytest_asyncio.fixture
async def async_database():
    """Sessions async reelles (asyncpg), annulees en fin de test dans la meme boucle."""
    database, close = await open_async_test_database()
    yield database
    await close()


@pytest_asyncio.fixture
async def committed_async_database():
    """Comme `async_database`, mais avec de vrais commits sur des connexions distinctes :
    reserve aux tests de concurrence. Toutes les tables sont videes a la fin."""
    database, close = await open_committed_async_test_database()
    yield database
    await close()


@pytest.fixture()
def async_db():
    """Hybrid session for synchronous TestClient tests of async endpoints."""
    db = make_test_session()
    yield db
    db.close()
