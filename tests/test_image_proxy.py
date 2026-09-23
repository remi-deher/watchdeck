"""Tests unitaires pour /api/image-proxy et son cache disque (app/routers/image_proxy_api.py)."""

from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import app.routers.image_proxy_api as image_proxy_api
from app.database import get_db_async as get_db
from app.dependencies import require_auth
from app.main import app
from app.models import LibraryItem, Settings

_REAL_SESSION_FACTORY = image_proxy_api.AsyncSessionLocal


def _client(db):
    """Client de test authentifié, avec un Settings.plex_url="http://plex.local" pour
    que l'allow-list de _allowed_image_hosts accepte les URLs de test ci-dessous.

    `_allowed_image_hosts` ouvre sa propre session (elle n'est plus injectée dans la
    route, pour ne pas payer une connexion par vignette servie depuis le cache disque) :
    on lui fournit donc celle du test, et on vide son cache d'hôtes — global au module,
    il fuiterait d'un test à l'autre."""
    db.add(Settings(plex_url="http://plex.local", plex_token="server-secret"))
    db.commit()
    app.dependency_overrides[require_auth] = lambda: None
    app.dependency_overrides[get_db] = lambda: db
    image_proxy_api.AsyncSessionLocal = lambda: db
    image_proxy_api._allowed_hosts_cache = (0.0, set())
    return TestClient(app, raise_server_exceptions=False)


def _cleanup():
    app.dependency_overrides.pop(require_auth, None)
    app.dependency_overrides.pop(get_db, None)
    image_proxy_api.AsyncSessionLocal = _REAL_SESSION_FACTORY
    image_proxy_api._allowed_hosts_cache = (0.0, set())


def _resp(status_code=200, content=b"fake-image-bytes", content_type="image/jpeg", location=None):
    r = MagicMock()
    r.status_code = status_code
    r.content = content
    headers = {"content-type": content_type}
    if location is not None:
        headers["location"] = location
    r.headers = headers
    r.is_redirect = status_code in (301, 302, 303, 307, 308) and location is not None
    if status_code >= 400 or r.is_redirect:
        import httpx as _httpx

        def _raise():
            raise _httpx.HTTPStatusError(f"status {status_code}", request=MagicMock(), response=r)

        r.raise_for_status = MagicMock(side_effect=_raise)
    else:
        r.raise_for_status = MagicMock()
    return r


def _png(width=1200, height=800):
    output = BytesIO()
    Image.new("RGB", (width, height), "#336699").save(output, format="PNG")
    return output.getvalue()


def _fake_httpx_client(resp=None, side_effect=None):
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    if side_effect is not None:
        client.get = AsyncMock(side_effect=side_effect)
    else:
        client.get = AsyncMock(return_value=resp)
    return client


@pytest.fixture()
def cache_dir(tmp_path):
    with patch("app.routers.image_proxy_api._IMAGE_CACHE_DIR", str(tmp_path / "image_cache")):
        yield tmp_path / "image_cache"


def test_image_proxy_invalid_url_rejected(async_db):
    client = _client(async_db)
    try:
        resp = client.get("/api/image-proxy?url=not-a-url")
        assert resp.status_code == 400
    finally:
        _cleanup()


def test_image_proxy_disallowed_host_rejected(async_db):
    client = _client(async_db)
    try:
        resp = client.get("/api/image-proxy?url=http://169.254.169.254/secret")
        assert resp.status_code == 400
    finally:
        _cleanup()


@pytest.mark.parametrize("host", ["metadata-static.plex.tv", "m.media-amazon.com"])
def test_image_proxy_allows_metadata_poster_hosts(cache_dir, async_db, host):
    client = _client(async_db)
    fake = _fake_httpx_client(resp=_resp())
    try:
        with patch("app.routers.image_proxy_api.httpx.AsyncClient", return_value=fake):
            resp = client.get(f"/api/image-proxy?url=https://{host}/poster.jpg")
        assert resp.status_code == 200
        fake.get.assert_awaited_once_with(f"https://{host}/poster.jpg", headers={})
    finally:
        _cleanup()


def test_image_proxy_follows_redirect_to_allowed_host(cache_dir, async_db):
    """Plex redirige vers sa propre CDN (images.plex.tv) pour une affiche qu'il n'a pas
    en cache local -- cas legitime frequent, doit aboutir en 200, pas en 502."""
    client = _client(async_db)
    redirect = _resp(status_code=302, location="https://images.plex.tv/photo?url=x")
    final = _resp()
    fake = _fake_httpx_client(side_effect=[redirect, final])
    try:
        with patch("app.routers.image_proxy_api.httpx.AsyncClient", return_value=fake):
            resp = client.get("/api/image-proxy?url=http://plex.local/poster.jpg")
        assert resp.status_code == 200
        assert resp.content == b"fake-image-bytes"
        assert fake.get.await_count == 2
    finally:
        _cleanup()


def test_image_proxy_rejects_redirect_to_disallowed_host(cache_dir, async_db):
    """Une redirection vers un hote HORS allowlist ne doit jamais etre suivie (SSRF) --
    reste un 502 (comme avant ce correctif), un seul appel amont."""
    client = _client(async_db)
    redirect = _resp(status_code=302, location="http://169.254.169.254/secret")
    fake = _fake_httpx_client(resp=redirect)
    try:
        with patch("app.routers.image_proxy_api.httpx.AsyncClient", return_value=fake):
            resp = client.get("/api/image-proxy?url=http://plex.local/poster.jpg")
        assert resp.status_code == 502
        fake.get.assert_awaited_once()
    finally:
        _cleanup()


def test_image_proxy_fetches_and_caches(cache_dir, async_db):
    client = _client(async_db)
    fake = _fake_httpx_client(resp=_resp())
    try:
        with patch("app.routers.image_proxy_api.httpx.AsyncClient", return_value=fake):
            resp = client.get("/api/image-proxy?url=http://plex.local/poster.jpg")
        assert resp.status_code == 200
        assert resp.content == b"fake-image-bytes"
        fake.get.assert_awaited_once()
        assert cache_dir.exists()
        assert len(list(cache_dir.glob("*.bin"))) == 1
    finally:
        _cleanup()


def test_library_image_proxy_hides_signed_plex_url(cache_dir, async_db):
    item = LibraryItem(
        title="Film",
        media_type="movie",
        poster_url="https://plex.local/library/metadata/42/thumb?X-Plex-Token=secret",
    )
    async_db.add(item)
    async_db.commit()
    client = _client(async_db)
    fake = _fake_httpx_client(resp=_resp(content=_png(), content_type="image/png"))
    try:
        with patch("app.routers.image_proxy_api.httpx.AsyncClient", return_value=fake):
            resp = client.get(f"/api/image-proxy/library/{item.id}")
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("image/webp")
        upstream_url = fake.get.await_args.args[0]
        assert "X-Plex-Token" not in upstream_url
        assert fake.get.await_args.kwargs["headers"] == {"X-Plex-Token": "server-secret"}
        assert "X-Plex-Token" not in str(resp.request.url)
    finally:
        _cleanup()


def test_plex_path_proxy_adds_server_token_only_upstream(cache_dir, async_db):
    client = _client(async_db)
    fake = _fake_httpx_client(resp=_resp())
    try:
        with patch("app.routers.image_proxy_api.httpx.AsyncClient", return_value=fake):
            resp = client.get("/api/image-proxy?plex_path=%2Flibrary%2Fmetadata%2F42%2Fthumb")
        assert resp.status_code == 200
        assert "X-Plex-Token" not in str(resp.request.url)
        fake.get.assert_awaited_once_with(
            "http://plex.local/library/metadata/42/thumb",
            headers={"X-Plex-Token": "server-secret"},
        )
    finally:
        _cleanup()


def test_image_proxy_second_call_uses_cache_not_plex(cache_dir, async_db):
    """Régression : un deuxième affichage de la même image ne doit plus jamais
    retaper Plex — c'est ce qui évite de le saturer lors des rafales de vignettes."""
    client = _client(async_db)
    fake = _fake_httpx_client(resp=_resp())
    try:
        with patch("app.routers.image_proxy_api.httpx.AsyncClient", return_value=fake):
            first = client.get("/api/image-proxy?url=http://plex.local/poster.jpg")
            second = client.get("/api/image-proxy?url=http://plex.local/poster.jpg")
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.content == b"fake-image-bytes"
        fake.get.assert_awaited_once()  # une seule requete Plex pour les deux appels
    finally:
        _cleanup()


def test_image_proxy_expired_cache_refetches(cache_dir, async_db):
    client = _client(async_db)
    fake = _fake_httpx_client(resp=_resp())
    try:
        with patch("app.routers.image_proxy_api.httpx.AsyncClient", return_value=fake):
            client.get("/api/image-proxy?url=http://plex.local/poster.jpg")
        with patch("app.routers.image_proxy_api.time.time", return_value=__import__("time").time() + 999999):
            with patch("app.routers.image_proxy_api.httpx.AsyncClient", return_value=fake):
                client.get("/api/image-proxy?url=http://plex.local/poster.jpg")
        assert fake.get.await_count == 2
    finally:
        _cleanup()


def test_image_proxy_serves_stale_cache_on_plex_failure(cache_dir, async_db):
    """Régression : si Plex échoue mais qu'une version (même périmée) est en cache,
    on la sert plutôt que de renvoyer 502 — l'incident rapporté ('image inaccessible'
    lors des rafales) doit devenir invisible pour l'utilisateur une fois l'image
    déjà vue une première fois."""
    client = _client(async_db)
    fake_ok = _fake_httpx_client(resp=_resp())
    fake_fail = _fake_httpx_client(side_effect=Exception("connection reset"))
    try:
        with patch("app.routers.image_proxy_api.httpx.AsyncClient", return_value=fake_ok):
            first = client.get("/api/image-proxy?url=http://plex.local/poster.jpg")
        assert first.status_code == 200

        # Force le cache a etre considere perime pour declencher un re-fetch...
        with patch("app.routers.image_proxy_api.time.time", return_value=__import__("time").time() + 999999):
            with patch("app.routers.image_proxy_api.httpx.AsyncClient", return_value=fake_fail):
                second = client.get("/api/image-proxy?url=http://plex.local/poster.jpg")
        # ...qui echoue cote Plex, mais le cache perime sert quand meme de filet.
        assert second.status_code == 200
        assert second.content == b"fake-image-bytes"
    finally:
        _cleanup()


def test_image_proxy_no_cache_and_plex_failure_returns_502(async_db):
    """Comportement preexistant : sans aucun cache, un echec Plex reste un 502."""
    client = _client(async_db)
    fake_fail = _fake_httpx_client(side_effect=Exception("connection reset"))
    with patch("app.routers.image_proxy_api._IMAGE_CACHE_DIR", "/nonexistent/path/that/has/no/cache"):
        try:
            with patch("app.routers.image_proxy_api.httpx.AsyncClient", return_value=fake_fail):
                resp = client.get("/api/image-proxy?url=http://plex.local/poster.jpg")
            assert resp.status_code == 502
        finally:
            _cleanup()


def test_image_proxy_rejects_non_image_content_type(cache_dir, async_db):
    client = _client(async_db)
    fake = _fake_httpx_client(resp=_resp(content_type="text/html"))
    try:
        with patch("app.routers.image_proxy_api.httpx.AsyncClient", return_value=fake):
            resp = client.get("/api/image-proxy?url=http://plex.local/poster.jpg")
        assert resp.status_code == 415
    finally:
        _cleanup()


@pytest.mark.parametrize("image_format", ["webp", "avif"])
def test_image_proxy_creates_cached_thumbnail(cache_dir, async_db, image_format):
    client = _client(async_db)
    fake = _fake_httpx_client(resp=_resp(content=_png(), content_type="image/png"))
    url = f"/api/image-proxy?url=http://plex.local/poster.png&width=300&format={image_format}"
    try:
        with patch("app.routers.image_proxy_api.httpx.AsyncClient", return_value=fake):
            first = client.get(url)
            second = client.get(url, headers={"If-None-Match": first.headers["etag"]})
        assert first.status_code == 200
        assert first.headers["content-type"].startswith(f"image/{image_format}")
        with Image.open(BytesIO(first.content)) as image:
            assert image.width == 300
            assert image.height == 200
        assert second.status_code == 304
        fake.get.assert_awaited_once()
        assert len(list(cache_dir.glob("*.bin"))) == 2  # original + variante WebP
    finally:
        _cleanup()


def test_image_proxy_cache_hit_opens_no_db_session(cache_dir, async_db):
    """Une vignette servie depuis le cache disque ne doit ouvrir aucune connexion DB.

    L'allow-list d'hôtes était auparavant injectée dans la route (`Depends(get_db_async)`),
    donc payée à chaque image : une grille de bibliothèque de 200 affiches ouvrait
    200 sessions dans l'unique process uvicorn. Elle est désormais résolue depuis le cache
    d'hôtes du module, et la session n'est ouverte que pour le remplir.
    """
    client = _client(async_db)
    fake = _fake_httpx_client(resp=_resp())
    sessions_opened = []
    try:
        with patch("app.routers.image_proxy_api.httpx.AsyncClient", return_value=fake):
            first = client.get("/api/image-proxy?url=http://plex.local/poster.jpg")
        assert first.status_code == 200

        def _counting_factory():
            sessions_opened.append(1)
            return async_db

        # Les deux voies d'accès à la base sont comptées : la fabrique de session du
        # module *et* la dépendance FastAPI, pour que le test échoue aussi si la route
        # revenait à injecter `Depends(get_db_async)`.
        image_proxy_api.AsyncSessionLocal = _counting_factory
        app.dependency_overrides[get_db] = _counting_factory

        second = client.get("/api/image-proxy?url=http://plex.local/poster.jpg")
        assert second.status_code == 200
        assert sessions_opened == []
    finally:
        _cleanup()


def test_image_proxy_etag_is_stable_across_requests(cache_dir, async_db):
    """L'ETag ne dépend plus du hachage de l'image entière mais de la variante et de sa
    date de mise en cache : il doit rester identique tant que le fichier ne change pas,
    sinon le navigateur retéléchargerait toutes les affiches à chaque affichage."""
    client = _client(async_db)
    fake = _fake_httpx_client(resp=_resp())
    try:
        with patch("app.routers.image_proxy_api.httpx.AsyncClient", return_value=fake):
            first = client.get("/api/image-proxy?url=http://plex.local/poster.jpg")
        etag = first.headers["etag"]
        assert etag

        again = client.get("/api/image-proxy?url=http://plex.local/poster.jpg")
        assert again.headers["etag"] == etag

        not_modified = client.get(
            "/api/image-proxy?url=http://plex.local/poster.jpg",
            headers={"If-None-Match": etag},
        )
        assert not_modified.status_code == 304
        assert not_modified.content == b""
        assert not_modified.headers["etag"] == etag
    finally:
        _cleanup()


@pytest.mark.parametrize(
    "query",
    ["", "?url=http%3A%2F%2Fplex.local%2Fa.jpg&plex_path=%2Flibrary%2Fmetadata%2F1%2Fthumb"],
)
def test_image_proxy_requires_exactly_one_source(async_db, query):
    client = _client(async_db)
    try:
        assert client.get(f"/api/image-proxy{query}").status_code == 400
    finally:
        _cleanup()


@pytest.mark.parametrize(
    "plex_path",
    [
        "library/metadata/1/thumb",
        "//evil.local/library/metadata/1/thumb",
        "/photo/transcode",
        "/library/metadata/../../etc/passwd",
        "/library/metadata/%2e%2e/secret",
    ],
)
def test_plex_path_proxy_rejects_unsafe_paths(async_db, plex_path):
    client = _client(async_db)
    try:
        resp = client.get("/api/image-proxy", params={"plex_path": plex_path})
        assert resp.status_code == 400
    finally:
        _cleanup()


def test_plex_path_proxy_without_plex_configured_returns_404(async_db):
    app.dependency_overrides[require_auth] = lambda: None
    image_proxy_api.AsyncSessionLocal = lambda: async_db
    image_proxy_api._allowed_hosts_cache = (0.0, set())
    client = TestClient(app, raise_server_exceptions=False)
    try:
        resp = client.get("/api/image-proxy", params={"plex_path": "/library/metadata/1/thumb"})
        assert resp.status_code == 404
    finally:
        _cleanup()


def test_embedded_plex_token_is_replaced_by_server_token(cache_dir, async_db):
    client = _client(async_db)
    fake = _fake_httpx_client(resp=_resp())
    try:
        with patch("app.routers.image_proxy_api.httpx.AsyncClient", return_value=fake):
            resp = client.get(
                "/api/image-proxy",
                params={"url": "http://plex.local/library/metadata/7/thumb?X-Plex-Token=leaked&w=1"},
            )
        assert resp.status_code == 200
        upstream_url = fake.get.await_args.args[0]
        assert "leaked" not in upstream_url
        assert fake.get.await_args.kwargs["headers"] == {"X-Plex-Token": "server-secret"}
    finally:
        _cleanup()


def test_embedded_plex_token_on_foreign_host_is_rejected(async_db):
    client = _client(async_db)
    try:
        with patch.object(image_proxy_api, "_allowed_image_hosts", AsyncMock(return_value={"image.tmdb.org"})):
            resp = client.get(
                "/api/image-proxy",
                params={"url": "https://image.tmdb.org/t/p/w500/a.jpg?X-Plex-Token=leaked"},
            )
        assert resp.status_code == 400
    finally:
        _cleanup()


def test_request_image_proxy_unknown_request_returns_404(async_db):
    client = _client(async_db)
    try:
        assert client.get("/api/image-proxy/request/999999").status_code == 404
    finally:
        _cleanup()


def test_request_image_proxy_hides_signed_plex_url(cache_dir, async_db):
    from datetime import datetime

    from app.models import MediaRequest

    media_request = MediaRequest(
        plex_user_id="u1",
        plex_user="u1",
        title="Film",
        media_type="movie",
        status="pending",
        requested_at=datetime(2026, 1, 15),
        poster_url="http://plex.local/library/metadata/9/thumb?X-Plex-Token=secret",
    )
    async_db.add(media_request)
    async_db.commit()
    client = _client(async_db)
    fake = _fake_httpx_client(resp=_resp(content=_png(), content_type="image/png"))
    try:
        with patch("app.routers.image_proxy_api.httpx.AsyncClient", return_value=fake):
            resp = client.get(f"/api/image-proxy/request/{media_request.id}")
        assert resp.status_code == 200
        assert "secret" not in fake.get.await_args.args[0]
        assert fake.get.await_args.kwargs["headers"] == {"X-Plex-Token": "server-secret"}
    finally:
        _cleanup()


def test_plex_image_proxy_url_without_path_is_none():
    from app.utils import plex_image_proxy_url

    assert plex_image_proxy_url(None) is None
    assert plex_image_proxy_url("") is None
