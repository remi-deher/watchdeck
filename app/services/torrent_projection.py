"""Filter the shared torrent collection before pagination; facets stay global."""

from collections import Counter
from urllib.parse import urlparse


def status(row):
    value = str(row.get("status") or "").lower()
    if row.get("client_error") or "error" in value or "missing" in value:
        return "error"
    if float(row.get("progress") or 0) >= 100 or any(
        v in value for v in ("uploading", "stalledup", "pausedup", "completed")
    ):
        return "seeding"
    if any(v in value for v in ("queued", "paused", "stopped", "checking")):
        return "paused"
    return "downloading"


def matches(filters, value, substring=False):
    values = filters if isinstance(filters, list) else [filters] if filters else []
    included = [v for v in values if not v.startswith("!")]
    excluded = [v[1:] for v in values if v.startswith("!")]
    text = str(value or "").lower()

    def match(v):
        return v.lower() in text if substring else v.lower() == text

    return not any(map(match, excluded)) and (not included or any(map(match, included)))


def project(
    rows,
    *,
    offset=0,
    limit=100,
    query="",
    client_id=None,
    category=None,
    state=None,
    tracker=None,
    ownership=None,
    sort="title",
    direction="asc",
):
    aliases = dict(category="cat", tags="tag", status="is", host="tracker")
    operators, terms = {}, []
    for part in query.strip().split():
        key, sep, value = part.partition(":")
        key = aliases.get(key.lower(), key.lower())
        if sep and key in ("cat", "tag", "is", "tracker"):
            operators[key] = value.split(":")[0].lower()
        else:
            terms.append(part.lower())
    needle = " ".join(terms)
    scoped = [r for r in rows if client_id is None or str(r.get("client_id")) == str(client_id)]
    errors = [r for r in scoped if r.get("client_error")]
    # A stale torrent can carry an upstream error but remains visible in the
    # legacy contract. Only pure connection-error placeholder rows are omitted.
    torrents = [r for r in scoped if r.get("hash")]

    def tracker_host(r):
        value = str(r.get("trackers") or r.get("tracker") or "").split(",")[0].strip()
        return (
            (urlparse(value if value.startswith(("http", "udp")) else "http://" + value).hostname or value)
            if value
            else ""
        )

    def facets(key):
        counts = Counter(key(r) for r in rows if r.get("hash"))
        return [dict(value=k, label=k, count=n) for k, n in counts.most_common() if k]

    all_facets = dict(
        status=facets(status),
        category=facets(lambda r: r.get("category") or "Non classé"),
        client=facets(lambda r: r.get("client_name") or "Client"),
        tracker=facets(tracker_host),
    )
    status_labels = {
        "downloading": "En téléchargement",
        "seeding": "En seed / Partage",
        "paused": "En pause / Attente",
        "error": "Erreurs",
    }
    for facet in all_facets["status"]:
        facet["label"] = status_labels[facet["value"]]
    selected = [
        r
        for r in torrents
        if (not needle or needle in f"{r.get('title') or ''} {r.get('tags') or ''}".lower())
        and matches(operators.get("cat") or category, r.get("category") or "Non classé")
        and (not operators.get("tag") or operators["tag"] in str(r.get("tags") or "").lower())
        and matches(operators.get("is") or state, status(r))
        and matches(operators.get("tracker") or tracker, r.get("trackers") or r.get("tracker") or "", True)
        and (not ownership or r.get("managed_by") == ownership)
    ]
    allowed = {
        "title",
        "progress",
        "size",
        "ratio",
        "download_speed",
        "upload_speed",
        "added_on",
        "eta",
        "completed_on",
        "status",
        "category",
        "trackers",
    }
    if sort not in allowed:
        sort = "title"
    selected.sort(key=lambda r: (int(r.get("client_id") or 0), str(r.get("hash") or "")))
    selected.sort(
        key=lambda r: (
            str(r.get(sort) or "").casefold()
            if sort in ("title", "status", "category", "trackers")
            else float(r.get(sort) or 0)
        ),
        reverse=direction == "desc",
    )
    limit, offset = min(max(limit, 1), 200), max(offset, 0)
    return dict(
        items=selected[offset : offset + limit],
        total=len(selected),
        collection_total=len(torrents),
        offset=offset,
        limit=limit,
        has_more=offset + limit < len(selected),
        facets=all_facets,
        client_errors=errors,
    )
