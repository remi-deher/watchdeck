"""Sauvegarde et restauration complètes (reprise après sinistre) — voir app/backup_restore.py.

Distinct de importexport.py : ici on remplace TOUT (base + fichiers hors base), pas une
fusion. Reservé aux administrateurs authentifiés ; voir app/routers/auth.py pour l'équivalent
utilisable depuis /setup, avant qu'un compte n'existe.
"""

import asyncio
import logging
import os
import tempfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..backup_restore import build_full_backup_zip, perform_full_restore
from ..database import DATABASE_URL, get_db_async
from ..dependencies import require_admin
from ..legacy_migration import LegacyMigrationError, create_postgres_backup
from ..utils import now_utc
from .importexport import build_export_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backup", tags=["backup"], dependencies=[Depends(require_admin)])


def _require_postgres() -> None:
    if not DATABASE_URL.startswith("postgresql"):
        raise HTTPException(409, "La sauvegarde/restauration complète nécessite PostgreSQL")


@router.get("/full")
async def download_full_backup(db: AsyncSession = Depends(get_db_async)):
    """Dump PostgreSQL + fichiers hors base + export JSON (repli), dans une seule archive."""
    _require_postgres()
    try:
        with tempfile.TemporaryDirectory(prefix="watchdeck-backup-") as tmp_dir:
            dump_path = await asyncio.to_thread(create_postgres_backup, DATABASE_URL, tmp_dir)
            export_payload = await build_export_payload(db, include_secrets=True)
            manifest = {
                "created_at": now_utc().isoformat(),
                "kind": "watchdeck-full-backup",
                "archive_version": 1,
            }
            content = await asyncio.to_thread(build_full_backup_zip, dump_path, export_payload, manifest)
    except LegacyMigrationError as exc:
        raise HTTPException(500, str(exc)) from exc

    filename = f"watchdeck-full-backup-{now_utc().strftime('%Y%m%d-%H%M%S')}.zip"
    return Response(
        content=content,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/full/restore")
async def restore_full_backup(
    file: UploadFile = File(...),
    confirm: str = Form(...),
):
    """Remplace ENTIÈREMENT la base de données et la configuration actuelles par celles de
    l'archive fournie — rien n'est fusionné, rien de l'état courant n'est conservé au-delà de
    la sauvegarde de sécurité automatique prise juste avant. Le conteneur redémarre ensuite
    (voir docker-compose.yml : `restart: unless-stopped`) pour repartir sur des connexions
    fraîches et rejouer la vérification de migration habituelle au démarrage."""
    _require_postgres()
    if confirm != "REMPLACER":
        raise HTTPException(400, "Saisissez REMPLACER pour confirmer le remplacement complet")

    content = await file.read()
    try:
        report = await perform_full_restore(content, DATABASE_URL)
    except LegacyMigrationError as exc:
        raise HTTPException(400, str(exc)) from exc

    logger.warning("Restauration complète effectuée par un administrateur ; redémarrage programmé.")
    asyncio.get_event_loop().call_later(2.0, os._exit, 0)
    return {"status": "ok", "restarting": True, **report}
