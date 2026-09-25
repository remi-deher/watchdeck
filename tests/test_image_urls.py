"""URL d'affiches : ce qu'on stocke, ce qu'on sert, ce qu'on envoie hors de l'application.

Le client recoit les affiches enveloppees dans /api/image-proxy. Renvoyees telles quelles
(import manuel), elles etaient stockees sous cette forme : absentes des rails, cassees dans
l'audit VF et inutilisables dans les e-mails.
"""

import importlib.util
from pathlib import Path
from urllib.parse import quote_plus

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi.testclient import TestClient

from app.database import get_db_async
from app.dependencies import require_admin, require_auth
from app.main import app
from app.models import ArrInstance, MediaRequest
from app.services.notifications import _build_discord_embed
from app.utils import arr_image_url, public_image_url, unwrap_image_proxy, wrap_image_proxy

TVDB = "https://artworks.thetvdb.com/banners/v4/series/465973/posters/69ed2d3756d09.jpg"
WRAPPED = f"/api/image-proxy?url={quote_plus(TVDB)}&width=600&quality=82&format=webp"


def test_wrapped_fixture_matches_server_wrapping():
    assert wrap_image_proxy(TVDB) == WRAPPED
    assert unwrap_image_proxy(WRAPPED) == TVDB


def test_manual_import_stores_source_url_not_proxy_url(async_db):
    instance = ArrInstance(name="Sonarr", arr_type="sonarr", url="http://sonarr", api_key="k", enabled=True)
    async_db.add(instance)
    async_db.commit()
    app.dependency_overrides[get_db_async] = lambda: async_db
    app.dependency_overrides[require_auth] = lambda: None
    app.dependency_overrides[require_admin] = lambda: None
    try:
        response = TestClient(app).post(
            "/api/downloads/manual-import",
            json={
                "instance_id": instance.id,
                "media_type": "show",
                "title": "Smoking Behind the Supermarket with You",
                "arr_id": 42,
                "poster_url": WRAPPED,
            },
        )
        assert response.status_code == 200
        stored = async_db.query(MediaRequest).filter_by(id=response.json()["request_id"]).one()
        assert stored.poster_url == TVDB
    finally:
        for dep in (get_db_async, require_auth, require_admin):
            app.dependency_overrides.pop(dep, None)


def test_arr_image_url_completes_instance_paths_and_skips_proxy_urls():
    assert arr_image_url("/MediaCover/1/poster.jpg", "http://sonarr:8989/") == wrap_image_proxy(
        "http://sonarr:8989/MediaCover/1/poster.jpg"
    )
    # Une URL deja proxifiee n'est pas un chemin de l'instance.
    assert arr_image_url(WRAPPED, "http://sonarr:8989") == WRAPPED
    assert arr_image_url(TVDB, "http://sonarr:8989") == WRAPPED
    assert arr_image_url("/MediaCover/1/poster.jpg", None) is None
    assert arr_image_url(None, "http://sonarr") is None


def test_public_image_url_only_keeps_urls_reachable_by_recipients():
    assert public_image_url(TVDB) == TVDB
    assert public_image_url(WRAPPED) == TVDB
    assert public_image_url("/api/image-proxy?plex_path=%2Flibrary%2Fmetadata%2F9%2Fthumb") is None
    assert public_image_url("http://192.168.1.51:32400/library/metadata/1/thumb") is None
    assert public_image_url("https://plex.example.com/thumb?X-Plex-Token=secret") is None
    assert public_image_url("http://sonarr:8989/MediaCover/1/poster.jpg") is None
    assert public_image_url("http://nas.local/poster.jpg") is None
    assert public_image_url(None) is None


def test_discord_embed_uses_public_poster_only():
    request = MediaRequest(title="X", media_type="tv", plex_user_id="u", poster_url=WRAPPED)
    assert _build_discord_embed("request_created", request)["thumbnail"] == {"url": TVDB}
    request.poster_url = "http://192.168.1.51:32400/library/metadata/1/thumb"
    assert "thumbnail" not in _build_discord_embed("request_created", request)


def _load_migration():
    path = Path(__file__).resolve().parent.parent / "alembic" / "versions" / "0027_unwrap_stored_proxy_posters.py"
    spec = importlib.util.spec_from_file_location("m0027", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_rewrites_stored_proxy_urls():
    engine = sa.create_engine("sqlite://")
    plex_path = "/api/image-proxy?plex_path=%2Flibrary%2Fmetadata%2F9%2Fthumb"
    with engine.begin() as conn:
        for table in ("media_requests", "download_history", "library_items"):
            conn.execute(sa.text(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY, poster_url TEXT)"))
        conn.execute(
            sa.text("INSERT INTO media_requests VALUES (1, :a), (2, :b), (3, :c)"),
            {"a": WRAPPED, "b": TVDB, "c": plex_path},
        )
        conn.execute(sa.text("INSERT INTO download_history VALUES (1, :a)"), {"a": WRAPPED})
        migration = _load_migration()
        with Operations.context(MigrationContext.configure(conn)):
            migration.upgrade()
        rows = dict(conn.execute(sa.text("SELECT id, poster_url FROM media_requests")).fetchall())
        assert rows == {1: TVDB, 2: TVDB, 3: plex_path}
        assert conn.execute(sa.text("SELECT poster_url FROM download_history")).scalar() == TVDB
