"""Short-lived proof cache for expensive Arr/Plex path comparisons."""

import hashlib
import json

from .discovery import redis_client

TTL = 30 * 60
PREFIX = "storage:mapping-proof:"


def proof_key(instance, discovered, mapping):
    """Tie a proof to both API endpoints and the exact path association."""
    material = {
        "arr_instance_id": instance.id,
        "arr_url": instance.url.rstrip("/"),
        "arr_type": instance.arr_type,
        "arr_key_fingerprint": hashlib.sha256(instance.api_key.encode()).hexdigest(),
        "plex_server_id": discovered["plex_server_id"],
        "plex_url": discovered["plex_url"].rstrip("/"),
        "plex_token_fingerprint": discovered["plex_token_fingerprint"],
        "arr_root": mapping["arr_root"],
        "plex_root": mapping["plex_root"],
        "plex_section_id": str(mapping["plex_section_id"]),
    }
    digest = hashlib.sha256(json.dumps(material, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return PREFIX + digest


async def get(instance, discovered, mapping):
    client = redis_client()
    try:
        value = await client.get(proof_key(instance, discovered, mapping))
        return json.loads(value) if value else None
    finally:
        await client.aclose()


async def put(instance, discovered, mapping, comparison):
    # Cache only confirmations that were safe to reuse. Mismatches must be
    # checked again because the user may have fixed the files in Plex.
    client = redis_client()
    try:
        key = proof_key(instance, discovered, mapping)
        if comparison.get("status") not in ("sample_matched", "empty"):
            await client.delete(key)
            return
        await client.set(
            key,
            json.dumps(
                {
                    "status": comparison["status"],
                    "checked_at": str(comparison.get("checked_at", "")),
                    "checked_titles": comparison.get("checked_titles", 0),
                    "matched_titles": comparison.get("matched_titles", 0),
                    "total_titles": comparison.get("total_titles", 0),
                }
            ),
            ex=TTL,
        )
    finally:
        await client.aclose()
