"""
Point d'entrée de l'application FastAPI.

Responsabilités :
- Initialisation de la base de données (migrations Alembic + seed)
- Arrêt propre des services partagés (les tâches de fond tournent dans le worker ARQ)
- Montage de tous les routers (pages HTML, API REST, webhook, import/export, templates email)
"""

import asyncio
import hashlib
import json
import logging
import os
import re
import time
from base64 import b64decode, b64encode
from contextlib import asynccontextmanager
from html.parser import HTMLParser
from urllib.parse import quote

import itsdangerous
import sqlalchemy
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import FileResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from itsdangerous.exc import BadSignature
from sqlalchemy.ext.asyncio import AsyncSession as SqlSession
from sqlalchemy.future import select
from starlette.datastructures import MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.sessions import Session
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .cache import cache
from .database import get_db_async as get_db
from .database import init_db
from .dependencies import require_admin
from .error_handlers import register_domain_exception_handlers
from .log_buffer import install as install_log_buffer
from .routers import (
    activity_api,
    admin_overview_api,
    api_v1,
    arr_instances_api,
    arr_queue_api,
    arr_releases_api,
    auth,
    backup_api,
    calendar_api,
    client_capabilities_api,
    conflicts_api,
    corrections_api,
    dashboard_api,
    discover_api,
    download_clients_api,
    downloads_api,
    email_providers_api,
    email_templates,
    events_api,
    i18n_api,
    image_proxy_api,
    importexport,
    issues_api,
    library_analytics_api,
    library_api,
    maintenance,
    manual_import_api,
    me_api,
    message_reasons_api,
    metrics_api,
    newsletter_api,
    notifications_api,
    onboarding_api,
    plex_servers_api,
    prowlarr_api,
    requests_api,
    scheduled_tasks_api,
    security_api,
    settings_api,
    storage_access_api,
    storage_api,
    storage_connections_api,
    subtitles_api,
    system_api,
    users_api,
    vf_upgrades_api,
    vff_api,
    webhook,
    webhook_admin,
)
from .services.auth import get_secret_key
from .services.session_security import cached_session_state
from .utils import safe_redirect_path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
install_log_buffer()


async def _warn_if_database_superuser(db) -> None:
    """Le role PostgreSQL de l'application n'a pas besoin d'etre superutilisateur ; s'il
    l'est, une injection SQL ou une restauration piegee pourrait executer des commandes
    sur le serveur de base de donnees (COPY ... PROGRAM). Voir docs/OPERATIONS.md."""
    try:
        is_super = (
            await db.execute(sqlalchemy.text("SELECT rolsuper FROM pg_roles WHERE rolname = current_user"))
        ).scalar()
    except Exception:
        return
    if is_super:
        logging.warning(
            "Le role PostgreSQL de Watchdeck est superutilisateur : creez un role dedie sans ce privilege "
            "(voir docs/OPERATIONS.md, section Securite)."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gère le cycle de vie de l'application : démarrage et arrêt propre."""
    try:
        os.makedirs("data", exist_ok=True)
        logging.info("Running DB migrations...")
        await init_db()
        logging.info("DB OK. Starting API services...")
        from .database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            await _warn_if_database_superuser(db)

        from .services.image_warmup import register_listeners

        register_listeners()
        logging.info("Background work delegated to ARQ")
        from .services.arr_history import sync_all_enabled_instances

        app.state.arr_history_sync = asyncio.create_task(sync_all_enabled_instances())
        logging.info("App ready.")
    except Exception:
        logging.exception("STARTUP FAILED")
        raise
    yield
    history_sync = getattr(app.state, "arr_history_sync", None)
    if history_sync and not history_sync.done():
        history_sync.cancel()
    from .routers.image_proxy_api import close_image_refreshes
    from .services.arr_http_client import close_arr_clients
    from .services.image_warmup import stop_image_warmup
    from .services.playback_preload import stop_playback_images

    await stop_playback_images()
    await stop_image_warmup()
    await close_image_refreshes()
    await close_arr_clients()
    await cache.close()
    logging.info("Shutdown complete.")


class _InlineScriptCollector(HTMLParser):
    """Releve le contenu des scripts en ligne (sans attribut src) du shell SPA."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.scripts: list[str] = []
        self._current: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "script" and not any(name == "src" for name, _ in attrs):
            self._current = []

    def handle_data(self, data):
        if self._current is not None:
            self._current.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._current is not None:
            self.scripts.append("".join(self._current))
            self._current = None


def _inline_scripts(html: str) -> list[str]:
    collector = _InlineScriptCollector()
    collector.feed(html)
    collector.close()
    return collector.scripts


_csp_cache: tuple[float, str] = (-1.0, "")


def _content_security_policy() -> str:
    """CSP de l'application. Le seul script en ligne autorise est celui du shell SPA
    (pose du theme avant le premier rendu), par son empreinte : elle est recalculee
    quand index.html change, a chaque build."""
    global _csp_cache
    index_path = os.path.join("app", "static", "vue", "index.html")
    try:
        mtime = os.path.getmtime(index_path)
    except OSError:
        mtime = 0.0
    if _csp_cache[0] == mtime:
        return _csp_cache[1]
    script_hashes = []
    if mtime:
        try:
            with open(index_path, encoding="utf-8") as f:
                html = f.read()
            for body in _inline_scripts(html):
                digest = b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode("ascii")
                script_hashes.append(f"'sha256-{digest}'")
        except OSError:
            pass
    policy = "; ".join(
        [
            "default-src 'self'",
            "script-src 'self' " + " ".join(script_hashes) if script_hashes else "script-src 'self'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' data: https://fonts.gstatic.com",
            "img-src 'self' data: blob: https:",
            "connect-src 'self'",
            "frame-src 'self' https://www.openstreetmap.org",
            "worker-src 'self'",
            "manifest-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        ]
    )
    _csp_cache = (mtime, policy)
    return policy


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        started_at = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - started_at) * 1000
        response.headers["Server-Timing"] = f"app;dur={duration_ms:.1f}"
        response.headers["X-Response-Time-Ms"] = f"{duration_ms:.1f}"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers.setdefault("Content-Security-Policy", _content_security_policy())
        if _request_is_https(request.scope):
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        return response


_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class CrossSiteRequestGuard:
    """Refuse les requetes d'ecriture envoyees par un autre site avec le cookie de session.

    `SameSite=Lax` ecarte deja les sites tiers, mais pas un sous-domaine frere (meme
    « site » au sens du navigateur, ex. une autre application auto-hebergee sur
    *.mondomaine). `Sec-Fetch-Site` est calcule par le navigateur lui-meme, sans
    dependre des en-tetes Host reecrits par un reverse-proxy : seules les requetes
    `same-origin` (ou saisies directement, `none`) peuvent modifier quelque chose. Les
    clients sans cet en-tete (webhooks Sonarr/Radarr/Plex, scripts avec token API)
    ne sont pas concernes.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope.get("method", "GET") not in _SAFE_METHODS:
            headers = dict(scope.get("headers") or [])
            fetch_site = headers.get(b"sec-fetch-site", b"").decode("latin-1").lower()
            if fetch_site in ("cross-site", "same-site"):
                response = Response(
                    content='{"detail":"Requête intersite refusée"}',
                    status_code=403,
                    media_type="application/json",
                )
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


class CacheControlledStaticFiles(StaticFiles):
    """Cache long pour les chunks Vite hashés, revalidation pour le shell SPA."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if path.startswith("assets/") or "/assets/" in scope.get("path", ""):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif path.endswith(".html"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        else:
            response.headers["Cache-Control"] = "no-cache"
        return response


class SessionSyncMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        # Les droits sont resynchronises periodiquement, pas sur chaque ressource/API.
        # Une page comme le dashboard emet plusieurs appels concurrents : auparavant,
        # chacun ajoutait inutilement une lecture PostgreSQL. Le delai reste court afin
        # qu'une revocation de droits prenne effet rapidement : un compte supprime,
        # desactive ou dont les sessions ont ete revoquees perd la sienne ici.
        now = int(time.time())
        ttl = max(5, int(os.getenv("SESSION_ROLE_SYNC_TTL_SECONDS", "60")))
        last_sync = int(request.session.get("role_synced_at") or 0)
        if request.session.get("authenticated") and now - last_sync >= ttl:
            try:
                result = await cached_session_state(
                    request.session.get("plex_user_id"),
                    request.session.get("username"),
                    request.session.get("user_id"),
                    int(request.session.get("sv") or 0),
                    ttl,
                )
                if result.get("_revoked"):
                    request.session.clear()
                else:
                    request.session.update(result)
                    request.session["role_synced_at"] = now
            except Exception:
                logging.getLogger(__name__).warning("Resynchronisation de session impossible", exc_info=True)
        return await call_next(request)


def _request_is_https(scope: Scope) -> bool:
    """Détecte si la requête d'origine était en HTTPS.

    Couvre deux cas : TLS terminé directement par uvicorn (scope["scheme"]),
    et TLS terminé en amont par un reverse-proxy (Traefik/Caddy/nginx) qui
    transmet l'info via l'en-tête X-Forwarded-Proto.
    """
    if scope.get("scheme") == "https":
        return True
    headers = dict(scope.get("headers") or [])
    proto = headers.get(b"x-forwarded-proto", b"").decode("latin-1").split(",")[0].strip().lower()
    return proto == "https"


class DynamicSecureSessionMiddleware:
    """Équivalent de starlette.middleware.sessions.SessionMiddleware, mais le flag
    `Secure` du cookie de session est déterminé par requête plutôt que figé au
    démarrage. Cela permet un déploiement plug-and-play : le cookie reste
    utilisable en HTTP direct (installation locale sans TLS) tout en devenant
    `Secure` automatiquement dès que l'app est servie en HTTPS, y compris
    derrière un reverse-proxy qui termine le TLS.
    """

    def __init__(
        self,
        app: ASGIApp,
        secret_key: str,
        session_cookie: str = "session",
        max_age: int = 14 * 24 * 60 * 60,
        path: str = "/",
        # "strict" provoque des déconnexions intempestives sur Safari iOS : WebKit
        # recharge parfois un onglet suspendu en arrière-plan (ou un lancement depuis
        # l'écran d'accueil) d'une façon où le cookie Strict n'est pas renvoyé, alors
        # qu'il ne s'agit pas d'une vraie navigation intersite. "lax" couvre ce cas
        # (cookie envoyé sur les navigations top-level en GET) tout en bloquant le
        # cookie sur les requêtes POST/fetch intersites forgées (protection CSRF).
        same_site: str = "lax",
    ) -> None:
        self.app = app
        self.signer = itsdangerous.TimestampSigner(secret_key)
        self.session_cookie = session_cookie
        self.max_age = max_age
        self.path = path
        self.base_flags = f"httponly; samesite={same_site}"

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        connection_cookies = Request(scope).cookies
        initial_session_was_empty = True

        if self.session_cookie in connection_cookies:
            data = connection_cookies[self.session_cookie].encode("utf-8")
            try:
                data = self.signer.unsign(data, max_age=self.max_age)
                scope["session"] = Session(json.loads(b64decode(data)))
                initial_session_was_empty = False
            except BadSignature:
                scope["session"] = Session()
        else:
            scope["session"] = Session()

        security_flags = self.base_flags + ("; secure" if _request_is_https(scope) else "")

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                session: Session = scope["session"]
                headers = MutableHeaders(scope=message)
                if session.accessed:
                    headers.add_vary_header("Cookie")
                if session.modified and session:
                    data = b64encode(json.dumps(session).encode("utf-8"))
                    data = self.signer.sign(data)
                    header_value = "{session_cookie}={data}; path={path}; {max_age}{security_flags}".format(
                        session_cookie=self.session_cookie,
                        data=data.decode("utf-8"),
                        path=self.path,
                        max_age=f"Max-Age={self.max_age}; " if self.max_age else "",
                        security_flags=security_flags,
                    )
                    headers.append("Set-Cookie", header_value)
                elif session.modified and not initial_session_was_empty:
                    header_value = "{session_cookie}={data}; path={path}; {expires}{security_flags}".format(
                        session_cookie=self.session_cookie,
                        data="null",
                        path=self.path,
                        expires="expires=Thu, 01 Jan 1970 00:00:00 GMT; ",
                        security_flags=security_flags,
                    )
                    headers.append("Set-Cookie", header_value)
            await send(message)

        await self.app(scope, receive, send_wrapper)


app = FastAPI(title="Watchdeck", version="1.0.0", lifespan=lifespan, docs_url=None, redoc_url=None)
register_domain_exception_handlers(app)


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)


@app.get("/api/docs", include_in_schema=False)
async def get_documentation(request: Request, db: SqlSession = Depends(get_db)):
    await require_admin(request, db)
    return get_swagger_ui_html(openapi_url="/api/openapi.json", title="Watchdeck API Docs")


@app.get("/api/openapi.json", include_in_schema=False)
async def get_open_api_endpoint(request: Request, db: SqlSession = Depends(get_db)):
    await require_admin(request, db)
    return get_openapi(title="Watchdeck", version="1.0.0", routes=app.routes)


app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=5)
app.add_middleware(SessionSyncMiddleware)
# Middleware de session (doit être ajouté avant les routers)
app.add_middleware(DynamicSecureSessionMiddleware, secret_key=get_secret_key())
# Ajoute en dernier, donc execute en premier : une requete intersite est refusee avant
# meme la lecture de la session.
app.add_middleware(CrossSiteRequestGuard)

# `app/static/vue` est la sortie de `npm run build`, qui n'est plus suivie par git : le
# Dockerfile la reconstruit, et un clone neuf ne l'a pas encore. `check_dir=False` laisse
# l'API demarrer (et la suite pytest tourner) sans frontend compile ; les pages Vue
# repondent alors 404 jusqu'au premier build.
app.mount("/static", StaticFiles(directory="app/static", check_dir=False), name="static")
app.mount("/vue", CacheControlledStaticFiles(directory="app/static/vue", check_dir=False), name="vue")

app.include_router(auth.router)
app.include_router(activity_api.router)
app.include_router(admin_overview_api.router)
app.include_router(settings_api.router)
app.include_router(system_api.router)

app.include_router(storage_access_api.router)
app.include_router(storage_connections_api.router)
app.include_router(storage_api.router)
app.include_router(arr_instances_api.router)
app.include_router(plex_servers_api.router)
app.include_router(download_clients_api.router)
app.include_router(prowlarr_api.router)
app.include_router(subtitles_api.router)
app.include_router(newsletter_api.router)
app.include_router(arr_releases_api.router)
app.include_router(arr_queue_api.router)
app.include_router(manual_import_api.router)
app.include_router(downloads_api.router)
app.include_router(users_api.router)
app.include_router(security_api.router)
app.include_router(me_api.router)
app.include_router(requests_api.router)
app.include_router(calendar_api.router)
app.include_router(client_capabilities_api.router)
app.include_router(dashboard_api.router)
app.include_router(library_api.router)
app.include_router(library_analytics_api.router)
app.include_router(issues_api.router)
app.include_router(message_reasons_api.router)
app.include_router(corrections_api.router)
app.include_router(discover_api.router)
app.include_router(vff_api.router)
app.include_router(vf_upgrades_api.router)
app.include_router(metrics_api.router)
app.include_router(notifications_api.router)
app.include_router(scheduled_tasks_api.router)
app.include_router(image_proxy_api.router)
app.include_router(onboarding_api.router)
app.include_router(conflicts_api.router)
app.include_router(i18n_api.router)
app.include_router(api_v1.router)
app.include_router(webhook.router)
app.include_router(webhook_admin.router)
app.include_router(importexport.router)
app.include_router(backup_api.router)
app.include_router(email_templates.router)
app.include_router(email_providers_api.router)
app.include_router(maintenance.router)
app.include_router(events_api.router)

SPA_INDEX = os.path.join("app", "static", "vue", "index.html")
SPA_ROOTS = {
    "storage",
    "activity",
    "dashboard",
    "discover",
    "downloads",
    "requests",
    "library",
    "calendar",
    "users",
    "issues",
    "notifications",
    "logs",
    "settings",
    "maintenance",
    "profile",
    "releases",
    "media",
    "analytics",
    "vf-upgrades",
}
# Pages servies sans session : la SPA les rend avec une mise en page nue (sans navigation).
SPA_PUBLIC_ROOTS = {"login", "setup", "privacy"}

PWA_STATIC_FILES = {
    "manifest.webmanifest": ("app/static/vue/manifest.webmanifest", "application/manifest+json"),
    "manifest.json": ("app/static/vue/manifest.webmanifest", "application/manifest+json"),
    "sw.js": ("app/static/vue/sw.js", "application/javascript"),
    "favicon.ico": ("app/static/vue/favicon.ico", "image/x-icon"),
    "favicon.png": ("app/static/vue/favicon.png", "image/png"),
    "apple-touch-icon.png": ("app/static/vue/apple-touch-icon.png", "image/png"),
    "icon.svg": ("app/static/vue/icon.svg", "image/svg+xml"),
    "icon-192.png": ("app/static/vue/icon-192.png", "image/png"),
    "icon-512.png": ("app/static/vue/icon-512.png", "image/png"),
}


@app.get("/manifest.webmanifest", include_in_schema=False)
@app.get("/manifest.json", include_in_schema=False)
async def serve_manifest():
    path = os.path.join("app", "static", "vue", "manifest.webmanifest")
    if not os.path.exists(path):
        path = os.path.join("public", "manifest.webmanifest")
    if not os.path.exists(path):
        raise HTTPException(404, "Manifest non trouvé")
    return FileResponse(path, media_type="application/manifest+json", headers={"Cache-Control": "public, max-age=3600"})


@app.get("/sw.js", include_in_schema=False)
async def serve_service_worker():
    path = os.path.join("app", "static", "vue", "sw.js")
    if not os.path.exists(path):
        path = os.path.join("public", "sw.js")
    if not os.path.exists(path):
        raise HTTPException(404, "Service worker non trouvé")
    return FileResponse(
        path,
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Service-Worker-Allowed": "/",
        },
    )


@app.get("/favicon.ico", include_in_schema=False)
@app.get("/favicon.png", include_in_schema=False)
@app.get("/apple-touch-icon.png", include_in_schema=False)
@app.get("/icon.svg", include_in_schema=False)
async def serve_root_icon(request: Request):
    filename = request.url.path.lstrip("/")
    if filename in PWA_STATIC_FILES:
        target_path, mime = PWA_STATIC_FILES[filename]
        if not os.path.exists(target_path):
            target_path = os.path.join("public", filename)
        if os.path.exists(target_path):
            return FileResponse(target_path, media_type=mime, headers={"Cache-Control": "public, max-age=86400"})
    raise HTTPException(404, "Icône introuvable")


@app.get("/app", include_in_schema=False)
@app.get("/app/{legacy_path:path}", include_in_schema=False)
async def redirect_legacy_spa(legacy_path: str = ""):
    destination = f"/{legacy_path}" if legacy_path else "/dashboard"
    return RedirectResponse(safe_redirect_path(destination, default="/dashboard"), status_code=308)


@app.get("/templates", include_in_schema=False)
async def redirect_legacy_templates():
    return RedirectResponse("/settings?tab=templates", status_code=308)


@app.get("/setup/wizard", include_in_schema=False)
async def redirect_legacy_wizard():
    return RedirectResponse("/settings?tab=connections", status_code=308)


async def _public_page_redirect(request: Request, root: str, db: SqlSession) -> str | None:
    """Aiguillage des pages publiques, fait côté serveur pour éviter un aller-retour de la SPA."""
    if root == "privacy":
        return None
    from .routers.auth import setup_required

    needs_setup = await setup_required(db)
    if root == "setup":
        return None if needs_setup else "/"
    if needs_setup:
        return "/setup"
    if request.session.get("authenticated"):
        return safe_redirect_path(request.query_params.get("next") or "/")
    return None


@app.get("/", include_in_schema=False)
@app.get("/{spa_path:path}", include_in_schema=False)
async def serve_spa(request: Request, spa_path: str = "", db: SqlSession = Depends(get_db)):
    """Serve Vue history routes at the site root after every backend router."""
    root = spa_path.split("/", 1)[0] if spa_path else ""
    if root in SPA_PUBLIC_ROOTS and "/" not in spa_path.strip("/"):
        destination = await _public_page_redirect(request, root, db)
        if destination:
            return RedirectResponse(destination, status_code=302)
    elif root and root not in SPA_ROOTS:
        raise HTTPException(404, "Route introuvable")
    elif not request.session.get("authenticated"):
        if spa_path:
            next_value = quote(safe_redirect_path(f"/{spa_path}"), safe="")
            return RedirectResponse(f"/login?next={next_value}", status_code=302)
        return RedirectResponse("/login", status_code=302)
    if not os.path.exists(SPA_INDEX):
        raise HTTPException(503, "Build Vue introuvable")
    return FileResponse(
        SPA_INDEX,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )
