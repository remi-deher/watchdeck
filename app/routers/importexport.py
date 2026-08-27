import asyncio
import json
import logging
import os
import sqlite3
import tempfile
import uuid
from datetime import datetime
from pathlib import Path

import sqlalchemy
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from starlette.background import BackgroundTask

from ..crypto import EncryptedText
from ..database import DATABASE_URL, get_db_async
from ..dependencies import require_admin
from ..legacy_migration import (
    LegacyMigrationError,
    create_postgres_backup,
    inspect_legacy_sqlite,
    migrate_sqlite_to_postgres,
)
from ..models import (
    AdminActionLog,
    ArrInstance,
    DeletedMediaLog,
    DiagnosticEvent,
    DownloadClient,
    DownloadHistory,
    EmailBranding,
    EmailProvider,
    EmailTemplate,
    EpisodeAvailability,
    EpisodeMetadata,
    JobRunLog,
    LibraryAnalyticsSnapshot,
    LibraryItem,
    LoginAttempt,
    MediaIssue,
    MediaRequest,
    NotificationLog,
    NotificationMilestone,
    PasskeyCredential,
    PendingNotification,
    PlaybackDailyAggregate,
    PlaybackIpLocation,
    PlaybackSession,
    PlexUser,
    PollHistory,
    RadarrQueueObservation,
    RequesterNotificationReceipt,
    RequestSeasonStatus,
    SearchCache,
    SeriesAcquisitionBatch,
    Settings,
    SonarrQueueObservation,
    TrackerFavicon,
    VfEpisodeStatus,
    VfUpgradeSuggestion,
)
from ..utils import now_utc, safe_error_message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["import-export"], dependencies=[Depends(require_admin)])

EXPORT_VERSION = 3
MIGRATION_LOCK_KEY = "watchdeck:migration:lock"
DEFAULT_LEGACY_IMPORT_MAX_BYTES = 256 * 1024 * 1024

# Champs non chiffrés mais toujours liés à l'authentification admin : jamais exportés ni
# importables via ce mécanisme, en plus des colonnes EncryptedText détectées automatiquement.
_ALWAYS_EXCLUDED = {
    "auth_username",
    "auth_password_hash",
}

# Tables incluses dans l'export pour référence/consultation, mais jamais réimportées : soit
# des journaux/historiques sans clé de fusion sûre entre deux installations différentes (les
# id autoincrement sont locaux à chaque base), soit des données régénérées automatiquement par
# les jobs planifiés (cache VF, sync bibliothèque).
_REFERENCE_ONLY_MODELS = {
    "notification_logs": NotificationLog,
    "admin_action_logs": AdminActionLog,
    "notification_milestones": NotificationMilestone,
    "requester_notification_receipts": RequesterNotificationReceipt,
    "poll_history": PollHistory,
    "download_history": DownloadHistory,
    "media_issues": MediaIssue,
    "library_items": LibraryItem,
    "vf_episode_status": VfEpisodeStatus,
    "search_cache": SearchCache,
    "tracker_favicons": TrackerFavicon,
    "series_acquisition_batches": SeriesAcquisitionBatch,
    "sonarr_queue_observations": SonarrQueueObservation,
    "radarr_queue_observations": RadarrQueueObservation,
    "deleted_media_log": DeletedMediaLog,
    "diagnostic_events": DiagnosticEvent,
    "job_run_logs": JobRunLog,
    "episode_metadata": EpisodeMetadata,
    "vf_upgrade_suggestions": VfUpgradeSuggestion,
    "episode_availability": EpisodeAvailability,
    "pending_notifications": PendingNotification,
    "playback_sessions": PlaybackSession,
    "playback_ip_locations": PlaybackIpLocation,
    "playback_daily_aggregates": PlaybackDailyAggregate,
    "library_analytics_snapshots": LibraryAnalyticsSnapshot,
    "login_attempts": LoginAttempt,
}


def _secret_columns(model) -> set[str]:
    """Colonnes EncryptedText d'un modèle : détection automatique des champs sensibles,
    pour ne plus dépendre d'une liste codée en dur qui prend du retard à chaque nouveau
    secret ajouté au modèle."""
    return {c.name for c in model.__table__.columns if isinstance(c.type, EncryptedText)}


def _row(obj, exclude: set[str] | None = None) -> dict:
    exclude = exclude or set()
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns if c.name not in exclude}


def _sqlite_path() -> str:
    if not DATABASE_URL.startswith("sqlite"):
        raise HTTPException(400, "Backup binaire disponible uniquement pour SQLite")
    return DATABASE_URL.replace("sqlite:///", "", 1)


def _coerce_value(model, key: str, value):
    """Convertit une valeur JSON (str/int/bool/None) vers le type Python attendu par la
    colonne SQLAlchemy correspondante, tolérant les représentations texte (formulaires JSON
    exportés par une version antérieure de l'app, ou édités à la main)."""
    column = model.__table__.columns.get(key)
    if column is None or value is None:
        return value
    try:
        py_type = column.type.python_type
    except NotImplementedError:
        return value
    if py_type is bool and isinstance(value, str):
        return value.lower() in ("true", "1", "on", "yes")
    if py_type is int and not isinstance(value, bool):
        try:
            return int(value)
        except (ValueError, TypeError):
            return None
    if py_type is float:
        try:
            return float(value)
        except (ValueError, TypeError):
            return None
    if py_type is datetime and isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return value
    return value


def _apply_fields(obj, model, data: dict, skip: frozenset[str] = frozenset({"id"})) -> None:
    secret_cols = _secret_columns(model)
    for k, v in data.items():
        if k in skip or not hasattr(obj, k):
            continue
        if k in secret_cols and not v:
            continue  # ne jamais écraser un secret existant par une valeur vide
        setattr(obj, k, _coerce_value(model, k, v))


async def build_export_payload(db: AsyncSession, include_secrets: bool = False) -> dict:
    """Construit le contenu de l'export JSON. Partagé avec `app.backup_restore` (archive
    de sauvegarde complète, où ce JSON voyage comme repli lisible en plus du dump binaire)."""
    s = (await db.execute(select(Settings))).scalars().first()
    users = (await db.execute(select(PlexUser))).scalars().all()
    requests = (await db.execute(select(MediaRequest))).scalars().all()
    arr_instances = (await db.execute(select(ArrInstance))).scalars().all()
    download_clients = (await db.execute(select(DownloadClient))).scalars().all()
    passkeys = (await db.execute(select(PasskeyCredential))).scalars().all()
    email_providers = (await db.execute(select(EmailProvider))).scalars().all()
    email_branding = (await db.execute(select(EmailBranding))).scalars().first()
    email_templates = (await db.execute(select(EmailTemplate))).scalars().all()
    season_statuses = (await db.execute(select(RequestSeasonStatus))).scalars().all()
    users_by_id = {u.id: u.plex_user_id for u in users}

    def secret_exclude(model) -> set[str]:
        return set() if include_secrets else _secret_columns(model)

    season_statuses_by_request: dict[int, list[dict]] = {}
    for status in season_statuses:
        season_statuses_by_request.setdefault(status.request_id, []).append(_row(status, exclude={"id", "request_id"}))

    def _request_row(r: MediaRequest) -> dict:
        return {**_row(r), "season_statuses": season_statuses_by_request.get(r.id, [])}

    settings_row = _row(s, exclude={"id", *_ALWAYS_EXCLUDED, *secret_exclude(Settings)}) if s else {}
    return {
        "version": EXPORT_VERSION,
        "exported_at": now_utc().isoformat(),
        "settings": settings_row,
        "users": [_row(u, exclude=secret_exclude(PlexUser)) for u in users],
        "requests": [_request_row(r) for r in requests],
        "arr_instances": [_row(i, exclude={"id", *secret_exclude(ArrInstance)}) for i in arr_instances],
        "download_clients": [_row(c, exclude={"id", *secret_exclude(DownloadClient)}) for c in download_clients],
        "passkey_credentials": [
            {
                **_row(p, exclude={"id", "user_id", *secret_exclude(PasskeyCredential)}),
                "plex_user_id": users_by_id.get(p.user_id),
            }
            for p in passkeys
        ],
        "email_providers": [_row(e, exclude={"id", *secret_exclude(EmailProvider)}) for e in email_providers],
        "email_branding": _row(email_branding, exclude={"settings_id"}) if email_branding else {},
        "email_templates": [_row(t, exclude={"id", "settings_id"}) for t in email_templates],
        # Référence seulement — non réimportées (voir _REFERENCE_ONLY_MODELS).
        **{
            key: [_row(o) for o in (await db.execute(select(model))).scalars().all()]
            for key, model in _REFERENCE_ONLY_MODELS.items()
        },
    }


@router.get("/export")
async def export_data(include_secrets: bool = False, db: AsyncSession = Depends(get_db_async)):
    payload = await build_export_payload(db, include_secrets)
    content = json.dumps(payload, indent=2, default=str)
    suffix = "-avec-identifiants" if include_secrets else ""
    filename = f"watchdeck-export{suffix}-{now_utc().strftime('%Y%m%d-%H%M%S')}.json"
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/backup/db")
def backup_database():
    """Create a consistent SQLite backup or a validated PostgreSQL custom dump."""
    if DATABASE_URL.startswith("postgresql"):
        try:
            backup = create_postgres_backup(DATABASE_URL, tempfile.gettempdir())
        except LegacyMigrationError as exc:
            raise HTTPException(500, str(exc)) from exc
        filename = f"watchdeck-backup-{now_utc().strftime('%Y%m%d-%H%M%S')}.dump"
        return FileResponse(
            backup,
            media_type="application/octet-stream",
            filename=filename,
            background=BackgroundTask(backup.unlink, missing_ok=True),
        )

    src_path = _sqlite_path()
    if not os.path.exists(src_path):
        raise HTTPException(404, "Fichier de base introuvable")

    fd, tmp_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        src = sqlite3.connect(src_path)
        dst = sqlite3.connect(tmp_path)
        try:
            src.backup(dst)
        finally:
            src.close()
            dst.close()
    except Exception as e:
        os.unlink(tmp_path)
        raise HTTPException(500, f"Échec du backup : {e}")

    filename = f"watchdeck-backup-{now_utc().strftime('%Y%m%d-%H%M%S')}.db"
    return FileResponse(
        tmp_path,
        media_type="application/octet-stream",
        filename=filename,
        background=BackgroundTask(os.unlink, tmp_path),
    )


async def _save_legacy_upload(file: UploadFile) -> Path:
    filename = (file.filename or "").lower()
    if not filename.endswith((".db", ".sqlite", ".sqlite3")):
        raise HTTPException(400, "Selectionnez un fichier SQLite (.db, .sqlite ou .sqlite3)")
    maximum = int(os.getenv("LEGACY_IMPORT_MAX_BYTES", str(DEFAULT_LEGACY_IMPORT_MAX_BYTES)))
    fd, raw_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    path = Path(raw_path)
    size = 0
    try:
        with path.open("wb") as destination:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > maximum:
                    raise HTTPException(413, f"Fichier trop volumineux (maximum {maximum // 1024 // 1024} Mo)")
                destination.write(chunk)
        return path
    except Exception:
        path.unlink(missing_ok=True)
        raise


async def _acquire_migration_lock() -> tuple[object | None, str | None]:
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return None, None
    from redis.asyncio import Redis

    redis = Redis.from_url(redis_url, encoding="utf-8", decode_responses=True)
    token = uuid.uuid4().hex
    if not await redis.set(MIGRATION_LOCK_KEY, token, ex=3600, nx=True):
        await redis.aclose()
        raise HTTPException(409, "Une migration est deja en cours")
    return redis, token


async def _release_migration_lock(redis, token: str | None) -> None:
    if redis is None or token is None:
        return
    try:
        await redis.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1,
            MIGRATION_LOCK_KEY,
            token,
        )
    finally:
        await redis.aclose()


@router.post("/migration/sqlite/inspect")
async def inspect_legacy_database(file: UploadFile = File(...)):
    path = await _save_legacy_upload(file)
    try:
        return await asyncio.to_thread(inspect_legacy_sqlite, path)
    except LegacyMigrationError as exc:
        raise HTTPException(400, str(exc)) from exc
    finally:
        path.unlink(missing_ok=True)


@router.post("/migration/sqlite")
async def import_legacy_database(
    file: UploadFile = File(...),
    confirm: str = Form(...),
):
    if not DATABASE_URL.startswith("postgresql"):
        raise HTTPException(409, "L'import complet est disponible uniquement vers PostgreSQL")
    if confirm != "REMPLACER":
        raise HTTPException(400, "Saisissez REMPLACER pour confirmer")

    path = await _save_legacy_upload(file)
    redis = None
    token = None
    try:
        await asyncio.to_thread(inspect_legacy_sqlite, path)
        redis, token = await _acquire_migration_lock()
        backup = await asyncio.to_thread(create_postgres_backup, DATABASE_URL)
        report = await asyncio.to_thread(
            migrate_sqlite_to_postgres,
            path,
            DATABASE_URL,
            replace_target=True,
        )
        from ..realtime import publish

        await publish("migration.completed", {"copied_rows": report["copied_rows"]}, admin_only=True)
        return {
            "status": "ok",
            "backup": str(backup),
            "report": report,
        }
    except LegacyMigrationError as exc:
        raise HTTPException(400, str(exc)) from exc
    finally:
        await _release_migration_lock(redis, token)
        path.unlink(missing_ok=True)


@router.post("/import")
async def import_data(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_async),
):
    content = await file.read()
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(400, "Fichier JSON invalide")

    if payload.get("version") not in (1, 2, 3):
        raise HTTPException(400, f"Version d'export non supportée : {payload.get('version')}")

    stats = {
        "settings": False,
        "users_upserted": 0,
        "requests_upserted": 0,
        "season_statuses_upserted": 0,
        "arr_instances_upserted": 0,
        "download_clients_upserted": 0,
        "passkeys_upserted": 0,
        "email_providers_upserted": 0,
        "email_branding": False,
        "email_templates_upserted": 0,
    }
    errors: list[dict] = []

    def _item_label(data: dict, *keys: str) -> str:
        return " / ".join(str(data.get(k)) for k in keys if data.get(k)) or "?"

    async def _run(table: str, label: str, fn) -> bool:
        """Isole chaque item dans un savepoint : une erreur n'annule que cet item (pas tout
        l'import), et est reportée dans `errors` avec assez de contexte pour la corriger."""
        try:
            async with db.begin_nested():
                await fn()
            return True
        except Exception as e:
            logger.exception("Import échoué pour %s / %s", table, label)
            errors.append({"table": table, "item": label, "error": safe_error_message(e)})
            return False

    # Settings — merge sur la ligne unique
    if payload.get("settings"):

        async def _do_settings():
            s = (await db.execute(select(Settings))).scalars().first()
            if not s:
                s = Settings(id=1)
                db.add(s)
            _apply_fields(s, Settings, {k: v for k, v in payload["settings"].items() if k not in _ALWAYS_EXCLUDED})

        stats["settings"] = await _run("settings", "settings", _do_settings)

    # Users — upsert par plex_user_id
    for u_data in payload.get("users", []):
        uid = u_data.get("plex_user_id")
        if not uid:
            continue

        async def _do_user(u_data=u_data, uid=uid):
            user = (await db.execute(select(PlexUser).filter(PlexUser.plex_user_id == uid))).scalars().first()
            if not user:
                user = PlexUser()
                db.add(user)
            _apply_fields(user, PlexUser, u_data)

        if await _run("users", _item_label(u_data, "plex_user_id", "display_name"), _do_user):
            stats["users_upserted"] += 1

    # Requests — upsert par (plex_user_id + title + media_type). Les statuts par saison
    # (season_statuses) sont traites dans le meme savepoint : un echec sur l'un doit annuler
    # les deux plutot que laisser une demande sans son detail de saisons.
    for r_data in payload.get("requests", []):
        season_statuses_data = r_data.get("season_statuses", [])

        async def _do_request(r_data=r_data, season_statuses_data=season_statuses_data):
            existing = (
                (
                    await db.execute(
                        select(MediaRequest).filter(
                            MediaRequest.plex_user_id == r_data.get("plex_user_id"),
                            MediaRequest.title == r_data.get("title"),
                            MediaRequest.media_type == r_data.get("media_type"),
                        )
                    )
                )
                .scalars()
                .first()
            )
            if not existing:
                existing = MediaRequest()
                db.add(existing)
            _apply_fields(existing, MediaRequest, {k: v for k, v in r_data.items() if k != "season_statuses"})

            if season_statuses_data:
                await db.flush()
                existing_statuses = {
                    st.season_number: st
                    for st in (
                        await db.execute(
                            select(RequestSeasonStatus).filter(RequestSeasonStatus.request_id == existing.id)
                        )
                    )
                    .scalars()
                    .all()
                }
                for st_data in season_statuses_data:
                    season_number = st_data.get("season_number")
                    if season_number is None:
                        continue
                    status_row = existing_statuses.get(season_number)
                    if not status_row:
                        status_row = RequestSeasonStatus(request_id=existing.id, season_number=season_number)
                        db.add(status_row)
                    _apply_fields(status_row, RequestSeasonStatus, st_data, skip=frozenset({"id", "request_id"}))
                stats["season_statuses_upserted"] += len(season_statuses_data)

        if await _run("requests", _item_label(r_data, "title", "media_type"), _do_request):
            stats["requests_upserted"] += 1

    # Arr instances — upsert par (name, arr_type)
    for a_data in payload.get("arr_instances", []):
        name, arr_type = a_data.get("name"), a_data.get("arr_type")
        if not name or not arr_type:
            continue

        async def _do_arr(a_data=a_data, name=name, arr_type=arr_type):
            inst = (
                (
                    await db.execute(
                        select(ArrInstance).filter(ArrInstance.name == name, ArrInstance.arr_type == arr_type)
                    )
                )
                .scalars()
                .first()
            )
            if not inst:
                inst = ArrInstance()
                db.add(inst)
            _apply_fields(inst, ArrInstance, a_data)

        if await _run("arr_instances", _item_label(a_data, "name", "arr_type"), _do_arr):
            stats["arr_instances_upserted"] += 1

    # Download clients — upsert par (name, client_type)
    for c_data in payload.get("download_clients", []):
        name, client_type = c_data.get("name"), c_data.get("client_type")
        if not name or not client_type:
            continue

        async def _do_client(c_data=c_data, name=name, client_type=client_type):
            client = (
                (
                    await db.execute(
                        select(DownloadClient).filter(
                            DownloadClient.name == name, DownloadClient.client_type == client_type
                        )
                    )
                )
                .scalars()
                .first()
            )
            if not client:
                client = DownloadClient()
                db.add(client)
            _apply_fields(client, DownloadClient, c_data)

        if await _run("download_clients", _item_label(c_data, "name", "client_type"), _do_client):
            stats["download_clients_upserted"] += 1

    # Email providers — upsert par (name, provider_type)
    for e_data in payload.get("email_providers", []):
        name, provider_type = e_data.get("name"), e_data.get("provider_type")
        if not name or not provider_type:
            continue

        async def _do_email_provider(e_data=e_data, name=name, provider_type=provider_type):
            provider = (
                (
                    await db.execute(
                        select(EmailProvider).filter(
                            EmailProvider.name == name, EmailProvider.provider_type == provider_type
                        )
                    )
                )
                .scalars()
                .first()
            )
            if not provider:
                provider = EmailProvider()
                db.add(provider)
            _apply_fields(provider, EmailProvider, e_data)

        if await _run("email_providers", _item_label(e_data, "name", "provider_type"), _do_email_provider):
            stats["email_providers_upserted"] += 1

    # Email branding — merge sur la ligne unique rattachee a Settings.id=1
    if payload.get("email_branding"):

        async def _do_email_branding():
            s = (await db.execute(select(Settings))).scalars().first()
            if not s:
                s = Settings(id=1)
                db.add(s)
                await db.flush()
            branding = (
                (await db.execute(select(EmailBranding).filter(EmailBranding.settings_id == s.id))).scalars().first()
            )
            if not branding:
                branding = EmailBranding(settings_id=s.id)
                db.add(branding)
            _apply_fields(branding, EmailBranding, payload["email_branding"], skip=frozenset({"settings_id"}))

        stats["email_branding"] = await _run("email_branding", "email_branding", _do_email_branding)

    # Email templates — upsert par event, rattaches a Settings.id=1
    email_templates_data = payload.get("email_templates", [])
    if email_templates_data:
        s = (await db.execute(select(Settings))).scalars().first()
        if not s:
            s = Settings(id=1)
            db.add(s)
            await db.flush()
        settings_id = s.id
        for t_data in email_templates_data:
            event = t_data.get("event")
            if not event:
                continue

            async def _do_template(t_data=t_data, event=event, settings_id=settings_id):
                tpl = (
                    (
                        await db.execute(
                            select(EmailTemplate).filter(
                                EmailTemplate.settings_id == settings_id, EmailTemplate.event == event
                            )
                        )
                    )
                    .scalars()
                    .first()
                )
                if not tpl:
                    tpl = EmailTemplate(settings_id=settings_id, event=event)
                    db.add(tpl)
                _apply_fields(tpl, EmailTemplate, t_data, skip=frozenset({"id", "settings_id"}))

            if await _run("email_templates", _item_label(t_data, "event"), _do_template):
                stats["email_templates_upserted"] += 1

    # Passkeys — upsert par credential_id, rattaché à l'utilisateur via plex_user_id
    # (user_id est un id local non portable entre deux bases différentes)
    if payload.get("passkey_credentials"):
        await db.flush()
        user_by_plex_id = {u.plex_user_id: u.id for u in (await db.execute(select(PlexUser))).scalars().all()}
    for p_data in payload.get("passkey_credentials", []):
        credential_id = p_data.get("credential_id")
        target_user_id = user_by_plex_id.get(p_data.get("plex_user_id")) if credential_id else None
        if not credential_id or not target_user_id:
            continue

        async def _do_passkey(p_data=p_data, credential_id=credential_id, target_user_id=target_user_id):
            cred = (
                (await db.execute(select(PasskeyCredential).filter(PasskeyCredential.credential_id == credential_id)))
                .scalars()
                .first()
            )
            if not cred:
                cred = PasskeyCredential(credential_id=credential_id, user_id=target_user_id)
                db.add(cred)
            else:
                cred.user_id = target_user_id
            _apply_fields(cred, PasskeyCredential, {k: v for k, v in p_data.items() if k != "plex_user_id"})

        if await _run("passkey_credentials", _item_label(p_data, "credential_id", "name"), _do_passkey):
            stats["passkeys_upserted"] += 1

    await db.commit()
    return {"status": "ok", "stats": stats, "errors": errors}
