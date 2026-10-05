from pathlib import Path

import pytest

from app.storage import discovery, local_mounts


def mounts(monkeypatch):
    text = "\n".join(
        f"{i} 1 0:1 / {path} rw - {kind} source rw"
        for i, (path, kind) in enumerate(
            [
                ("/", "overlay"),
                ("/app/data", "ext4"),
                ("/etc/hosts", "ext4"),
                ("/proc", "proc"),
                ("/storage/data1", "ext4"),
                ("/usb1", "ext4"),
                ("/media2", "ext4"),
                ("/dev/shm", "tmpfs"),
            ]
        )
    )
    monkeypatch.setattr(Path, "read_text", lambda *_args, **_kwargs: text)
    monkeypatch.setattr(Path, "is_dir", lambda _: True)
    monkeypatch.setattr(Path, "is_symlink", lambda _: False)
    monkeypatch.setattr(Path, "resolve", lambda self: self)


def test_detects_custom_mount_targets_and_excludes_system(monkeypatch):
    mounts(monkeypatch)
    assert local_mounts.media_mounts() == ["/media2", "/storage/data1", "/usb1"]
    assert local_mounts.mounted_root("/usb1/FILMS") == Path("/usb1/FILMS")
    assert local_mounts.mounted_root("/media2") == Path("/media2")
    with pytest.raises(ValueError, match="non monté"):
        local_mounts.mounted_root("/usb10/FILMS")


@pytest.mark.parametrize("path", ["/", "/app/data", "/etc", "/proc", "/dev", "/storage/../etc"])
def test_rejects_system_and_traversal_paths(path):
    with pytest.raises(ValueError):
        local_mounts.media_path(path)


def test_virtual_root_exposes_only_mounts_without_listing_container(monkeypatch):
    mounts(monkeypatch)
    monkeypatch.setattr(Path, "iterdir", lambda _: pytest.fail("The container root must never be listed"))
    result = discovery.inspect_request(dict(operation="browse", path="/"))
    assert result["directories"] == [dict(name=p, path=p) for p in ["/media2", "/storage", "/usb1"]]
    assert result["selectable"] is False and result["parent"] is None
    assert discovery.inspect_request(dict(operation="browse", path="/storage"))["directories"] == [
        dict(name="data1", path="/storage/data1")
    ]


def test_symlinks_are_never_accepted(monkeypatch):
    mounts(monkeypatch)
    monkeypatch.setattr(Path, "is_symlink", lambda _: True)
    with pytest.raises(ValueError):
        local_mounts.mounted_root("/usb1/FILMS")


def test_storage_group_remains_accessible_when_no_volume_is_mounted(monkeypatch):
    monkeypatch.setattr(discovery, "media_mounts", lambda: [])
    result = discovery.inspect_request(dict(operation="browse", path="/storage"))
    assert result == dict(path="/storage", parent="/", directories=[], selectable=False)
    root = discovery.inspect_request(dict(operation="browse", path="/"))
    assert root["directories"] == [dict(name="/storage", path="/storage")]


@pytest.mark.parametrize("nested", [False, True])
def test_browser_lists_only_directories_with_safe_parent(tmp_path, monkeypatch, nested):
    from app.storage import worker

    root = tmp_path / "mounted"
    root.mkdir()
    current = root / "library" if nested else root
    current.mkdir(exist_ok=True)
    (current / "Zebra").mkdir()
    (current / "alpha").mkdir()
    (current / "movie.mkv").write_bytes(b"movie")
    monkeypatch.setattr(discovery, "media_mounts", lambda: [str(root)])
    monkeypatch.setattr(worker, "mounted_root", lambda value: Path(value))
    result = discovery.inspect_request(dict(operation="browse", path=str(current)))
    assert result["selectable"] is True
    assert result["parent"] == (str(root) if nested else "/")
    assert result["directories"] == [dict(name=name, path=str(current / name)) for name in ["alpha", "Zebra"]]
