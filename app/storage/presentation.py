"""Cheap transfer presentation derived from saved manifests; no live scans."""

import re
from pathlib import PurePosixPath

VIDEO = (".mkv", ".mp4", ".avi", ".mov", ".m4v", ".ts", ".webm")


def file_counts(files):
    episodes, seasons = set(), set()
    videos = [f for f in files if f.lower().endswith(VIDEO)]
    identified = 0
    for filename in videos:
        matches = list(
            re.finditer(
                r"[sS](\d{1,3})[eE](\d{1,4})((?:[eE]\d{1,4})*)", PurePosixPath(filename.replace("\\", "/")).name
            )
        )
        if not matches:
            continue
        identified += 1
        for match in matches:
            season = int(match[1])
            seasons.add(season)
            episodes.add((season, int(match[2])))
            episodes.update((season, int(e)) for e in re.findall(r"[eE](\d+)", match[3]))
    # Unknown names remain unknown instead of pretending one file is one episode.
    return {
        "episodes": len(episodes) if identified == len(videos) and videos else None,
        "seasons": len(seasons) if identified == len(videos) and videos else None,
        "files": len(videos),
    }


def item_presentation(item):
    files = (item.snapshot or {}).get("files", [])
    counts = file_counts(files)
    remaining = file_counts([f for f in files if f not in (item.proofs or {})])
    return {"counts": counts, "remaining_counts": remaining}
