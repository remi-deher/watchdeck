"""Media bind mounts, independent of their container target path."""

import re
from pathlib import Path, PurePosixPath

from .planning import absolute_path

SYSTEM_PATHS = {"app", "etc", "proc", "sys", "dev", "run", "usr", "bin", "sbin", "lib", "lib64", "var", "tmp"}
SYSTEM_FILESYSTEMS = {
    "proc",
    "sysfs",
    "devtmpfs",
    "devpts",
    "cgroup",
    "cgroup2",
    "mqueue",
    "securityfs",
    "debugfs",
    "tracefs",
    "pstore",
    "configfs",
    "autofs",
}


def media_path(value):
    value = absolute_path(value)
    if PurePosixPath(value).parts[1] in SYSTEM_PATHS:
        raise ValueError("Chemin système ou applicatif interdit : choisir un montage média.")
    return value


def media_mounts():
    mounts = []
    for line in Path("/proc/self/mountinfo").read_text().splitlines():
        fields = line.split()
        try:
            if fields[fields.index("-") + 1] in SYSTEM_FILESYSTEMS:
                continue
            target = re.sub(r"\\([0-7]{3})", lambda match: chr(int(match[1], 8)), fields[4])
            media_path(target)
            path = Path(target)
            if path.is_dir() and not path.is_symlink() and path.resolve() == path:
                mounts.append(target)
        except (ValueError, IndexError, OSError):
            continue
    return sorted(set(mounts))


def mounted_root(root):
    root = media_path(root)
    path = Path(root)
    if path.is_symlink() or path.resolve() != path or not path.is_dir():
        raise ValueError("Montage absent, lien symbolique ou dossier inaccessible.")
    if not any(root == mount or root.startswith(mount + "/") for mount in media_mounts()):
        raise ValueError("Stockage non monté : refus de travailler sur un dossier local de remplacement.")
    return path
