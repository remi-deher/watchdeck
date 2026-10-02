"""Lecture normalisee des files Sonarr/Radarr."""

from types import SimpleNamespace

from app.services import arr_queue_service


def _instance(arr_type: str = "radarr"):
    return SimpleNamespace(arr_type=arr_type, url="http://arr", api_key="cle")


async def test_fetch_queue_by_entity_groups_lines_by_media(monkeypatch):
    # Une serie a plusieurs episodes dans la file : toutes ses lignes doivent rester
    # accessibles, avec leur etat, pour distinguer un telechargement d'un import bloque.
    lignes = [
        {"arr_media_id": 7, "trackedDownloadState": "downloading"},
        {"arr_media_id": "7", "trackedDownloadState": "importPending"},
        {"arr_media_id": 12, "trackedDownloadState": "importPending"},
    ]

    async def fausse_file(instance):
        return lignes

    monkeypatch.setattr(arr_queue_service, "fetch_instance_queue", fausse_file)

    groupes = await arr_queue_service.fetch_queue_by_entity(_instance())

    assert groupes == {7: lignes[:2], 12: [lignes[2]]}


async def test_fetch_queue_by_entity_ignores_lines_without_media(monkeypatch):
    # Une release non rattachee (import manuel en attente d'association) n'a pas de
    # film ni de serie : elle ne doit pas faire planter le regroupement.
    async def fausse_file(instance):
        return [{"arr_media_id": None}, {"title": "release orpheline"}, {"arr_media_id": 3}]

    monkeypatch.setattr(arr_queue_service, "fetch_instance_queue", fausse_file)

    assert await arr_queue_service.fetch_queue_by_entity(_instance()) == {3: [{"arr_media_id": 3}]}


async def test_fetch_instance_queue_ignores_unknown_arr_types():
    assert await arr_queue_service.fetch_instance_queue(_instance("lidarr")) == []
