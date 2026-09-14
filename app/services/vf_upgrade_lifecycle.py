"""Cycle de vie d'une amelioration VF acceptee : accepted -> downloading -> importing
-> awaiting_verification -> verified (ou failed).

Extrait de `routers/vf_upgrades_api.py`, ou cette logique n'avancait que si quelqu'un
ouvrait la page : les transitions etaient declenchees depuis les GET du dashboard. Sans
visite, un grab restait « accepted » indefiniment, le delai de validation ne se
declenchait jamais, `retry_count` n'avancait pas -- et aucune notification n'aurait pu
partir. `reconcile_all` est maintenant appelee par un job de fond (voir
`jobs.job_vf_upgrade_lifecycle`), les routers se contentant de lire.

Deux economies importantes par rapport a la version precedente :
- la file de telechargement *arr est lue une seule fois par instance et par passage
  (`QueueCache`) au lieu d'un appel HTTP complet par suggestion ;
- seules les suggestions dans un etat actif sont examinees.
"""

import json
import logging
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..models import (
    ArrInstance,
    LibraryItem,
    MediaRequest,
    Settings,
    VfEpisodeStatus,
    VfUpgradeSuggestion,
)
from ..utils import now_utc_naive
from . import radarr, sonarr
from .vf_upgrade_notifications import notify_vf_upgrade

logger = logging.getLogger(__name__)

ACTIVE_UPGRADE_STATES = ("accepted", "downloading", "importing", "awaiting_verification")

# Etats de file *arr qui signalent un telechargement qui n'aboutira pas seul (client de
# telechargement en erreur, import bloque) -- candidats au blocklist + relance.
_FAILED_QUEUE_STATUSES = {"failed", "warning"}


class QueueCache:
    """Files de telechargement *arr lues une fois par instance, pour la duree d'un passage.

    Le dashboard appelait `get_queue()` une fois par suggestion active : 20 suggestions
    = 20 lectures completes de la file du meme Sonarr a chaque affichage de page.
    """

    def __init__(self) -> None:
        self._queues: dict[tuple[str, int], list[dict]] = {}

    async def get(self, arr_type: str, inst: ArrInstance) -> list[dict]:
        key = (arr_type, inst.id)
        if key not in self._queues:
            service = radarr if arr_type == "radarr" else sonarr
            try:
                self._queues[key] = await service.get_queue(inst.url, inst.api_key)
            except Exception as exc:
                logger.warning("File %s indisponible pour '%s' : %s", arr_type, inst.name, exc)
                self._queues[key] = []
        return self._queues[key]

    def invalidate(self, arr_type: str, inst: ArrInstance) -> None:
        self._queues.pop((arr_type, inst.id), None)


def queue_matches(item: dict, suggestion: VfUpgradeSuggestion, arr_id: int) -> bool:
    if item.get("arr_media_id") != arr_id:
        return False
    if suggestion.scope == "episode":
        return (
            item.get("season_number") == suggestion.season_number
            and item.get("episode_number") == suggestion.episode_number
        )
    return True


async def resolve_instance(db: AsyncSession, instance_id: int | None, arr_type: str) -> ArrInstance | None:
    """Instance *arr d'un media -- variante sans HTTPException de `_resolve_arr_instance`
    (ce module tourne aussi hors contexte HTTP, dans le job de fond)."""
    if instance_id is not None:
        inst = (
            (
                await db.execute(
                    select(ArrInstance).filter(ArrInstance.id == instance_id, ArrInstance.arr_type == arr_type)
                )
            )
            .scalars()
            .first()
        )
        if inst:
            return inst
    return (
        (await db.execute(select(ArrInstance).filter(ArrInstance.is_default, ArrInstance.arr_type == arr_type)))
        .scalars()
        .first()
    )


async def scope_has_vf(db: AsyncSession, suggestion: VfUpgradeSuggestion, media, settings: Settings | None) -> bool:
    require_default = bool(
        settings and (settings.vf_upgrade_require_default is True or settings.vf_upgrade_accept_secondary is False)
    )
    if suggestion.scope == "movie":
        # Une VF deja presente avant le grab ne prouve pas que la nouvelle release a
        # ete importee: l'analyse doit etre posterieure a l'acceptation *arr.
        return bool(
            media.has_vf
            and (not require_default or media.fr_is_default is True)
            and suggestion.accepted_at
            and media.vf_checked_at
            and media.vf_checked_at >= suggestion.accepted_at
        )
    query = select(VfEpisodeStatus.has_vf, VfEpisodeStatus.fr_is_default, VfEpisodeStatus.checked_at).filter(
        VfEpisodeStatus.source_type == suggestion.source_type,
        VfEpisodeStatus.source_id == suggestion.source_id,
        VfEpisodeStatus.season_number == suggestion.season_number,
        VfEpisodeStatus.is_known_episode.is_(True),
    )
    if suggestion.scope == "episode":
        query = query.filter(VfEpisodeStatus.episode_number == suggestion.episode_number)
    values = list((await db.execute(query)).all())
    return (
        bool(values)
        and bool(suggestion.accepted_at)
        and all(
            has_vf
            and (not require_default or fr_is_default is True)
            and checked_at
            and checked_at >= suggestion.accepted_at
            for has_vf, fr_is_default, checked_at in values
        )
    )


def _attempted_guids(suggestion: VfUpgradeSuggestion) -> list[str]:
    try:
        return list(json.loads(suggestion.attempted_guids_json or "[]"))
    except (TypeError, ValueError):
        return []


def remember_attempt(suggestion: VfUpgradeSuggestion, guid: str | None) -> None:
    if not guid:
        return
    attempted = _attempted_guids(suggestion)
    if guid not in attempted:
        attempted.append(guid)
    suggestion.attempted_guids_json = json.dumps(attempted)


def next_candidate(suggestion: VfUpgradeSuggestion, settings: Settings | None) -> dict | None:
    """Meilleure release encore non tentee de la suggestion.

    Les releases sont deja triees par pertinence par le scanner (voir `_search_task`) :
    la suivante est simplement la premiere qui n'a pas encore ete essayee, qui n'est pas
    refusee par le profil *arr quand ce blocage est actif, et qui ne degraderait pas la
    qualite en place (voir vf_technical_guard -- une recherche manuelle conserve ces
    releases pour affichage, une relance automatique ne doit jamais les choisir seule).
    """
    try:
        releases = json.loads(suggestion.releases_json or "[]")
    except (TypeError, ValueError):
        return None
    attempted = set(_attempted_guids(suggestion))
    if suggestion.grabbed_release_guid:
        attempted.add(suggestion.grabbed_release_guid)
    block_rejected = not settings or settings.vf_upgrade_block_arr_rejected
    for release in releases:
        if release.get("guid") in attempted:
            continue
        if block_rejected and (release.get("rejected") or release.get("rejections")):
            continue
        if release.get("vf_technical_blocked"):
            continue
        return release
    return None


async def blocklist_stalled_download(
    db: AsyncSession,
    suggestion: VfUpgradeSuggestion,
    media,
    inst: ArrInstance,
    arr_type: str,
    queue: list[dict],
) -> bool:
    """Retire de la file *arr, avec blocklist, un telechargement en erreur.

    `vf_upgrade_blacklist_failed` ne filtrait le guid fautif que dans le JSON local de
    la suggestion : *arr, lui, n'en savait rien et pouvait re-proposer ou reimporter la
    meme release. Le blocklist natif l'en empeche durablement.
    """
    match = next(
        (
            item
            for item in queue
            if queue_matches(item, suggestion, media.arr_id)
            and (
                (item.get("status") or "").lower() in _FAILED_QUEUE_STATUSES
                or (item.get("tracked_status") or "").lower() in _FAILED_QUEUE_STATUSES
            )
        ),
        None,
    )
    if not match or not match.get("queue_id"):
        return False
    service = radarr if arr_type == "radarr" else sonarr
    try:
        # search=False : la relance est pilotee par `auto_retry_next_candidate`, qui
        # choisit explicitement la release suivante de notre propre liste triee plutot
        # que de laisser *arr reprendre une recherche generique.
        ok, msg = await service.delete_queue_item(
            inst.url, inst.api_key, match["queue_id"], blocklist=True, search=False
        )
    except Exception as exc:
        logger.warning("VF upgrade : blocklist impossible pour '%s' : %s", media.title, exc)
        return False
    if ok:
        logger.info("VF upgrade : release en echec blocklistee dans %s pour '%s'", inst.name, media.title)
    else:
        logger.warning("VF upgrade : blocklist refuse par %s : %s", inst.name, msg)
    return bool(ok)


async def auto_retry_next_candidate(
    db: AsyncSession,
    suggestion: VfUpgradeSuggestion,
    media,
    settings: Settings | None,
    inst: ArrInstance,
    arr_type: str,
) -> bool:
    """Tente la release suivante apres un echec, dans la limite de `vf_upgrade_max_retries`.

    La suggestion contient deja une liste triee de candidats : laisser l'utilisateur
    re-cliquer manuellement a chaque echec n'apportait aucune decision -- il reprenait
    simplement le suivant dans la meme liste.
    """
    max_retries = max(0, (settings.vf_upgrade_max_retries if settings else 3) or 0)
    if (suggestion.retry_count or 0) > max_retries:
        return False
    candidate = next_candidate(suggestion, settings)
    if not candidate or not candidate.get("guid"):
        return False

    service = radarr if arr_type == "radarr" else sonarr
    try:
        ok, msg, _stale = await service.grab_release(
            inst.url, inst.api_key, candidate["guid"], candidate.get("indexer_id")
        )
    except Exception as exc:
        logger.warning("VF upgrade : relance automatique impossible pour '%s' : %s", media.title, exc)
        return False
    remember_attempt(suggestion, candidate.get("guid"))
    if not ok:
        logger.info("VF upgrade : candidat suivant refuse par %s pour '%s' : %s", inst.name, media.title, msg)
        return False

    suggestion.status = "accepted"
    suggestion.grabbed_release_guid = candidate["guid"]
    suggestion.accepted_at = now_utc_naive()
    suggestion.failed_at = None
    suggestion.completed_at = None
    suggestion.arr_message = f"Relance automatique sur « {candidate.get('title') or candidate['guid']} »"
    suggestion.updated_at = now_utc_naive()
    logger.info("VF upgrade : relance automatique pour '%s' (essai %s)", media.title, suggestion.retry_count)
    return True


async def refresh_lifecycle(
    db: AsyncSession,
    suggestion: VfUpgradeSuggestion,
    media,
    *,
    settings: Settings | None,
    queues: QueueCache,
    notify: bool = True,
) -> str | None:
    """Fait avancer une suggestion active. Retourne le nouveau statut s'il a change."""
    if suggestion.status not in ACTIVE_UPGRADE_STATES:
        return None
    previous = suggestion.status

    if await scope_has_vf(db, suggestion, media, settings):
        suggestion.status = "verified"
        suggestion.completed_at = now_utc_naive()
        suggestion.arr_message = "VF confirmee apres import par l'analyse des pistes audio"
        await _announce(db, settings, suggestion, media, previous, notify)
        return suggestion.status

    arr_type = "radarr" if suggestion.scope == "movie" else "sonarr"
    inst = await resolve_instance(db, media.arr_instance_id, arr_type)
    if not inst:
        logger.warning("VF upgrade : instance %s introuvable pour '%s'", arr_type, media.title)
        return None
    queue = await queues.get(arr_type, inst)
    match = next((item for item in queue if queue_matches(item, suggestion, media.arr_id)), None)

    if match:
        suggestion.status = "importing" if "import" in str(match.get("tracked_state", "")).lower() else "downloading"
        suggestion.queue_confirmed_at = suggestion.queue_confirmed_at or now_utc_naive()
        suggestion.arr_message = f"{inst.name} a confirme le telechargement ({match.get('progress', 0)} %)"
        # Telechargement bloque cote client : plutot que d'attendre l'expiration du
        # delai de validation, on blockliste et on enchaine sur le candidat suivant.
        if (settings is None or settings.vf_upgrade_blacklist_failed) and await blocklist_stalled_download(
            db, suggestion, media, inst, arr_type, queue
        ):
            queues.invalidate(arr_type, inst)
            suggestion.retry_count = (suggestion.retry_count or 0) + 1
            remember_attempt(suggestion, suggestion.grabbed_release_guid)
            if not await auto_retry_next_candidate(db, suggestion, media, settings, inst, arr_type):
                suggestion.status = "failed"
                suggestion.failed_at = now_utc_naive()
                suggestion.arr_message = "Telechargement en echec, blocklist dans *arr, aucun autre candidat VF"
    elif suggestion.status in ("downloading", "importing"):
        suggestion.status = "awaiting_verification"
        suggestion.arr_message = "Telechargement termine; verification VF Plex en attente"
        if settings and settings.vf_upgrade_trigger_plex_scan:
            from .vff_scanner import trigger_plex_library_refresh

            await trigger_plex_library_refresh(
                settings,
                media.media_type,
                arr_type=arr_type,
                arr_url=inst.url,
                arr_api_key=inst.api_key,
                cache_key=f"{arr_type}:{inst.id}",
            )
    elif (
        settings
        and settings.vf_upgrade_verify_after_import
        and suggestion.accepted_at
        and now_utc_naive() - suggestion.accepted_at
        > timedelta(minutes=max(15, settings.vf_upgrade_verification_timeout_minutes or 120))
    ):
        suggestion.retry_count = (suggestion.retry_count or 0) + 1
        remember_attempt(suggestion, suggestion.grabbed_release_guid)
        # La release promettait une VF que le fichier importe n'a pas : elle ne sera
        # jamais reproposee (voir `_attempted_guids`), on enchaine sur la suivante.
        if not await auto_retry_next_candidate(db, suggestion, media, settings, inst, arr_type):
            suggestion.status = "failed"
            suggestion.failed_at = now_utc_naive()
            suggestion.arr_message = "VF non confirmee avant la fin du delai de validation"

    if suggestion.status != previous:
        suggestion.updated_at = now_utc_naive()
        await _announce(db, settings, suggestion, media, previous, notify)
        return suggestion.status
    return None


async def _announce(
    db: AsyncSession,
    settings: Settings | None,
    suggestion: VfUpgradeSuggestion,
    media,
    previous: str,
    notify: bool,
) -> None:
    if not notify or suggestion.status == previous:
        return
    # « importing » est une etape du meme telechargement : ne pas notifier deux fois.
    event = {"downloading": "downloading", "verified": "verified", "failed": "failed"}.get(suggestion.status)
    if not event:
        return
    try:
        await notify_vf_upgrade(
            db,
            settings,
            event,
            media_title=media.title,
            media_type=getattr(media, "media_type", None),
            scope=suggestion.scope,
            season_number=suggestion.season_number,
            episode_number=suggestion.episode_number,
            detail=suggestion.arr_message,
        )
    except Exception as exc:
        logger.warning("Notification VF non expediee pour '%s' : %s", media.title, exc)


async def confirm_from_arr_import(
    db: AsyncSession,
    arr_type: str,
    arr_id: int | None,
    *,
    instance_id: int | None = None,
    season_number: int | None = None,
    episode_number: int | None = None,
) -> int:
    """Confirme une amelioration VF des l'import *arr, sans attendre le scan Plex.

    Appelee par les webhooks Sonarr/Radarr quand `mediaInfo.audioLanguages` (mesure par
    ffprobe sur le fichier reellement importe) contient du francais. La verification
    passait auparavant uniquement par `scope_has_vf`, qui exige un scan Plex posterieur
    a l'acceptation : la suggestion restait donc « awaiting_verification » pendant tout
    l'intervalle du scanner VF, alors que la preuve etait deja disponible.

    Comme partout ailleurs (voir `languages_list_has_french`), ce signal ne sert qu'a
    accelerer une confirmation POSITIVE : il n'est jamais utilise pour conclure a une
    absence de VF, et n'est appele qu'avec une detection positive.

    Une suggestion de portee « season » n'est jamais close par l'import d'un episode :
    l'arrivee d'un seul episode VF ne prouve rien sur les autres, Plex reste l'autorite
    pour ce cas.
    """
    if not arr_id:
        return 0
    scope = "movie" if arr_type == "radarr" else "episode"
    media_keys: list[tuple[str, int, object]] = []
    for source_type, model in (("library_item", LibraryItem), ("request", MediaRequest)):
        query = select(model).filter(model.arr_id == arr_id)
        if instance_id is not None:
            query = query.filter(model.arr_instance_id == instance_id)
        for row in (await db.execute(query)).scalars().all():
            media_keys.append((source_type, row.id, row))
    if not media_keys:
        return 0

    settings = (await db.execute(select(Settings))).scalars().first()
    confirmed = 0
    for source_type, source_id, media in media_keys:
        query = select(VfUpgradeSuggestion).filter(
            VfUpgradeSuggestion.source_type == source_type,
            VfUpgradeSuggestion.source_id == source_id,
            VfUpgradeSuggestion.scope == scope,
            VfUpgradeSuggestion.status.in_(ACTIVE_UPGRADE_STATES),
        )
        if scope == "episode":
            query = query.filter(
                VfUpgradeSuggestion.season_number == season_number,
                VfUpgradeSuggestion.episode_number == episode_number,
            )
        for suggestion in (await db.execute(query)).scalars().all():
            previous = suggestion.status
            suggestion.status = "verified"
            suggestion.completed_at = now_utc_naive()
            suggestion.updated_at = now_utc_naive()
            suggestion.arr_message = "VF confirmee a l'import par les pistes audio mesurees par *arr"
            confirmed += 1
            await _announce(db, settings, suggestion, media, previous, True)
    if confirmed:
        logger.info("VF upgrade : %s amelioration(s) confirmee(s) des l'import %s", confirmed, arr_type)
    return confirmed


async def reconcile_all(db: AsyncSession) -> dict[str, int]:
    """Fait avancer toutes les suggestions actives -- point d'entree du job de fond.

    Sans ce passage periodique, rien ne fait progresser une amelioration entre deux
    visites de la page : le delai de validation ne se declenche pas, les relances
    automatiques n'ont jamais lieu et aucune notification ne part.
    """
    settings = (await db.execute(select(Settings))).scalars().first()
    rows = (
        (await db.execute(select(VfUpgradeSuggestion).filter(VfUpgradeSuggestion.status.in_(ACTIVE_UPGRADE_STATES))))
        .scalars()
        .all()
    )
    if not rows:
        return {"checked": 0, "advanced": 0}

    request_ids = {row.source_id for row in rows if row.source_type == "request"}
    library_ids = {row.source_id for row in rows if row.source_type == "library_item"}
    media_by_key: dict[tuple[str, int], object] = {}
    if request_ids:
        for item in (await db.execute(select(MediaRequest).filter(MediaRequest.id.in_(request_ids)))).scalars().all():
            media_by_key[("request", item.id)] = item
    if library_ids:
        for item in (await db.execute(select(LibraryItem).filter(LibraryItem.id.in_(library_ids)))).scalars().all():
            media_by_key[("library_item", item.id)] = item

    queues = QueueCache()
    advanced = 0
    for row in rows:
        media = media_by_key.get((row.source_type, row.source_id))
        if not media or not media.arr_id:
            continue
        try:
            if await refresh_lifecycle(db, row, media, settings=settings, queues=queues):
                advanced += 1
        except Exception as exc:
            logger.warning("VF upgrade : reconciliation impossible pour la suggestion %s : %s", row.id, exc)
    await db.commit()

    if advanced:
        from ..realtime import publish

        await publish("vf_upgrade.updated", {"action": "lifecycle_reconciled", "advanced": advanced}, admin_only=True)
    logger.info("VF upgrade : cycle de vie -- %s suggestion(s) examinee(s), %s avancee(s)", len(rows), advanced)
    return {"checked": len(rows), "advanced": advanced}
