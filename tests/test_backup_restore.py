"""Tests unitaires pour app/backup_restore.py (partie sans PostgreSQL réel : fichiers, archive)."""

import tarfile
import zipfile
from pathlib import Path

import pytest

from app.backup_restore import (
    ARCHIVE_DUMP_NAME,
    BackupRestoreError,
    build_full_backup_zip,
    bundle_data_files,
    extract_data_files,
    read_full_backup_zip,
)


def test_bundle_data_files_returns_none_when_nothing_present(tmp_path):
    assert bundle_data_files(tmp_path) is None


def test_bundle_and_extract_data_files_roundtrip(tmp_path):
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    (source_dir / ".encryption_key").write_text("enc-key-value")
    (source_dir / "ignored_conflicts.json").write_text('{"ignored": []}')

    tar_bytes = bundle_data_files(source_dir)
    assert tar_bytes is not None

    dest_dir = tmp_path / "dest"
    extracted = extract_data_files(tar_bytes, dest_dir)

    assert set(extracted) == {".encryption_key", "ignored_conflicts.json"}
    assert (dest_dir / ".encryption_key").read_text() == "enc-key-value"
    assert (dest_dir / "ignored_conflicts.json").read_text() == '{"ignored": []}'
    # .secret_key n'existait pas a la source : pas d'entree fantome cote extraction.
    assert not (dest_dir / ".secret_key").exists()


def test_extract_data_files_ignores_unexpected_members(tmp_path):
    """Un tar.gz forgé (chemin hors data/, ou fichier non attendu) ne doit rien écrire ailleurs
    que les trois noms de fichiers connus."""
    evil_tar = tmp_path / "evil.tar.gz"
    with tarfile.open(evil_tar, "w:gz") as tar:
        info = tarfile.TarInfo(name="../../etc/passwd")
        info.size = 4
        import io

        tar.addfile(info, io.BytesIO(b"evil"))
        info2 = tarfile.TarInfo(name="unexpected_file.txt")
        info2.size = 4
        tar.addfile(info2, io.BytesIO(b"nope"))

    dest_dir = tmp_path / "dest"
    extracted = extract_data_files(evil_tar.read_bytes(), dest_dir)

    assert extracted == []
    assert list(dest_dir.iterdir()) == []


def test_build_and_read_full_backup_zip_roundtrip(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / ".encryption_key").write_text("enc-key-value")

    dump_path = tmp_path / "database.dump"
    dump_path.write_bytes(b"fake-pg-dump-bytes")
    export_payload = {"version": 3, "settings": {"smtp_from": "a@b.com"}}
    manifest = {"kind": "watchdeck-full-backup", "archive_version": 1}

    zip_bytes = build_full_backup_zip(dump_path, export_payload, manifest)
    zip_path = tmp_path / "backup.zip"
    zip_path.write_bytes(zip_bytes)

    with zipfile.ZipFile(zip_path) as zf:
        names = set(zf.namelist())
    assert ARCHIVE_DUMP_NAME in names
    assert "data-files.tar.gz" in names
    assert "export.json" in names
    assert "manifest.json" in names

    result = read_full_backup_zip(zip_path, tmp_path / "extracted")
    assert result["dump_path"].read_bytes() == b"fake-pg-dump-bytes"
    assert result["export_payload"] == export_payload
    assert result["manifest"] == manifest
    assert result["data_bundle"] is not None

    extracted_data = extract_data_files(result["data_bundle"], tmp_path / "restored-data")
    assert extracted_data == [".encryption_key"]
    assert (tmp_path / "restored-data" / ".encryption_key").read_text() == "enc-key-value"


def test_build_full_backup_zip_without_export_or_data_files(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    dump_path = tmp_path / "database.dump"
    dump_path.write_bytes(b"only-the-dump")

    zip_bytes = build_full_backup_zip(dump_path, None, {"kind": "watchdeck-full-backup"})
    zip_path = tmp_path / "backup.zip"
    zip_path.write_bytes(zip_bytes)

    with zipfile.ZipFile(zip_path) as zf:
        names = set(zf.namelist())
    assert names == {ARCHIVE_DUMP_NAME, "manifest.json"}


def test_read_full_backup_zip_rejects_missing_dump(tmp_path):
    zip_path = tmp_path / "bad.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("manifest.json", "{}")

    with pytest.raises(BackupRestoreError, match="database.dump"):
        read_full_backup_zip(zip_path, tmp_path / "extracted")


def test_read_full_backup_zip_rejects_corrupt_zip(tmp_path):
    bad_path = tmp_path / "not-a-zip.zip"
    bad_path.write_bytes(b"this is not a zip file")

    with pytest.raises(BackupRestoreError, match="invalide"):
        read_full_backup_zip(bad_path, tmp_path / "extracted")


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+asyncpg://u:p@db/watchdeck",
        "postgresql+psycopg2://u:p@db/watchdeck",
        "postgresql://u:p@db/watchdeck",
        "postgres://u:p@db/watchdeck",
    ],
)
def test_postgres_client_url_normalizes_driver_prefixes(url):
    from app.backup_restore import postgres_client_url

    assert postgres_client_url(url) == "postgresql://u:p@db/watchdeck"


def test_postgres_client_url_rejects_other_engines():
    from app.backup_restore import postgres_client_url

    with pytest.raises(BackupRestoreError, match="PostgreSQL"):
        postgres_client_url("sqlite:///data/watchdeck.db")


def test_create_postgres_backup_requires_client_tools(tmp_path, monkeypatch):
    from app import backup_restore

    monkeypatch.setattr(backup_restore.shutil, "which", lambda name: None)
    with pytest.raises(BackupRestoreError, match="indisponibles"):
        backup_restore.create_postgres_backup("postgresql://u:p@db/w", tmp_path)


def test_create_postgres_backup_dumps_then_verifies(tmp_path, monkeypatch):
    from app import backup_restore

    calls = []
    monkeypatch.setattr(backup_restore.shutil, "which", lambda name: f"/usr/bin/{name}")
    monkeypatch.setattr(backup_restore.subprocess, "run", lambda args, **kwargs: calls.append(args))

    path = backup_restore.create_postgres_backup("postgresql+asyncpg://u:p@db/w", tmp_path / "backups")

    assert path.parent == tmp_path / "backups"
    assert calls[0][:2] == ["/usr/bin/pg_dump", "--format=custom"]
    assert calls[0][-1] == "postgresql://u:p@db/w"
    assert calls[1] == ["/usr/bin/pg_restore", "--list", str(path)]


def test_create_postgres_backup_removes_partial_dump_on_failure(tmp_path, monkeypatch):
    import subprocess

    from app import backup_restore

    def fail(args, **kwargs):
        Path(args[3]).write_bytes(b"partiel")
        raise subprocess.CalledProcessError(1, args, stderr="connexion refusée")

    monkeypatch.setattr(backup_restore.shutil, "which", lambda name: f"/usr/bin/{name}")
    monkeypatch.setattr(backup_restore.subprocess, "run", fail)

    with pytest.raises(BackupRestoreError, match="connexion refusée"):
        backup_restore.create_postgres_backup("postgresql://u:p@db/w", tmp_path)
    assert not list(tmp_path.glob("*.dump"))
