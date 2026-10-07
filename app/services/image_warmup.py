"""Prechargement des images d'un media, pour qu'aucune premiere consultation n'attende internet.

Le proxy d'images (`/api/image-proxy`) garde sur disque chaque variante demandee (source +
largeur + qualite + format). Sans prechargement, la premiere fiche ouverte paie le
telechargement de l'affiche, du fond d'ecran et du detail TMDB. Ce module demande au proxy
exactement les variantes que l'interface reclamera, et chauffe au passage le cache du detail
TMDB que la fiche lit.

Deux usages : une passe sur toute la bibliotheque (action de maintenance) et un declencheur
a l'ajout d'un media (voir `register_listeners`).
"""

import asyncio
import logging
import os
from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import event, inspect, select
from starlette.requests import Request

from ..database import AsyncSessionLocal
from ..models import LibraryItem, MediaRequest, Settings
from ..utils import (
    BACKDROP_PROXY_QUALITY,
    BACKDROP_PROXY_WIDTH,
    CAST_PROXY_QUALITY,
    CAST_PROXY_WIDTHS,
    RAIL_PROXY_QUALITY,
    RAIL_PROXY_WIDTHS,
    backdrop_source_url,
    is_tmdb_poster,
    profile_source_url,
    rail_poster_source,
)

logger = logging.getLogger(__name__)

#: (largeur, qualite) des affiches reclamees par l'interface : vignette de carte, puis les
#: barreaux du `srcset` de la fiche que choisissent un telephone et un ecran de bureau.
POSTER_VARIANTS = ((500, 82), (185, 92), (342, 92), (500, 92), (780, 92))
#: Types de media dont TMDB sert un detail (donc un fond d'ecran).
TMDB_TYPES = ("movie", "show")
#: Delai accorde a une image avant de passer a la suivante.
IMAGE_TIMEOUT = 45
#: Images externes (portraits, affiches de rails) chargees en meme temps pour un media.
IMAGE_CONCURRENCY = 6
COVER_WIDTH = 500
COVER_QUALITY = 82


@dataclass(frozen=True)
class WarmTarget:
    kind: str  # "library" ou "request" : les deux routes d'affiche du proxy
    id: int
    title: str
    media_type: str
    tmdb_id: str | None
    poster_url: str | None

    @property
    def cover_url(self) -> str | None:
        """Vignette de la carte, deja chaude une fois la passe faite : sert a l'avancement."""
        if not self.poster_url:
            return None
        return f"/api/image-proxy/{self.kind}/{self.id}?width={COVER_WIDTH}&quality={COVER_QUALITY}&format=webp"


def _request() -> Request:
    # Les fonctions du proxy ne lisent que l'en-tete If-None-Match : une requete vide suffit.
    return Request({"type": "http", "method": "GET", "path": "/api/image-proxy", "headers": []})


async def _load_settings() -> Settings | None:
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(Settings))).scalars().first()


async def warm_media_images(target: WarmTarget, settings: Settings | None) -> int:
    """Charge les variantes d'un media dans le cache disque. Renvoie leur nombre.

    Une image absente a la source ou une panne reseau n'est jamais une erreur : le media
    garde sa copie perimee ou son repli visuel, et la passe continue.
    """
    from ..routers.image_proxy_api import _proxy_stored_poster

    warmed = 0
    if target.poster_url:
        for width, quality in POSTER_VARIANTS:
            try:
                async with asyncio.timeout(IMAGE_TIMEOUT):
                    await _proxy_stored_poster(_request(), target.poster_url, settings, width, None, quality, "webp")
                warmed += 1
            except Exception:
                # Source introuvable ou injoignable : les autres largeurs le seraient aussi.
                logger.debug("Affiche non prechargee pour %s", target.title, exc_info=True)
                break

    if target.tmdb_id and target.media_type in TMDB_TYPES:
        try:
            from . import tmdb

            async with AsyncSessionLocal() as db:
                detail = await tmdb.detail(db, target.media_type, int(target.tmdb_id))
        except Exception:
            logger.debug("Detail TMDB indisponible pour %s", target.title, exc_info=True)
            return warmed
        if await _warm_variant(
            backdrop_source_url(detail.get("backdrop_url")), BACKDROP_PROXY_WIDTH, BACKDROP_PROXY_QUALITY
        ):
            warmed += 1
        cast_sources = [profile_source_url(person.get("profile_url")) for person in detail.get("cast") or []]
        warmed += await _warm_sources(cast_sources, CAST_PROXY_WIDTHS, CAST_PROXY_QUALITY)
        warmed += await _warm_sources(_rail_sources(detail), RAIL_PROXY_WIDTHS, RAIL_PROXY_QUALITY)
    return warmed


def _rail_sources(detail: dict) -> list[str]:
    """Affiches des rails de la fiche (recommandations, similaires, saga), sans doublon."""
    items = [*(detail.get("recommendations") or []), *(detail.get("similar") or [])]
    items += (detail.get("saga") or {}).get("items") or []
    return [rail_poster_source(item["poster_url"]) for item in items if is_tmdb_poster(item.get("poster_url"))]


async def _warm_variant(source: str | None, width: int, quality: int) -> bool:
    """Charge une variante webp d'une image externe ; faux si elle n'est pas disponible."""
    if not source:
        return False
    from ..routers.image_proxy_api import image_proxy

    try:
        async with asyncio.timeout(IMAGE_TIMEOUT):
            await image_proxy(
                _request(),
                url=source,
                plex_path=None,
                width=width,
                height=None,
                quality=quality,
                image_format="webp",
                plex_server=None,
            )
        return True
    except Exception:
        logger.debug("Image non prechargee : %s", source, exc_info=True)
        return False


async def _warm_sources(sources: list[str | None], widths: tuple[int, ...], quality: int) -> int:
    """Charge chaque image de `sources` a chacune des `widths`, plusieurs images a la fois.

    Les doublons sont ignores, et une image deja vue (acteur ou affiche partages avec un autre
    media) repart du cache : seul le premier passage telecharge. Une image indisponible n'essaie
    pas ses autres largeurs.
    """
    slots = asyncio.Semaphore(IMAGE_CONCURRENCY)

    async def one(source: str) -> int:
        done = 0
        async with slots:
            for width in widths:
                if not await _warm_variant(source, width, quality):
                    break
                done += 1
        return done

    unique = list(dict.fromkeys(source for source in sources if source))
    return sum(await asyncio.gather(*(one(source) for source in unique)))


async def load_warm_targets(db) -> list[WarmTarget]:
    """Medias de la bibliotheque, puis demandes encore absentes de celle-ci, les plus recents
    d'abord : ce sont eux qu'on ouvrira en premier."""
    library = (
        await db.execute(
            select(
                LibraryItem.id,
                LibraryItem.title,
                LibraryItem.media_type,
                LibraryItem.tmdb_id,
                LibraryItem.poster_url,
            )
            .filter(LibraryItem.media_type != "track")
            .order_by(LibraryItem.id.desc())
        )
    ).all()
    requests = (
        await db.execute(
            select(
                MediaRequest.id,
                MediaRequest.title,
                MediaRequest.media_type,
                MediaRequest.tmdb_id,
                MediaRequest.poster_url,
            )
            .filter(MediaRequest.library_item_id.is_(None))
            .order_by(MediaRequest.id.desc())
        )
    ).all()
    return [WarmTarget("library", *row) for row in library] + [WarmTarget("request", *row) for row in requests]


async def warm_targets(
    targets: list[WarmTarget],
    on_progress: Callable[[int, int, WarmTarget], None] | None = None,
    *,
    concurrency: int = 3,
) -> dict:
    """Prechauffe `targets` avec `concurrency` medias a la fois ; `on_progress` recoit
    (termines, total, dernier media)."""
    settings = await _load_settings()
    slots = asyncio.Semaphore(concurrency)
    stats = {"total": len(targets), "warmed": 0, "empty": 0}
    finished = 0

    async def one(target: WarmTarget) -> None:
        nonlocal finished
        async with slots:
            count = await warm_media_images(target, settings)
        stats["warmed" if count else "empty"] += 1
        finished += 1
        if on_progress:
            on_progress(finished, len(targets), target)

    await asyncio.gather(*(one(target) for target in targets))
    return stats


def clear_image_cache() -> dict:
    """Supprime toutes les images du cache disque. Renvoie fichiers et octets liberes.

    Attention : le cache est parfois la seule copie d'une affiche dont la source a expire
    (`metadata-static.plex.tv`) ; la vider les fait tomber sur le repli visuel.
    """
    from ..routers import image_proxy_api

    removed = freed = 0
    directory = image_proxy_api._IMAGE_CACHE_DIR
    if os.path.isdir(directory):
        for entry in os.scandir(directory):
            if not entry.is_file():
                continue
            try:
                size = entry.stat().st_size
                os.unlink(entry.path)
            except OSError:
                continue
            removed += 1
            freed += size
    image_proxy_api._missing.clear()
    return {"files": removed, "bytes": freed}


# --- Declencheur a l'ajout -------------------------------------------------------------

#: Delai laisse a la transaction d'ajout pour se valider avant qu'on relise la ligne.
SETTLE_DELAY = 5
_pending: dict[tuple[str, int], None] = {}
_drain_task: asyncio.Task | None = None


def schedule_media_warmup(kind: str, media_id: int) -> None:
    """Met un media en file de prechargement ; sans boucle active (script, test synchrone),
    ne fait rien."""
    global _drain_task
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return
    _pending[(kind, media_id)] = None
    if _drain_task is None or _drain_task.done():
        _drain_task = asyncio.create_task(_drain())


async def _load_target(kind: str, media_id: int) -> WarmTarget | None:
    model = LibraryItem if kind == "library" else MediaRequest
    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(model).filter(model.id == media_id))).scalars().first()
    if row is None:
        return None
    return WarmTarget(kind, row.id, row.title, row.media_type, row.tmdb_id, row.poster_url)


async def _drain() -> None:
    await asyncio.sleep(SETTLE_DELAY)
    settings = await _load_settings()
    while _pending:
        kind, media_id = next(iter(_pending))
        _pending.pop((kind, media_id), None)
        try:
            target = await _load_target(kind, media_id)
            if target is not None:
                await warm_media_images(target, settings)
        except Exception:
            logger.debug("Prechargement impossible pour %s %s", kind, media_id, exc_info=True)


async def stop_image_warmup() -> None:
    global _drain_task
    _pending.clear()
    if _drain_task is not None:
        _drain_task.cancel()
        await asyncio.gather(_drain_task, return_exceptions=True)
        _drain_task = None


_listeners_registered = False


def register_listeners() -> None:
    """Prechauffe les images de tout media ajoute, ou dont l'affiche change. Idempotent."""
    global _listeners_registered
    if _listeners_registered:
        return
    _listeners_registered = True

    for model, kind in ((LibraryItem, "library"), (MediaRequest, "request")):

        def on_insert(_mapper, _connection, target, kind=kind):
            if kind == "library" and target.media_type == "track":
                return
            schedule_media_warmup(kind, target.id)

        def on_update(_mapper, _connection, target, kind=kind):
            if kind == "library" and target.media_type == "track":
                return
            if inspect(target).attrs.poster_url.history.has_changes():
                schedule_media_warmup(kind, target.id)

        event.listen(model, "after_insert", on_insert)
        event.listen(model, "after_update", on_update)
