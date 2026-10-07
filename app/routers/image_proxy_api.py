"""Proxy et cache disque des affiches : contourne le blocage mixed-content et les hotes prives (serveur Plex/*arr du LAN, injoignable depuis l'exterieur)."""

import asyncio
import hashlib
import logging
import os as _os
import re
import tempfile
import time
from io import BytesIO
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from weakref import WeakValueDictionary

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from PIL import Image, UnidentifiedImageError
from sqlalchemy.future import select

from ..database import AsyncSessionLocal
from ..dependencies import require_auth
from ..models import ArrInstance, LibraryItem, MediaRequest, PlexServer, Settings
from ..utils import image_proxy_source, safe_error_message

router = APIRouter(prefix="/api", tags=["misc"])
logger = logging.getLogger(__name__)

_STATIC_ALLOWED_IMAGE_HOSTS = {
    "image.tmdb.org",
    "artworks.thetvdb.com",
    "thetvdb.com",
    "banner.thetvdb.com",
    "media.themoviedb.org",
    "plex.tv",
    # CDN d'affiches renvoyé par les métadonnées Plex (distinct de images.plex.tv).
    "metadata-static.plex.tv",
    # Certaines métadonnées IMDb/Plex conservent directement l'affiche Amazon.
    "m.media-amazon.com",
    # Relais officiel de Plex pour les affiches qu'il n'a pas en cache local (l'agent
    # metadonnees n'a pas telecharge de copie) : Plex redirige alors vers sa propre CDN,
    # qui proxifie a son tour TMDB -- voir la gestion de redirection unique plus bas.
    "images.plex.tv",
}
_allowed_hosts_cache: tuple[float, set[str]] = (0.0, set())
# hote:port -> jeton des serveurs Plex supplementaires (voir models.PlexServer), rafraichi avec
# l'allowlist : leurs affiches sont memorisees en URL complete, sans jeton.
_secondary_plex_tokens: dict[str, str] = {}
_allowed_hosts_lock = asyncio.Lock()


async def _allowed_image_hosts() -> set[str]:
    """Hôtes vers lesquels /api/image-proxy est autorisé à faire une requête.

    Limité aux hôtes explicitement configurés par l'admin (serveur Plex, instances
    *arr) plus le CDN TMDB, afin d'empêcher un utilisateur authentifié d'utiliser ce
    proxy pour atteindre des hôtes internes/externes arbitraires (SSRF).

    La session DB est ouverte ici, seulement quand le cache (60 s) est froid, plutot
    qu'injectee dans la route : une grille de posters declenchait sinon une connexion par
    image, y compris pour les requetes servies depuis le cache disque.
    """
    global _allowed_hosts_cache
    if time.monotonic() - _allowed_hosts_cache[0] < 60:
        return set(_allowed_hosts_cache[1])
    async with _allowed_hosts_lock:
        if time.monotonic() - _allowed_hosts_cache[0] < 60:
            return set(_allowed_hosts_cache[1])
        hosts = set(_STATIC_ALLOWED_IMAGE_HOSTS)
        async with AsyncSessionLocal() as db:
            settings = (await db.execute(select(Settings))).scalars().first()
            if settings and settings.plex_url:
                host = urlparse(settings.plex_url).hostname
                if host:
                    hosts.add(host.lower())
            secondary_tokens: dict[str, str] = {}
            servers = (await db.execute(select(PlexServer).filter(PlexServer.is_primary.is_(False)))).scalars().all()
            for server in servers:
                parsed_server = urlparse(server.url) if server.url else None
                if parsed_server and parsed_server.hostname:
                    hosts.add(parsed_server.hostname.lower())
                    # Cle hote:port : deux serveurs sur la meme machine (ports differents)
                    # ne doivent jamais recevoir le jeton l'un de l'autre.
                    if server.token:
                        secondary_tokens.setdefault(parsed_server.netloc.lower(), server.token)
            _secondary_plex_tokens.clear()
            _secondary_plex_tokens.update(secondary_tokens)
            instances = (await db.execute(select(ArrInstance))).scalars().all()
            for inst in instances:
                if inst.url:
                    host = urlparse(inst.url).hostname
                    if host:
                        hosts.add(host.lower())
        _allowed_hosts_cache = (time.monotonic(), hosts)
        return set(hosts)


async def _tls_verify(host: str | None) -> bool:
    """Le certificat est verifie pour tous les hotes publics (TMDB, Plex.tv...). Seuls
    les serveurs du reseau local configures par l'admin (Plex, *arr), souvent en
    certificat auto-signe, en sont dispenses -- et Plex seulement si l'admin a desactive
    la verification dans ses reglages."""
    host = (host or "").lower()
    if not host or host in _STATIC_ALLOWED_IMAGE_HOSTS:
        return True
    async with AsyncSessionLocal() as db:
        settings = (await db.execute(select(Settings))).scalars().first()
    plex_host = (urlparse(settings.plex_url).hostname or "").lower() if settings and settings.plex_url else ""
    if host == plex_host:
        return bool(settings.plex_verify_ssl)
    return False


_IMAGE_CACHE_DIR = _os.path.join("data", "image_cache")

_IMAGE_CACHE_TTL = 86400  # aligné sur le Cache-Control déjà envoyé au navigateur
_image_locks: WeakValueDictionary[str, asyncio.Lock] = WeakValueDictionary()
_source_locks: WeakValueDictionary[str, asyncio.Lock] = WeakValueDictionary()
_image_refresh_tasks: dict[str, asyncio.Task] = {}
_image_refresh_slots = asyncio.Semaphore(3)


async def close_image_refreshes() -> None:
    tasks = list(_image_refresh_tasks.values())
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    _image_refresh_tasks.clear()


def _image_cache_paths(url: str) -> tuple[str, str]:
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()
    return (
        _os.path.join(_IMAGE_CACHE_DIR, f"{digest}.bin"),
        _os.path.join(_IMAGE_CACHE_DIR, f"{digest}.meta"),
    )


def _read_image_meta(url: str) -> tuple[str, float] | None:
    """Lit le seul fichier .meta (quelques octets), sans toucher a l'image elle-meme.

    Permet de trancher fraicheur et ETag avant de payer la lecture du binaire : sur une
    grille de posters, la quasi-totalite des requetes se termine en 304.
    """
    _, meta_path = _image_cache_paths(url)
    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            content_type, cached_at = f.read().split("\n", 1)
        return content_type, float(cached_at)
    except Exception:
        return None


def _read_image_cache(url: str) -> tuple[bytes, str, float] | None:
    content_path, meta_path = _image_cache_paths(url)
    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            content_type, cached_at = f.read().split("\n", 1)
        with open(content_path, "rb") as f:
            content = f.read()
        return content, content_type, float(cached_at)
    except Exception:
        return None


def _write_image_cache(url: str, content: bytes, content_type: str, cached_at: float) -> None:
    """`cached_at` est fourni par l'appelant plutot que pris ici : il entre dans l'ETag,
    qui doit designer exactement la version ecrite sur disque."""
    try:
        _os.makedirs(_IMAGE_CACHE_DIR, exist_ok=True)
        content_path, meta_path = _image_cache_paths(url)
        # Le worker et l'API partagent ce répertoire. Publier chaque fichier par
        # remplacement atomique pour ne jamais lire un binaire partiellement écrit.
        for target, data in ((content_path, content), (meta_path, f"{content_type}\n{cached_at}".encode())):
            fd, temporary = tempfile.mkstemp(dir=_IMAGE_CACHE_DIR)
            try:
                with _os.fdopen(fd, "wb") as f:
                    f.write(data)
                _os.replace(temporary, target)
            finally:
                if _os.path.exists(temporary):
                    _os.unlink(temporary)
    except Exception as e:
        logger.warning(f"Cache image : écriture impossible pour {url}: {e}")


def _variant_key(url: str, width: int | None, height: int | None, quality: int, image_format: str) -> str:
    if not width and not height and image_format == "original":
        return url
    return f"{url}|w={width or 0}|h={height or 0}|q={quality}|fmt={image_format}"


def _transform_image(
    content: bytes, width: int | None, height: int | None, quality: int, image_format: str
) -> tuple[bytes, str]:
    try:
        with Image.open(BytesIO(content)) as image:
            source_format = image.format or "PNG"
            image.load()
            image.thumbnail((width or image.width, height or image.height), Image.Resampling.LANCZOS)
            output_format = source_format if image_format == "original" else image_format.upper()
            if output_format in {"WEBP", "AVIF"} and image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGB")
            output = BytesIO()
            image.save(output, format=output_format, quality=quality, optimize=True)
            mime_format = "jpeg" if output_format.upper() == "JPEG" else output_format.lower()
            return output.getvalue(), f"image/{mime_format}"
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValueError(f"Transformation d'image impossible: {exc}") from exc


_CACHE_HEADERS = {"Cache-Control": "private, max-age=86400, stale-while-revalidate=604800"}

# Images absentes a la source (media supprime de Plex, bande-annonce sans vignette) : retenues
# une heure, pour ne pas interroger Plex a chaque affichage d'un historique qui les cite.
_MISSING_TTL = 3600
_missing: dict[str, float] = {}


def _is_missing(url: str) -> bool:
    expiry = _missing.get(url)
    if expiry is None:
        return False
    if expiry < time.monotonic():
        _missing.pop(url, None)
        return False
    return True


def _variant_etag(variant_key: str, cached_at: float) -> str:
    """ETag derive de l'identite de la variante et de sa date de mise en cache.

    `variant_key` designe deja un contenu unique (URL source + dimensions + qualite +
    format) et `cached_at` change a chaque re-telechargement : hacher ces quelques octets
    suffit, la ou hacher l'image entiere coutait un SHA-256 sur plusieurs centaines de Ko
    a chaque requete, y compris celles qui repartent en 304.
    """
    digest = hashlib.sha256(f"{variant_key}|{cached_at}".encode("utf-8")).hexdigest()
    return f'"{digest}"'


def _image_response(content: bytes, content_type: str, etag: str) -> Response:
    return Response(content=content, media_type=content_type, headers={**_CACHE_HEADERS, "ETag": etag})


@router.get("/image-proxy", dependencies=[Depends(require_auth)])
async def image_proxy(
    request: Request,
    url: str | None = None,
    plex_path: str | None = None,
    width: int | None = Query(None, ge=32, le=1600),
    height: int | None = Query(None, ge=32, le=1600),
    quality: int = Query(82, ge=40, le=95),
    image_format: str = Query("original", alias="format", pattern="^(original|webp|avif)$"),
    plex_server: int | None = Query(None, alias="server"),
):
    """Proxy, redimensionne et met en cache les affiches de l'interface.

    `server` designe un serveur Plex supplementaire pour un `plex_path` ; sans lui, le
    chemin est lu sur le serveur principal.
    """
    if bool(url) == bool(plex_path):
        raise HTTPException(400, "Une source d'image unique est requise")

    upstream_headers: dict[str, str] = {}
    plex_base: str | None = None
    if plex_path:
        parsed_path = urlparse(plex_path)
        if (
            not plex_path.startswith("/")
            or plex_path.startswith("//")
            or not parsed_path.path.startswith("/library/metadata/")
            or parsed_path.scheme
            or parsed_path.netloc
            or ".." in parsed_path.path.split("/")
            or "%2e" in parsed_path.path.lower()
        ):
            raise HTTPException(400, "Chemin Plex invalide")
        async with AsyncSessionLocal() as db:
            settings = (await db.execute(select(Settings))).scalars().first()
            secondary = None
            if plex_server is not None:
                secondary = (
                    (
                        await db.execute(
                            select(PlexServer).filter(PlexServer.id == plex_server, PlexServer.is_primary.is_(False))
                        )
                    )
                    .scalars()
                    .first()
                )
        if secondary is not None:
            if not secondary.url or not secondary.token:
                raise HTTPException(404, "Serveur Plex non configuré")
        elif not settings or not settings.plex_url or not settings.plex_token:
            raise HTTPException(404, "Plex non configuré")
        safe_query = urlencode(
            [
                (key, value)
                for key, value in parse_qsl(parsed_path.query, keep_blank_values=True)
                if key.lower() != "x-plex-token"
            ]
        )
        safe_path = urlunparse(("", "", parsed_path.path, "", safe_query, ""))
        base_url, base_token = (
            (secondary.url, secondary.token) if secondary is not None else (settings.plex_url, settings.plex_token)
        )
        plex_base = base_url.rstrip("/")
        url = f"{plex_base}{safe_path}"
        upstream_headers = {"X-Plex-Token": base_token}

    parsed = urlparse(url or "")
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(400, "URL image invalide")
    allowed_hosts = await _allowed_image_hosts()
    if not parsed.hostname or parsed.hostname.lower() not in allowed_hosts:
        raise HTTPException(400, "Hôte d'image non autorisé")
    query = parse_qsl(parsed.query, keep_blank_values=True)
    embedded_token = next((value for key, value in query if key.lower() == "x-plex-token"), None)
    safe_query = urlencode([(key, value) for key, value in query if key.lower() != "x-plex-token"])
    safe_url = urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, safe_query, ""))
    secondary_token = _secondary_plex_tokens.get(parsed.netloc.lower())
    if embedded_token and not upstream_headers:
        async with AsyncSessionLocal() as db:
            settings = (await db.execute(select(Settings))).scalars().first()
        configured_host = urlparse(settings.plex_url).hostname if settings and settings.plex_url else None
        if secondary_token:
            upstream_headers = {"X-Plex-Token": secondary_token}
        elif settings and settings.plex_token and parsed.hostname == configured_host:
            upstream_headers = {"X-Plex-Token": settings.plex_token}
        else:
            raise HTTPException(400, "URL Plex invalide")
    elif secondary_token and not upstream_headers:
        # Affiche d'un serveur Plex supplementaire : jeton de ce serveur, envoye a lui seul.
        upstream_headers = {"X-Plex-Token": secondary_token}
    variant_key = _variant_key(safe_url, width, height, quality, image_format)

    async def _serve_if_cached(*, allow_stale: bool = False) -> Response | None:
        """Sert la variante depuis le cache disque, en 304 si le navigateur l'a deja."""
        meta = await asyncio.to_thread(_read_image_meta, variant_key)
        if not meta or (not allow_stale and time.time() - meta[1] >= _IMAGE_CACHE_TTL):
            return None
        content_type, cached_at = meta
        etag = _variant_etag(variant_key, cached_at)
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers={**_CACHE_HEADERS, "ETag": etag})
        cached = await asyncio.to_thread(_read_image_cache, variant_key)
        if not cached:
            return None
        return _image_response(cached[0], cached[1], etag)

    async def _render() -> Response:
        # Une seule récupération/transformation à la fois par variante, même lors du rendu
        # simultané de plusieurs cartes qui utilisent la même affiche.
        lock = _image_locks.setdefault(variant_key, asyncio.Lock())
        async with lock:
            response = await _serve_if_cached()
            if response is not None:
                return response

            source_lock = _source_locks.setdefault(safe_url, asyncio.Lock())
            async with source_lock:
                if _is_missing(safe_url):
                    raise HTTPException(404, "Image introuvable a la source")
                source = await asyncio.to_thread(_read_image_cache, safe_url)
                if not source or time.time() - source[2] >= _IMAGE_CACHE_TTL:
                    try:
                        async with httpx.AsyncClient(
                            timeout=15, follow_redirects=False, verify=await _tls_verify(parsed.hostname)
                        ) as client:
                            upstream = await client.get(safe_url, headers=upstream_headers)
                            if upstream.is_redirect:
                                # Plex redirige vers sa propre CDN (images.plex.tv, elle-meme
                                # relais de TMDB) pour une affiche qu'il n'a pas en cache local --
                                # cas legitime frequent, pas juste une poignee d'items en erreur.
                                # Un seul saut suivi, et seulement si l'hote cible est LUI AUSSI
                                # dans l'allowlist (meme verification que l'URL d'origine) : ça
                                # ferme le cas legitime sans jamais suivre aveuglement une
                                # redirection vers un hote non autorise (SSRF).
                                redirect_target = upstream.headers.get("location", "")
                                redirect_host = (urlparse(redirect_target).hostname or "").lower()
                                if redirect_target and redirect_host in allowed_hosts:
                                    async with httpx.AsyncClient(
                                        timeout=15, follow_redirects=False, verify=await _tls_verify(redirect_host)
                                    ) as redirect_client:
                                        upstream = await redirect_client.get(redirect_target)
                                else:
                                    logger.warning(
                                        "Image proxy: redirection vers un hote non autorise refusee (%s -> %s)",
                                        safe_url,
                                        redirect_target,
                                    )
                            if upstream.status_code == 404 and plex_base:
                                # Plex change l'horodatage du chemin (`/thumb/<ts>`) a chaque
                                # rafraichissement des metadonnees : l'ancien chemin memorise
                                # repond 404. On relit le chemin courant de l'element.
                                fresh = await _current_plex_image_path(client, plex_base, parsed.path, upstream_headers)
                                if fresh:
                                    upstream = await client.get(f"{plex_base}{fresh}", headers=upstream_headers)
                            if upstream.status_code == 404 and not source:
                                # Absente a la source, et jamais vue : ce n'est pas une panne (502)
                                # mais une image qui n'existe pas. Le client affiche son repli.
                                _missing[safe_url] = time.monotonic() + _MISSING_TTL
                                raise HTTPException(404, "Image introuvable a la source")
                            upstream.raise_for_status()
                        content_type = (
                            upstream.headers.get("content-type", "application/octet-stream")
                            .split(";")[0]
                            .strip()
                            .lower()
                        )
                        if not content_type.startswith("image/"):
                            raise HTTPException(415, "La ressource n'est pas une image")
                        fetched_at = time.time()
                        source = (upstream.content, content_type, fetched_at)
                        await asyncio.to_thread(
                            _write_image_cache, safe_url, upstream.content, content_type, fetched_at
                        )
                    except HTTPException:
                        raise
                    except Exception as exc:
                        if not source:
                            raise HTTPException(502, f"Image inaccessible: {safe_error_message(exc)}") from exc
                        logger.warning(
                            "Image inaccessible, repli sur le cache périmé pour %s: %s",
                            safe_url,
                            exc,
                        )

            content, content_type, variant_cached_at = source
            if width or height or image_format != "original":
                try:
                    content, content_type = await asyncio.to_thread(
                        _transform_image, content, width, height, quality, image_format
                    )
                except ValueError as exc:
                    raise HTTPException(415, str(exc)) from exc
                variant_cached_at = time.time()
                await asyncio.to_thread(_write_image_cache, variant_key, content, content_type, variant_cached_at)
            return _image_response(content, content_type, _variant_etag(variant_key, variant_cached_at))

    response = await _serve_if_cached()
    if response is not None:
        return response
    stale = await _serve_if_cached(allow_stale=True)
    if stale is not None:
        # Répondre immédiatement, même si Plex est lent ou indisponible.
        if variant_key not in _image_refresh_tasks and len(_image_refresh_tasks) < 64:

            async def refresh():
                try:
                    async with _image_refresh_slots:
                        await _render()
                except Exception:
                    logger.debug("Rafraîchissement d'image différé impossible", exc_info=True)
                finally:
                    _image_refresh_tasks.pop(variant_key, None)

            _image_refresh_tasks[variant_key] = asyncio.create_task(refresh())
        return stale
    if _is_missing(safe_url):
        raise HTTPException(404, "Image introuvable a la source")
    return await _render()


_PLEX_IMAGE_PATH = re.compile(r"^/library/metadata/(\d+)/(thumb|art|banner|clearLogo)(?:/\d+)?$")


async def _current_plex_image_path(
    client: httpx.AsyncClient, plex_base: str, path: str, headers: dict[str, str]
) -> str | None:
    """Chemin actuel d'une image Plex dont l'horodatage memorise a expire."""
    match = _PLEX_IMAGE_PATH.match(path)
    if not match:
        return None
    rating_key, kind = match.groups()
    try:
        response = await client.get(
            f"{plex_base}/library/metadata/{rating_key}", headers={**headers, "Accept": "application/json"}
        )
        response.raise_for_status()
        items = response.json().get("MediaContainer", {}).get("Metadata") or []
    except Exception as exc:
        logger.warning("Image proxy: metadonnees Plex illisibles pour %s: %s", rating_key, exc)
        return None
    fresh = items[0].get(kind) if items else None
    if not isinstance(fresh, str) or not _PLEX_IMAGE_PATH.match(fresh) or fresh == path:
        return None
    return fresh


async def _proxy_stored_poster(
    request: Request,
    poster_url: str,
    settings: Settings | None,
    width: int | None,
    height: int | None,
    quality: int,
    image_format: str,
) -> Response:
    """Sert une affiche memorisee en base : URL Plex signee, URL externe, ou URL du proxy
    lui-meme stockee par erreur."""
    url, plex_path = image_proxy_source(poster_url)
    if url:
        parsed = urlparse(url)
        configured_host = urlparse(settings.plex_url).hostname if settings and settings.plex_url else None
        if configured_host and parsed.hostname == configured_host:
            url, plex_path = None, urlunparse(("", "", parsed.path, parsed.params, parsed.query, ""))
    return await image_proxy(
        request=request,
        url=url,
        plex_path=plex_path,
        width=width,
        height=height,
        quality=quality,
        image_format=image_format,
        plex_server=None,
    )


@router.get("/image-proxy/library/{library_item_id}", dependencies=[Depends(require_auth)])
async def library_image_proxy(
    request: Request,
    library_item_id: int,
    width: int | None = Query(500, ge=32, le=1600),
    height: int | None = Query(None, ge=32, le=1600),
    quality: int = Query(82, ge=40, le=95),
    image_format: str = Query("webp", alias="format", pattern="^(original|webp|avif)$"),
):
    """Sert une affiche Plex sans révéler son URL signée au navigateur."""
    async with AsyncSessionLocal() as db:
        item = (await db.execute(select(LibraryItem).filter(LibraryItem.id == library_item_id))).scalars().first()
        settings = (await db.execute(select(Settings))).scalars().first()
    if not item or not item.poster_url:
        raise HTTPException(404, "Affiche introuvable")
    return await _proxy_stored_poster(request, item.poster_url, settings, width, height, quality, image_format)


@router.get("/image-proxy/request/{request_id}", dependencies=[Depends(require_auth)])
async def request_image_proxy(
    request: Request,
    request_id: int,
    width: int | None = Query(500, ge=32, le=1600),
    height: int | None = Query(None, ge=32, le=1600),
    quality: int = Query(82, ge=40, le=95),
    image_format: str = Query("webp", alias="format", pattern="^(original|webp|avif)$"),
):
    """Sert l'affiche d'une demande sans révéler son éventuelle URL Plex signée."""
    async with AsyncSessionLocal() as db:
        media_request = (await db.execute(select(MediaRequest).filter(MediaRequest.id == request_id))).scalars().first()
        settings = (await db.execute(select(Settings))).scalars().first()
    if not media_request or not media_request.poster_url:
        raise HTTPException(404, "Affiche introuvable")
    return await _proxy_stored_poster(request, media_request.poster_url, settings, width, height, quality, image_format)
