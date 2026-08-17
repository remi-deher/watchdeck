"""Full disaster-recovery backup/restore: PostgreSQL dump + off-DB data files + JSON fallback.

Distinct from `legacy_migration.py` (SQLite -> PostgreSQL, first install) even though it
reuses `create_postgres_backup`/`postgres_client_url` from there: this module restores a
*PostgreSQL dump produced by this same app* (see `scripts/postgres_backup.sh` for the CLI
equivalent), bundled with the off-DB files a dump alone can't carry (encryption key, session
key, ignored-conflicts state) and a JSON export as a secondary, human-readable fallback if the
binary dump ever can't be restored as-is (e.g. a PostgreSQL major-version mismatch).
"""

from __future__ import annotations

import io
import logging
import os
import shutil
import subprocess
import tarfile
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .legacy_migration import LegacyMigrationError, create_postgres_backup, postgres_client_url

logger = logging.getLogger(__name__)

# Meme cle que app.routers.importexport : les deux operations remplacent entierement la base
# et doivent rester mutuellement exclusives l'une de l'autre, pas seulement entre elles-memes.
MIGRATION_LOCK_KEY = "watchdeck:migration:lock"

DATA_DIR = Path("data")
# Fichiers hors base indispensables a une restauration complete (voir scripts/postgres_backup.sh).
DATA_FILES = (".encryption_key", ".secret_key", "ignored_conflicts.json")

ARCHIVE_DUMP_NAME = "database.dump"
ARCHIVE_DATA_NAME = "data-files.tar.gz"
ARCHIVE_EXPORT_NAME = "export.json"
ARCHIVE_MANIFEST_NAME = "manifest.json"


def bundle_data_files(data_dir: Path = DATA_DIR) -> bytes | None:
    """Tar.gz en mémoire des fichiers hors base présents. None si aucun n'existe."""
    present = [name for name in DATA_FILES if (data_dir / name).is_file()]
    if not present:
        return None
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for name in present:
            tar.add(data_dir / name, arcname=name)
    return buffer.getvalue()


def extract_data_files(tar_bytes: bytes, data_dir: Path = DATA_DIR) -> list[str]:
    """Extrait le tar.gz produit par `bundle_data_files` dans `data_dir`. Retourne les noms extraits."""
    data_dir.mkdir(parents=True, exist_ok=True)
    extracted: list[str] = []
    with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode="r:gz") as tar:
        for member in tar.getmembers():
            # Un tar.gz forge pourrait contenir un chemin absolu ou une remontee ("..") pour
            # ecrire hors de data_dir : on ne restaure que les noms de fichiers plats attendus.
            if member.name not in DATA_FILES or not member.isfile():
                continue
            tar.extract(member, path=data_dir, filter="data")
            extracted.append(member.name)
    return extracted


def restore_postgres_dump(dump_path: str | Path, target_url: str) -> None:
    """Remplace entierement le contenu de la base cible par ce dump (pg_restore --clean)."""
    pg_restore = shutil.which("pg_restore")
    if not pg_restore:
        raise LegacyMigrationError("pg_restore indisponible dans le conteneur")
    try:
        subprocess.run(
            [
                pg_restore,
                "--clean",
                "--if-exists",
                "--no-owner",
                "--no-privileges",
                "--dbname",
                postgres_client_url(target_url),
                str(dump_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or str(exc)).strip()
        raise LegacyMigrationError(f"Restauration PostgreSQL impossible : {detail}") from exc


def build_full_backup_zip(dump_path: Path, export_payload: dict[str, Any] | None, manifest: dict[str, Any]) -> bytes:
    """Assemble le dump, les fichiers hors base et l'export JSON (repli) en une archive unique."""
    import json

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(dump_path, arcname=ARCHIVE_DUMP_NAME)
        data_bundle = bundle_data_files()
        if data_bundle:
            zf.writestr(ARCHIVE_DATA_NAME, data_bundle)
        if export_payload is not None:
            zf.writestr(ARCHIVE_EXPORT_NAME, json.dumps(export_payload, indent=2, default=str))
        zf.writestr(ARCHIVE_MANIFEST_NAME, json.dumps(manifest, indent=2, default=str))
    return buffer.getvalue()


def read_full_backup_zip(zip_path: str | Path, extract_dir: Path) -> dict[str, Any]:
    """Extrait une archive de sauvegarde complete. Retourne les chemins/donnees trouves.

    N'effectue aucune ecriture destructive : seule la lecture/extraction dans `extract_dir`
    (un repertoire temporaire jetable, jamais `data/` directement).
    """
    extract_dir.mkdir(parents=True, exist_ok=True)
    result: dict[str, Any] = {"dump_path": None, "data_bundle": None, "export_payload": None, "manifest": None}
    try:
        with zipfile.ZipFile(zip_path) as zf:
            names = set(zf.namelist())
            if ARCHIVE_DUMP_NAME not in names:
                raise LegacyMigrationError(f"Archive invalide : {ARCHIVE_DUMP_NAME} absent")
            dump_target = extract_dir / ARCHIVE_DUMP_NAME
            dump_target.write_bytes(zf.read(ARCHIVE_DUMP_NAME))
            result["dump_path"] = dump_target
            if ARCHIVE_DATA_NAME in names:
                result["data_bundle"] = zf.read(ARCHIVE_DATA_NAME)
            if ARCHIVE_EXPORT_NAME in names:
                import json

                result["export_payload"] = json.loads(zf.read(ARCHIVE_EXPORT_NAME))
            if ARCHIVE_MANIFEST_NAME in names:
                import json

                result["manifest"] = json.loads(zf.read(ARCHIVE_MANIFEST_NAME))
    except zipfile.BadZipFile as exc:
        raise LegacyMigrationError("Archive de sauvegarde invalide (zip corrompu)") from exc
    return result


async def acquire_restore_lock() -> tuple[object | None, str | None]:
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return None, None
    from redis.asyncio import Redis

    redis = Redis.from_url(redis_url, encoding="utf-8", decode_responses=True)
    token = uuid.uuid4().hex
    if not await redis.set(MIGRATION_LOCK_KEY, token, ex=3600, nx=True):
        await redis.aclose()
        raise LegacyMigrationError("Une migration ou restauration est deja en cours")
    return redis, token


async def release_restore_lock(redis, token: str | None) -> None:
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


async def perform_full_restore(zip_bytes: bytes, target_url: str, *, tmp_dir: Path | None = None) -> dict[str, Any]:
    """Remplace entierement la base ET les fichiers hors base par le contenu de l'archive.

    Destructif et irreversible sans la sauvegarde de securite automatique prise avant
    (`data/backups/pre-restore-*`). Verrouille via Redis pour rester mutuellement exclusif
    avec la migration SQLite legacy, qui remplace elle aussi la base entiere. Ne touche pas
    au processus courant : c'est au routeur appelant de programmer un redemarrage apres coup,
    les connexions/pools existants n'etant plus valides une fois la base remplacee.
    """
    import asyncio
    import tempfile

    tmp_root = tmp_dir or Path(tempfile.gettempdir())
    work_dir = Path(tempfile.mkdtemp(prefix="watchdeck-restore-", dir=tmp_root))
    zip_path = work_dir / "upload.zip"
    zip_path.write_bytes(zip_bytes)

    redis = None
    token = None
    try:
        bundle = await asyncio.to_thread(read_full_backup_zip, zip_path, work_dir / "extracted")

        redis, token = await acquire_restore_lock()

        logger.warning("Restauration complete demandee : sauvegarde de securite de l'etat actuel avant remplacement.")
        safety_dir = Path("data/backups")
        safety_dump = await asyncio.to_thread(create_postgres_backup, target_url, safety_dir)
        safety_data = bundle_data_files()
        if safety_data:
            safety_data_path = safety_dir / f"pre-restore-data-{datetime.now(timezone.utc):%Y%m%d-%H%M%S-%f}.tar.gz"
            safety_data_path.write_bytes(safety_data)

        await asyncio.to_thread(restore_postgres_dump, bundle["dump_path"], target_url)

        restored_data_files: list[str] = []
        if bundle["data_bundle"]:
            restored_data_files = extract_data_files(bundle["data_bundle"])

        logger.warning(
            "Restauration complete terminee (sauvegarde de securite : %s). Redemarrage necessaire.",
            safety_dump,
        )
        return {
            "status": "ok",
            "safety_backup": str(safety_dump),
            "restored_data_files": restored_data_files,
            "manifest": bundle.get("manifest"),
        }
    finally:
        await release_restore_lock(redis, token)
        shutil.rmtree(work_dir, ignore_errors=True)
