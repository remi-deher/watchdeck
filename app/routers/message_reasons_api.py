"""Motifs réutilisables pour les annulations et les corrections."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db_async
from ..dependencies import require_moderator
from ..models import MessageReason
from ..utils import async_get_or_404

router = APIRouter(prefix="/api/message-reasons", tags=["message-reasons"], dependencies=[Depends(require_moderator)])

#: Les deux seuls contextes où un motif a du sens aujourd'hui. Un motif d'annulation
#: n'a rien à faire dans une correction, et réciproquement.
REASON_EVENTS = ("cancelled", "correction")

#: Motifs livrés à la première ouverture. Ils ne sont pas figés : ce sont des points de
#: départ, modifiables et supprimables comme les autres.
DEFAULT_REASONS: list[dict] = [
    {
        "event": "cancelled",
        "label": "Absent du catalogue de téléchargement",
        "message": (
            "Ce média n'existe pas dans le catalogue sur lequel s'appuie le serveur : il ne peut donc pas être "
            "téléchargé. La fiche que vous voyez dans Plex vient de son catalogue à lui, plus large que le nôtre — "
            "certaines entrées n'ont pas d'équivalent récupérable. "
            "Pensez à retirer ce média de votre liste d'envies Plex : sans cela, il continuera d'y apparaître."
        ),
    },
    {
        "event": "cancelled",
        "label": "Déjà demandé",
        "message": (
            "Ce média fait déjà l'objet d'une demande en cours : celle-ci a été annulée pour éviter un doublon. "
            "Vous serez prévenu dès qu'il sera disponible."
        ),
    },
    {
        "event": "cancelled",
        "label": "Déjà disponible",
        "message": (
            "Ce média est déjà présent sur le serveur. Si vous ne le trouvez pas, il est peut-être rangé dans une "
            "autre bibliothèque, ou sous un autre titre — dites-le nous et nous vous aiderons à le retrouver."
        ),
    },
    {
        "event": "cancelled",
        "label": "Hors périmètre du serveur",
        "message": (
            "Ce média ne fait pas partie de ce que ce serveur héberge. La demande a donc été annulée, sans préjuger "
            "de son intérêt : c'est un choix de périmètre, pas un jugement sur le contenu."
        ),
    },
    {
        "event": "cancelled",
        "label": "Pas encore sorti",
        "message": (
            "Ce média n'est pas encore disponible au téléchargement : sa sortie n'a pas eu lieu, ou aucune version "
            "exploitable ne circule à ce jour. Vous pouvez le redemander une fois sorti."
        ),
    },
    {
        "event": "correction",
        "label": "Remplacé par une meilleure version",
        "message": (
            "Le fichier a été remplacé par une version de meilleure qualité. Si une lecture était en cours, "
            "relancez-la pour profiter de la nouvelle copie."
        ),
    },
    {
        "event": "correction",
        "label": "Piste audio française ajoutée",
        "message": "Une piste audio française a été ajoutée à ce média. Sélectionnez-la dans le lecteur Plex.",
    },
    {
        "event": "correction",
        "label": "Sous-titres corrigés",
        "message": (
            "Les sous-titres de ce média ont été corrigés ou ajoutés. Si vous ne les voyez pas, actualisez la fiche "
            "dans Plex avant de relancer la lecture."
        ),
    },
]


class ReasonBody(BaseModel):
    event: str
    label: str
    message: str
    position: Optional[int] = None
    enabled: Optional[bool] = None


class ReasonPatch(BaseModel):
    label: Optional[str] = None
    message: Optional[str] = None
    position: Optional[int] = None
    enabled: Optional[bool] = None


def _serialize(reason: MessageReason) -> dict:
    return {
        "id": reason.id,
        "event": reason.event,
        "label": reason.label,
        "message": reason.message,
        "position": reason.position,
        "enabled": reason.enabled,
    }


async def ensure_defaults(db: AsyncSession) -> None:
    """Sème les motifs par défaut, une seule fois, si la table est vide."""
    if not DEFAULT_REASONS:
        return
    existing = (await db.execute(select(MessageReason.id).limit(1))).scalars().first()
    if existing is not None:
        return
    for position, entry in enumerate(DEFAULT_REASONS):
        db.add(MessageReason(position=position, **entry))
    await db.commit()


@router.get("")
async def list_reasons(event: Optional[str] = None, db: AsyncSession = Depends(get_db_async)):
    await ensure_defaults(db)
    query = select(MessageReason).order_by(MessageReason.position, MessageReason.label)
    if event:
        query = query.filter(MessageReason.event == event)
    rows = (await db.execute(query)).scalars().all()
    return {"items": [_serialize(row) for row in rows], "events": list(REASON_EVENTS)}


@router.post("")
async def create_reason(body: ReasonBody, db: AsyncSession = Depends(get_db_async)):
    if body.event not in REASON_EVENTS:
        raise HTTPException(400, f"Contexte inconnu : {body.event}")
    if not body.label.strip() or not body.message.strip():
        raise HTTPException(400, "Un motif porte un libellé et un message.")
    reason = MessageReason(
        event=body.event,
        label=body.label.strip(),
        message=body.message.strip(),
        position=body.position or 0,
        enabled=True if body.enabled is None else body.enabled,
    )
    db.add(reason)
    await db.commit()
    return _serialize(reason)


@router.patch("/{reason_id}")
async def update_reason(reason_id: int, body: ReasonPatch, db: AsyncSession = Depends(get_db_async)):
    reason = await async_get_or_404(db, MessageReason, reason_id, "Motif introuvable")
    for field in ("label", "message", "position", "enabled"):
        value = getattr(body, field)
        if value is None:
            continue
        if field in ("label", "message"):
            value = str(value).strip()
            if not value:
                raise HTTPException(400, "Un motif porte un libellé et un message.")
        setattr(reason, field, value)
    await db.commit()
    return _serialize(reason)


@router.delete("/{reason_id}")
async def delete_reason(reason_id: int, db: AsyncSession = Depends(get_db_async)):
    reason = await async_get_or_404(db, MessageReason, reason_id, "Motif introuvable")
    await db.delete(reason)
    await db.commit()
    return {"status": "deleted"}
