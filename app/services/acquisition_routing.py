"""Règles communes de priorité entre *Arr et téléchargement direct."""

from sqlalchemy.future import select

from ..models import ArrInstance, MediaRequest, PlexUser


def arr_type_for_media(media_type: str) -> str:
    return "sonarr" if media_type == "show" else "radarr"


async def find_active_media_arr(db, media_type: str, user: PlexUser | None = None) -> ArrInstance | None:
    """Retourne toujours un *Arr compatible avant d'autoriser un client direct.

    Priorité : affectation utilisateur valide, instance par défaut, puis première
    instance active compatible. Une instance active mais non marquée par défaut ne
    doit jamais être contournée au profit de Prowlarr/qBittorrent.
    """
    expected_type = arr_type_for_media(media_type)
    assigned_id = None
    if user:
        assigned_id = user.sonarr_instance_id if expected_type == "sonarr" else user.radarr_instance_id
    if assigned_id:
        assigned = (
            (
                await db.execute(
                    select(ArrInstance).filter(
                        ArrInstance.id == assigned_id,
                        ArrInstance.arr_type == expected_type,
                        ArrInstance.enabled,
                    )
                )
            )
            .scalars()
            .first()
        )
        if assigned:
            return assigned

    instances = (
        (
            await db.execute(
                select(ArrInstance)
                .filter(ArrInstance.arr_type == expected_type, ArrInstance.enabled)
                .order_by(ArrInstance.is_default.desc(), ArrInstance.id.asc())
            )
        )
        .scalars()
        .all()
    )
    return instances[0] if instances else None


async def active_arr_for_request(db, request_id: int | None) -> ArrInstance | None:
    if not request_id:
        return None
    request = (await db.execute(select(MediaRequest).filter(MediaRequest.id == request_id))).scalars().first()
    if not request:
        return None
    return await find_active_media_arr(db, request.media_type)
