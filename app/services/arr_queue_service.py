"""Lecture normalisee unique des files Sonarr/Radarr."""

from ..models import ArrInstance
from . import radarr, sonarr


async def fetch_instance_queue(instance: ArrInstance) -> list[dict]:
    if instance.arr_type == "radarr":
        return await radarr.get_queue(instance.url, instance.api_key)
    if instance.arr_type == "sonarr":
        return await sonarr.get_queue(instance.url, instance.api_key)
    return []


async def fetch_queue_entity_ids(instance: ArrInstance) -> set[int]:
    records = await fetch_instance_queue(instance)
    return {int(record["arr_media_id"]) for record in records if record.get("arr_media_id") is not None}


async def fetch_queue_by_entity(instance: ArrInstance) -> dict[int, list[dict]]:
    """Retourne les lignes de file groupees par film/serie *arr.

    Un simple ensemble d'identifiants ne suffit pas au suivi du parcours : une ligne
    reste dans la file pendant un import manuel bloque, alors que son telechargement
    est deja termine. Les appelants qui affichent l'etat doivent donc conserver la
    progression et ``trackedDownloadState`` normalises par les clients *arr.
    """
    grouped: dict[int, list[dict]] = {}
    for record in await fetch_instance_queue(instance):
        entity_id = record.get("arr_media_id")
        if entity_id is None:
            continue
        grouped.setdefault(int(entity_id), []).append(record)
    return grouped
