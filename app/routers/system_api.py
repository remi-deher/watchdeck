"""Informations de version de l'application et de son image Docker.

`app/version.json` est écrit au moment du build Docker (voir Dockerfile et
.github/workflows/docker-publish.yml) : il n'existe pas en environnement de
développement, où les valeurs par défaut ci-dessous s'appliquent.
"""

import json
import logging
import time
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends

from ..dependencies import require_admin
from ..utils import now_utc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/system", tags=["system"], dependencies=[Depends(require_admin)])

VERSION_FILE = Path(__file__).resolve().parent.parent / "version.json"
GITHUB_REPO = "remi-deher/watchdeck"
GITHUB_REPO_URL = f"https://github.com/{GITHUB_REPO}"
DOCKER_REPOSITORIES = ["mrcryllix/watchdeck", "ghcr.io/remi-deher/watchdeck"]

# Le taux limite non-authentifié de l'API GitHub est bas (60/h) : on met en cache
# la dernière release en mémoire process plutôt que d'appeler GitHub à chaque
# chargement de la page Paramètres > Système.
_RELEASE_CACHE_TTL_SECONDS = 600
_release_cache: dict | None = None
_release_cache_at: float = 0.0
_release_cache_checked_at: str | None = None


def _read_local_version() -> dict:
    if VERSION_FILE.exists():
        try:
            return json.loads(VERSION_FILE.read_text())
        except (OSError, json.JSONDecodeError):
            logger.warning("app/version.json illisible, valeurs par défaut utilisées")
    return {"version": "0.0.0-dev", "git_sha": "unknown", "build_date": "unknown", "branch": "unknown"}


# Comparaison avec main pour les images dev/test : mise en cache par sha (change a
# chaque nouveau build, donc jamais servie perimee) plutot que par TTL.
_comparison_cache: dict[str, dict | None] = {}


async def _fetch_main_comparison(git_sha: str) -> dict | None:
    if git_sha in _comparison_cache:
        return _comparison_cache[git_sha]
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{GITHUB_REPO}/compare/main...{git_sha}",
                headers={"Accept": "application/vnd.github+json"},
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            comparison = {"ahead_by": data.get("ahead_by"), "behind_by": data.get("behind_by")}
            _comparison_cache[git_sha] = comparison
            return comparison
    except (httpx.HTTPError, ValueError, KeyError):
        logger.warning("Impossible de comparer avec main sur GitHub", exc_info=True)
        return None


async def _fetch_latest_release() -> dict | None:
    global _release_cache, _release_cache_at, _release_cache_checked_at
    now = time.monotonic()
    if _release_cache is not None and now - _release_cache_at < _RELEASE_CACHE_TTL_SECONDS:
        return _release_cache
    _release_cache_checked_at = now_utc().isoformat()
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            headers = {"Accept": "application/vnd.github+json"}
            resp = await client.get(f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest", headers=headers)
            if resp.status_code != 200:
                return _release_cache
            data = resp.json()
            tag_name = data.get("tag_name")
            commit_sha = None
            if tag_name:
                commit_resp = await client.get(
                    f"https://api.github.com/repos/{GITHUB_REPO}/commits/{tag_name}", headers=headers
                )
                if commit_resp.status_code == 200:
                    commit_sha = commit_resp.json().get("sha")
            release = {
                "tag_name": tag_name,
                "name": data.get("name"),
                "html_url": data.get("html_url"),
                "published_at": data.get("published_at"),
                "body": data.get("body"),
                "commit_sha": commit_sha,
            }
            _release_cache = release
            _release_cache_at = now
            return release
    except (httpx.HTTPError, ValueError, KeyError):
        logger.warning("Impossible de récupérer la dernière release GitHub", exc_info=True)
        return _release_cache


def version_key(tag: str | None) -> tuple[int, ...] | None:
    """`v1.80.0` → (1, 80, 0) ; None pour une étiquette qui n'est pas une version."""
    parts = str(tag or "").lstrip("vV").split("-")[0].split(".")
    try:
        return tuple(int(part) for part in parts) if parts and parts[0] else None
    except ValueError:
        return None


def newer_releases(releases: list[dict], current: str | None) -> list[dict]:
    """Les releases publiées après `current`, de la plus récente à la plus ancienne."""
    mine = version_key(current)
    out = []
    for release in releases:
        key = version_key(release.get("tag_name"))
        if key is None or release.get("draft") or release.get("prerelease"):
            continue
        if mine is None or key > mine:
            out.append(
                {
                    "tag_name": release.get("tag_name"),
                    "name": release.get("name"),
                    "html_url": release.get("html_url"),
                    "published_at": release.get("published_at"),
                    "body": release.get("body"),
                }
            )
    out.sort(key=lambda release: version_key(release["tag_name"]) or (), reverse=True)
    return out


_releases_cache: list[dict] | None = None
_releases_cache_at: float = 0.0


async def _fetch_releases() -> list[dict]:
    """Les 20 dernières releases GitHub, gardées aussi longtemps que la dernière release."""
    global _releases_cache, _releases_cache_at
    now = time.monotonic()
    if _releases_cache is not None and now - _releases_cache_at < _RELEASE_CACHE_TTL_SECONDS:
        return _releases_cache
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{GITHUB_REPO}/releases",
                params={"per_page": 20},
                headers={"Accept": "application/vnd.github+json"},
            )
            if resp.status_code != 200:
                return _releases_cache or []
            data = resp.json()
            _releases_cache = data if isinstance(data, list) else []
            _releases_cache_at = now
            return _releases_cache
    except (httpx.HTTPError, ValueError):
        logger.warning("Impossible de lister les releases GitHub", exc_info=True)
        return _releases_cache or []


def forget_release_cache() -> None:
    """« Vérifier maintenant » : la prochaine lecture repart chez GitHub."""
    global _release_cache_at, _releases_cache_at
    _release_cache_at = 0.0
    _releases_cache_at = 0.0


@router.get("/version")
async def get_version_info(refresh: bool = False):
    if refresh:
        forget_release_cache()
    local = _read_local_version()
    branch = local.get("branch", "unknown")
    latest_release = await _fetch_latest_release()
    releases_since = newer_releases(await _fetch_releases(), local.get("version"))

    is_latest = bool(latest_release) and local.get("version") == latest_release.get("tag_name")
    commit_matches_release = None
    if is_latest and latest_release and latest_release.get("commit_sha"):
        commit_matches_release = local.get("git_sha") == latest_release["commit_sha"]

    main_comparison = None
    git_sha = local.get("git_sha")
    if branch not in ("main", "unknown") and git_sha and git_sha != "unknown":
        main_comparison = await _fetch_main_comparison(git_sha)

    return {
        "version": local.get("version"),
        "git_sha": git_sha,
        "build_date": local.get("build_date"),
        "branch": branch,
        "repo_url": GITHUB_REPO_URL,
        "docker_repositories": DOCKER_REPOSITORIES,
        "latest_release": latest_release,
        "is_latest": is_latest,
        "commit_matches_release": commit_matches_release,
        "main_comparison": main_comparison,
        "release_checked_at": _release_cache_checked_at,
        "releases_since": releases_since,
    }
