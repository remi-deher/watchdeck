"""Lettre « Nouveautes de la semaine » : apercu, envoi de test et envoi immediat."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..database import get_db_async
from ..dependencies import require_admin
from ..models import Settings
from ..services import newsletter
from ..utils import now_utc_naive

router = APIRouter(prefix="/api", tags=["newsletter"], dependencies=[Depends(require_admin)])


class NewsletterTestBody(BaseModel):
    email: Optional[str] = None  # None = adresse email de l'administrateur


@router.get("/newsletter/preview", response_class=HTMLResponse)
async def preview_newsletter(db: AsyncSession = Depends(get_db_async)):
    settings = (await db.execute(select(Settings))).scalars().first()
    since = newsletter.window_start(settings, now_utc_naive())
    entries = await newsletter.collect_entries(db, settings, since)
    base_url = ((settings.public_base_url if settings else None) or "").rstrip("/")
    return HTMLResponse(newsletter.render_html(entries, since, base_url))


@router.post("/newsletter/test")
async def send_test_newsletter(body: NewsletterTestBody | None = None, db: AsyncSession = Depends(get_db_async)):
    settings = (await db.execute(select(Settings))).scalars().first()
    address = (body.email if body else None) or (settings.admin_notification_email if settings else None)
    address = (address or "").split(",")[0].strip()
    if not address or "@" not in address:
        raise HTTPException(400, "Aucune adresse : renseignez l'email administrateur dans Notifications > Canaux.")
    result = await newsletter.send_newsletter(only_to=address)
    if result.get("status") == "email_not_configured":
        raise HTTPException(400, "L'envoi d'emails n'est pas configuré.")
    return {**result, "recipient": address}


@router.post("/newsletter/send")
async def send_newsletter_now():
    """Envoie la lettre tout de suite, a tous les abonnes, et repart de cette date."""
    return await newsletter.send_newsletter(force=True)
