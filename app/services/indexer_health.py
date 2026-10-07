"""Surveillance des indexeurs Prowlarr : alerte quand un indexeur tombe ou revient.

Prowlarr met un indexeur en pause (`disabledTill`) apres des echecs repetes ; sans
alerte, on ne le decouvre qu'en constatant que les recherches ne trouvent plus rien.
La tache planifiee `indexer-health` compare l'etat courant au precedent (garde en
cache) et previent l'administrateur par email, et sur Discord si ce canal est actif,
seulement lors d'un changement : un indexeur qui reste en panne n'alerte qu'une fois.
"""

import logging
from typing import Any

from sqlalchemy.future import select

from ..cache import cache
from ..database import AsyncSessionLocal
from ..models import ArrInstance, Settings
from ..utils import parse_email_list
from . import prowlarr

logger = logging.getLogger(__name__)

STATE_KEY = "watchdeck:indexer-health:{instance_id}"
STATE_TTL = 30 * 24 * 3600


def transitions(previous: set[str], current: set[str]) -> tuple[list[str], list[str]]:
    """(indexeurs tombes, indexeurs revenus) depuis le dernier passage."""
    return sorted(current - previous), sorted(previous - current)


def alert_text(instance_name: str, down: list[str], recovered: list[str], details: dict[str, dict]) -> str:
    lines = []
    for name in down:
        row = details.get(name) or {}
        until = row.get("disabled_till")
        reason = row.get("last_failure")
        suffix = f" (en pause jusqu'à {until[:16].replace('T', ' ')} UTC)" if until else ""
        lines.append(f"• {name} ne répond plus{suffix}" + (f" — dernier échec : {reason}" if reason else ""))
    for name in recovered:
        lines.append(f"• {name} fonctionne de nouveau")
    return f"Indexeurs de {instance_name} :\n" + "\n".join(lines)


async def _notify(settings: Settings, subject: str, text: str) -> int:
    from .email_providers import has_enabled_provider
    from .email_service import _send as smtp_send
    from .notifications import _post_discord_embed

    sent = 0
    async with AsyncSessionLocal() as db:
        email_ready = bool(settings.email_enabled and settings.smtp_from and await has_enabled_provider(db))
    if email_ready:
        html = "<p>" + "<br>".join(line for line in text.splitlines()) + "</p>"
        for address in parse_email_list(settings.admin_notification_email):
            try:
                await smtp_send(settings, address, subject, html)
                sent += 1
            except Exception as exc:
                logger.error("Alerte indexeurs : echec email (%s)", exc)
    if settings.discord_enabled and settings.discord_webhook_url:
        try:
            await _post_discord_embed(
                settings.discord_webhook_url, {"title": subject, "description": text[:4000], "color": 0xE74C3C}
            )
            sent += 1
        except Exception as exc:
            logger.error("Alerte indexeurs : echec Discord (%s)", exc)
    return sent


async def check_indexers() -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        settings = (await db.execute(select(Settings))).scalars().first()
        instances = (
            (await db.execute(select(ArrInstance).filter(ArrInstance.arr_type == "prowlarr", ArrInstance.enabled)))
            .scalars()
            .all()
        )
    if settings is None or not settings.indexer_alerts_enabled or not instances:
        return {"status": "disabled"}

    summary: dict[str, Any] = {"instances": 0, "down": [], "recovered": [], "alerts": 0}
    for instance in instances:
        health = await prowlarr.get_indexer_health(instance.url, instance.api_key, days=1)
        if not health.get("connected"):
            continue  # Prowlarr injoignable : signale par la sante des services, pas ici
        summary["instances"] += 1
        failing = {row["name"]: row for row in health["indexers"] if row["state"] == "failing" and row["name"]}
        key = STATE_KEY.format(instance_id=instance.id)
        stored = await cache.get_json(key)
        previous = set((stored or {}).get("failing", []))
        await cache.set_json(key, {"failing": sorted(failing)}, STATE_TTL)
        if stored is None:
            continue  # premier passage : on note l'etat sans alerter sur l'existant
        down, recovered = transitions(previous, set(failing))
        if not down and not recovered:
            continue
        summary["down"] += down
        summary["recovered"] += recovered
        subject = f"Indexeur en panne : {', '.join(down)}" if down else f"Indexeur rétabli : {', '.join(recovered)}"
        summary["alerts"] += await _notify(settings, subject, alert_text(instance.name, down, recovered, failing))
    return summary
