"""Lettre « Nouveautes de la semaine », a la maniere de la newsletter de Tautulli.

Une fois par semaine (jour et heure reglables), Watchdeck envoie aux utilisateurs qui
l'ont demande (`PlexUser.notify_newsletter`) la liste des films et series ajoutes a Plex
depuis le dernier envoi, avec leur affiche et leur langue (VF, VOSTFR, VO). La meme liste
peut partir sur le webhook Discord global.

Sources :
- films et nouvelles series : `LibraryItem.added_at` (cache de la synchro Plex) ;
- nouveaux episodes de series deja presentes : interroges a Plex au moment de l'envoi
  (`addedAt` des episodes), car le cache local ne garde pas la date d'ajout par episode.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from html import escape
from typing import Any, Optional

import httpx
from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..database import AsyncSessionLocal
from ..models import LibraryItem, PlexUser, Settings
from ..utils import local_hour, now_utc_naive, public_image_url
from .notification_policy import PSEUDO_REQUESTERS

logger = logging.getLogger(__name__)

DEFAULT_WINDOW = timedelta(days=7)
MAX_WINDOW = timedelta(days=14)
MAX_ITEMS = 40
WEEKDAYS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")


@dataclass
class NewsletterEntry:
    title: str
    media_type: str
    year: Optional[int] = None
    language: Optional[str] = None  # "VF" | "VOSTFR" | "VO" | None
    poster_url: Optional[str] = None
    overview: Optional[str] = None
    new_series: bool = False
    episode_count: int = 0
    seasons: list[int] = field(default_factory=list)
    library_item_id: Optional[int] = None

    @property
    def detail(self) -> str:
        if self.media_type == "movie":
            return "Film"
        if self.new_series:
            return "Nouvelle série"
        seasons = ", ".join(str(s) for s in sorted(self.seasons))
        label = (
            f"{self.episode_count} nouvel épisode"
            if self.episode_count == 1
            else f"{self.episode_count} nouveaux épisodes"
        )
        return f"{label} (saison {seasons})" if seasons else label


def language_label(item: LibraryItem) -> Optional[str]:
    if item.has_vf is True:
        return "VF"
    if item.has_vf is False:
        return "VOSTFR" if item.sub_fr_status in ("ok", "not_default") else "VO"
    return None


def window_start(settings: Optional[Settings], now: datetime) -> datetime:
    """Depuis le dernier envoi (sans remonter au-dela de 14 jours), sinon 7 jours."""
    last = getattr(settings, "newsletter_last_sent_at", None) if settings else None
    if last is None:
        return now - DEFAULT_WINDOW
    return max(last, now - MAX_WINDOW)


def recent_episodes_blocking(connections: list[tuple[str, str, list[str]]], since: datetime) -> dict[str, dict]:
    """{cle de serie: {title, guid, seasons, count}} des episodes ajoutes a Plex depuis `since`.

    La cle est le GUID Plex de la serie (`grandparentGuid`), a defaut son titre."""
    from .plex_finder import connect

    shows: dict[str, dict] = {}
    for url, token, library_names in connections:
        try:
            plex = connect(url, token)
            sections = [s for s in plex.library.sections() if getattr(s, "type", "") == "show"]
        except Exception as exc:
            logger.warning("Lettre hebdomadaire : Plex injoignable (%s)", exc)
            continue
        for section in sections:
            if library_names and section.title not in library_names:
                continue
            try:
                episodes = section.searchEpisodes(filters={"addedAt>>": since})
            except Exception as exc:
                logger.warning("Lettre hebdomadaire : episodes recents illisibles (%s) : %s", section.title, exc)
                continue
            for episode in episodes:
                key = getattr(episode, "grandparentGuid", None) or getattr(episode, "grandparentTitle", None)
                if not key:
                    continue
                entry = shows.setdefault(
                    key,
                    {
                        "title": getattr(episode, "grandparentTitle", None),
                        "guid": getattr(episode, "grandparentGuid", None),
                        "seasons": set(),
                        "count": 0,
                    },
                )
                entry["count"] += 1
                season = getattr(episode, "parentIndex", None)
                if season is not None:
                    entry["seasons"].add(int(season))
    return shows


async def _poster(db: AsyncSession, item: LibraryItem) -> Optional[str]:
    poster = public_image_url(item.poster_url)
    if poster or not item.tmdb_id:
        return poster
    from .tmdb import poster_url_for

    try:
        return await poster_url_for(db, item.media_type, item.tmdb_id)
    except Exception:
        return None


async def collect_entries(db: AsyncSession, settings: Optional[Settings], since: datetime) -> list[NewsletterEntry]:
    """Films et series a annoncer, les plus recents d'abord."""
    from . import plex_servers

    added = (
        (
            await db.execute(
                select(LibraryItem)
                .filter(LibraryItem.media_type.in_(("movie", "show")), LibraryItem.added_at >= since)
                .order_by(LibraryItem.added_at.desc())
                .limit(MAX_ITEMS)
            )
        )
        .scalars()
        .all()
    )
    entries: list[NewsletterEntry] = []
    seen_ids: set[int] = set()
    for item in added:
        seen_ids.add(item.id)
        entries.append(
            NewsletterEntry(
                title=item.title,
                media_type=item.media_type,
                year=item.year,
                language=language_label(item),
                poster_url=await _poster(db, item),
                overview=item.overview,
                new_series=item.media_type == "show",
                library_item_id=item.id,
            )
        )

    connections = [
        (conn.url, conn.token, [lib["name"] if isinstance(lib, dict) else str(lib) for lib in conn.libraries])
        for conn in await plex_servers.active_connections(db, settings)
    ]
    shows = await asyncio.to_thread(recent_episodes_blocking, connections, since) if connections else {}
    for show in shows.values():
        filters = [LibraryItem.title == show["title"]]
        if show.get("guid"):
            filters.insert(0, LibraryItem.plex_guid == show["guid"])
        item = (
            (await db.execute(select(LibraryItem).filter(LibraryItem.media_type == "show", or_(*filters)).limit(1)))
            .scalars()
            .first()
        )
        if item is not None and item.id in seen_ids:
            continue  # serie entierement nouvelle : deja annoncee comme telle
        entries.append(
            NewsletterEntry(
                title=(item.title if item else show["title"]) or "Série",
                media_type="show",
                year=item.year if item else None,
                language=language_label(item) if item else None,
                poster_url=await _poster(db, item) if item else None,
                overview=item.overview if item else None,
                episode_count=show["count"],
                seasons=sorted(show["seasons"]),
                library_item_id=item.id if item else None,
            )
        )
    return entries[:MAX_ITEMS]


def render_html(entries: list[NewsletterEntry], since: datetime, base_url: str = "") -> str:
    movies = [e for e in entries if e.media_type == "movie"]
    shows = [e for e in entries if e.media_type == "show"]

    def card(entry: NewsletterEntry) -> str:
        poster = (
            f"<img src='{escape(entry.poster_url)}' width='70' alt='' style='width:70px;height:auto;border-radius:6px;display:block'>"
            if entry.poster_url
            else "<div style='width:70px;height:105px;border-radius:6px;background:#333'></div>"
        )
        year = f" <span style='color:#aaa;font-size:12px'>({entry.year})</span>" if entry.year else ""
        badge = (
            f" <span style='background:{'#1db954' if entry.language == 'VF' else '#e5a00d' if entry.language == 'VOSTFR' else '#666'};"
            f"color:#fff;font-size:11px;padding:1px 6px;border-radius:4px'>{entry.language}</span>"
            if entry.language
            else ""
        )
        title = escape(entry.title)
        if base_url and entry.library_item_id:
            title = f"<a href='{escape(base_url)}/library/media/library/{entry.library_item_id}' style='color:#fff;text-decoration:none'>{title}</a>"
        overview = escape((entry.overview or "")[:220]) + ("…" if entry.overview and len(entry.overview) > 220 else "")
        return (
            "<tr><td style='padding:10px 0;border-bottom:1px solid #333'><table cellpadding='0' cellspacing='0'><tr>"
            f"<td valign='top' style='padding-right:14px'>{poster}</td>"
            f"<td valign='top'><div style='color:#fff;font-size:15px;font-weight:bold'>{title}{year}{badge}</div>"
            f"<div style='color:#e5a00d;font-size:12px;margin:2px 0 6px'>{escape(entry.detail)}</div>"
            f"<div style='color:#bbb;font-size:13px;line-height:1.4'>{overview}</div></td>"
            "</tr></table></td></tr>"
        )

    def block(label: str, rows: list[NewsletterEntry]) -> str:
        if not rows:
            return ""
        return (
            f"<tr><td style='padding:18px 24px 0'><h2 style='color:#fff;font-size:17px;margin:0'>{label}</h2></td></tr>"
            f"<tr><td style='padding:0 24px'><table width='100%' cellpadding='0' cellspacing='0'>{''.join(card(e) for e in rows)}</table></td></tr>"
        )

    period = f"depuis le {since.strftime('%d/%m/%Y')}"
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#141414;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:auto;background:#1f1f1f">
  <tr><td style="background:#e5a00d;padding:20px 24px">
    <h1 style="color:#fff;margin:0;font-size:20px">Nouveautés de la semaine</h1>
    <p style="color:#fff;opacity:.85;margin:4px 0 0;font-size:13px">{len(movies)} film(s) et {len(shows)} série(s) ajoutés {period}</p>
  </td></tr>
  {block("Films", movies)}
  {block("Séries", shows)}
  <tr><td style="background:#111;padding:12px 24px;margin-top:16px">
    <p style="color:#666;font-size:11px;margin:0">Watchdeck — vous recevez cette lettre car vous l'avez activée dans votre profil.</p>
  </td></tr>
</table>
</body></html>"""


def discord_embeds(entries: list[NewsletterEntry], since: datetime) -> list[dict]:
    """Un embed d'en-tete et la liste ; Discord accepte 4096 caracteres par description."""
    lines = []
    for entry in entries:
        language = f" · {entry.language}" if entry.language else ""
        year = f" ({entry.year})" if entry.year else ""
        lines.append(f"**{entry.title}**{year} — {entry.detail}{language}")
    description = "\n".join(lines)
    if len(description) > 4000:
        description = description[:3990].rsplit("\n", 1)[0] + "\n…"
    embed: dict[str, Any] = {
        "title": "Nouveautés de la semaine",
        "description": description,
        "color": 0xE5A00D,
        "footer": {"text": f"Ajouts depuis le {since.strftime('%d/%m/%Y')}"},
    }
    thumbnail = next((e.poster_url for e in entries if e.poster_url), None)
    if thumbnail:
        embed["thumbnail"] = {"url": thumbnail}
    return [embed]


def recipients(users: list[PlexUser]) -> list[str]:
    out = []
    for user in users:
        if (user.plex_user_id or "") in PSEUDO_REQUESTERS:
            continue
        address = (user.notification_email or user.plex_email or "").split(",")[0].strip()
        if address and address not in out:
            out.append(address)
    return out


async def send_newsletter(
    *, force: bool = False, only_to: Optional[str] = None, now: Optional[datetime] = None
) -> dict[str, Any]:
    """Construit et envoie la lettre. `only_to` : envoi de test a une seule adresse, sans
    Discord ni mise a jour de la date du dernier envoi."""
    from .email_providers import has_enabled_provider
    from .email_service import _send as smtp_send
    from .notifications import _post_discord_embed

    now = now or now_utc_naive()
    async with AsyncSessionLocal() as db:
        settings = (await db.execute(select(Settings))).scalars().first()
        if settings is None:
            return {"status": "not_configured"}
        since = window_start(settings, now)
        entries = await collect_entries(db, settings, since)
        if not entries and not only_to:
            settings.newsletter_last_sent_at = now
            await db.commit()
            return {"status": "empty", "items": 0}

        html = render_html(entries, since, (settings.public_base_url or "").rstrip("/"))
        subject = f"[Watchdeck] Nouveautés de la semaine — {len(entries)} ajout(s)"
        email_ready = bool(settings.email_enabled and settings.smtp_from and await has_enabled_provider(db))
        result: dict[str, Any] = {"status": "sent", "items": len(entries), "emails": 0, "errors": 0, "discord": False}

        if only_to:
            if not email_ready:
                return {"status": "email_not_configured", "items": len(entries)}
            await smtp_send(settings, only_to, subject, html)
            return {**result, "emails": 1, "test": True}

        if email_ready:
            users = (
                (
                    await db.execute(
                        select(PlexUser).filter(PlexUser.enabled.is_(True), PlexUser.notify_newsletter.is_(True))
                    )
                )
                .scalars()
                .all()
            )
            for address in recipients(list(users)):
                try:
                    await smtp_send(settings, address, subject, html)
                    result["emails"] += 1
                except Exception as exc:
                    logger.error("Lettre hebdomadaire : echec d'envoi (%s)", exc)
                    result["errors"] += 1

        if settings.newsletter_discord and settings.discord_enabled and settings.discord_webhook_url and entries:
            try:
                for embed in discord_embeds(entries, since):
                    await _post_discord_embed(settings.discord_webhook_url, embed)
                result["discord"] = True
            except (httpx.HTTPError, Exception) as exc:
                logger.error("Lettre hebdomadaire : echec Discord (%s)", exc)
                result["errors"] += 1

        settings.newsletter_last_sent_at = now
        await db.commit()
        return result


def is_due(
    settings: Optional[Settings], now: datetime, hour: Optional[int] = None, weekday: Optional[int] = None
) -> bool:
    """Jour et heure locaux atteints, et pas deja envoyee dans les 20 dernieres heures."""
    if not settings or not settings.newsletter_enabled:
        return False
    from datetime import timezone
    from zoneinfo import ZoneInfo

    from ..utils import APP_TIMEZONE

    if weekday is None:
        weekday = datetime.now(timezone.utc).astimezone(ZoneInfo(APP_TIMEZONE)).weekday()
    if hour is None:
        hour = local_hour()
    if weekday != settings.newsletter_weekday or hour != settings.newsletter_hour:
        return False
    last = settings.newsletter_last_sent_at
    return last is None or now - last > timedelta(hours=20)
