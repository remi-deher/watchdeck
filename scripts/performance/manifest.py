"""Record non-secret versions and source/build fingerprints for the local baseline."""

import gzip
import hashlib
import importlib.metadata
import json
import os
import platform
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def command(args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


html = (ROOT / "app/static/vue/index.html").read_text()
assets = re.findall(r'(?:src|href)="/vue/([^\"]+\.(?:js|css))"', html)
versions = {
    name: importlib.metadata.version(name) for name in ["fastapi", "uvicorn", "sqlalchemy", "asyncpg", "redis", "arq"]
}
files = [*sorted((ROOT / "app").rglob("*.py")), *sorted((ROOT / "scripts/performance").glob("*.*"))]
source = hashlib.sha256()
for path in files:
    source.update(str(path.relative_to(ROOT)).encode())
    source.update(path.read_bytes())
data = {
    "date": "2026-10-28",
    "platform": platform.platform(),
    "python": platform.python_version(),
    "cpu_visible": os.cpu_count(),
    "cpu_model": next(
        line.partition(":")[2].strip()
        for line in Path("/proc/cpuinfo").read_text().splitlines()
        if line.startswith("model name")
    ),
    "cpu_quota": Path("/sys/fs/cgroup/cpu.max").read_text().strip(),
    "memory_limit": Path("/sys/fs/cgroup/memory.max").read_text().strip(),
    "versions": versions,
    "node": command(["node", "--version"]),
    "chromium": command([os.getenv("CHROMIUM_PATH", "/usr/bin/chromium"), "--version"]),
    "git_base": command(["git", "rev-parse", "HEAD"]),
    "source_sha256": source.hexdigest(),
    "postgres": command(
        [
            "docker",
            "exec",
            "watchdeck-postgres-test",
            "psql",
            "-U",
            "watchdeck",
            "-d",
            "watchdeck_perf_lot0",
            "-Atc",
            "SHOW server_version",
        ]
    ),
    "initial_assets": {
        ext: {
            "files": len([f for f in assets if f.endswith("." + ext)]),
            "raw_bytes": sum((ROOT / "app/static/vue" / f).stat().st_size for f in assets if f.endswith("." + ext)),
            "gzip_bytes": sum(
                len(gzip.compress((ROOT / "app/static/vue" / f).read_bytes())) for f in assets if f.endswith("." + ext)
            ),
        }
        for ext in ["js", "css"]
    },
}
(ROOT / "docs/performance-results/lot0/environment.json").write_text(json.dumps(data, indent=2) + "\n")
