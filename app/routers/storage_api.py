"""Admin-only storage planning and durable commands, never filesystem operations."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, text

from ..database import get_db_async
from ..dependencies import require_admin
from ..models import ArrInstance, StorageLocation, StorageTransfer, StorageTransferItem
from ..storage import service
from ..storage.local_mounts import media_path
from ..storage.planning import absolute_path
from ..utils import now_utc_naive

router = APIRouter(prefix="/api/storage", tags=["storage"], dependencies=[Depends(require_admin)])


class MappingBody(BaseModel):
    arr_instance_id: int
    arr_root: str
    plex_root: str
    plex_section_id: str = Field(pattern=r"^\d+$")
    subdirectory: str = ""


class LocationBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    mount_path: str = ""
    mappings: list[MappingBody] = Field(min_length=1)
    reserve_gb: float = Field(default=100, ge=0, le=1000000)
    enabled: bool = True


class PreviewBody(BaseModel):
    source_id: int = 0
    destination_id: int = 0
    transfer_mode: Literal["arr", "rsync_ssh", "rsync_local"] = "arr"
    access_id: int = 0
    transfer_methods: list[Literal["arr", "rsync_ssh", "rsync_local"]] = Field(default_factory=list, max_length=3)
    access_ids: dict[str, int] = Field(default_factory=dict)
    root_access_ids: dict[str, int] = Field(default_factory=dict)
    preferred_methods: list[Literal["arr", "rsync_ssh", "rsync_local"]] = Field(default_factory=list, max_length=3)
    verification: Literal["standard", "renforce"] = "standard"
    arr_instance_id: int = 0
    source_root: str = ""
    source_roots: list[str] = Field(default_factory=list, max_length=50)
    name: str = Field(default="", max_length=100)
    destination_root: str = ""
    mode: Literal["selection", "release_space", "minimum_free"] = "release_space"
    goal_gb: float = Field(default=500, gt=0, le=1000000)
    root_goals: dict[str, float] = Field(default_factory=dict)
    media_type: Literal["all", "movie", "series"] = "all"
    max_titles: int = Field(default=20, ge=1, le=250)
    selection: list[str] | None = None
    auto_resume: bool = True
    start_immediately: bool = True
    task_id: int = 0


@router.get("/locations")
async def locations(db=Depends(get_db_async)):
    return [
        service.location_json(s)
        for s in (await db.execute(select(StorageLocation).order_by(StorageLocation.id))).scalars()
    ]


@router.get("/roots")
async def roots(db=Depends(get_db_async)):
    results = []
    for instance in (
        await db.execute(select(ArrInstance).where(ArrInstance.enabled, ArrInstance.arr_type.in_(["radarr", "sonarr"])))
    ).scalars():
        try:
            results.append(await service.discover_instance_roots(db, instance))
        except Exception:
            results.append(
                dict(
                    arr_instance_id=instance.id,
                    name=instance.name,
                    arr_roots=[],
                    plex_roots=[],
                    error="Connexion Arr ou Plex indisponible : chemins non vérifiés.",
                )
            )
    return results


async def save_location(db, body, location=None):
    try:
        mount = absolute_path(body.mount_path) if body.mount_path else ""
        if mount:
            mount = media_path(mount)
        seen = set()
        for mapping in body.mappings:
            mapping.arr_root = absolute_path(mapping.arr_root)
            mapping.plex_root = absolute_path(mapping.plex_root)
            if (
                mapping.subdirectory.startswith("/")
                or ".." in mapping.subdirectory.split("/")
                or "\\" in mapping.subdirectory
            ):
                raise ValueError("Sous-dossier du montage invalide.")
            mapping.subdirectory = mapping.subdirectory.strip("/")
            if mapping.arr_instance_id in seen:
                raise ValueError("Une seule correspondance par instance et stockage.")
            seen.add(mapping.arr_instance_id)
            instance = await db.get(ArrInstance, mapping.arr_instance_id)
            if not instance or instance.arr_type not in ("radarr", "sonarr"):
                raise ValueError("Instance Sonarr/Radarr inconnue.")
            try:
                discovered = await service.discover_instance_roots(db, instance)
            except Exception as exc:
                raise ValueError("Impossible de vérifier les dossiers racine Arr/Plex.") from exc
            if mapping.arr_root not in discovered["arr_roots"]:
                raise ValueError("Le chemin Arr doit être un dossier racine déclaré dans cette instance.")
            if not any(
                p["path"] == mapping.plex_root and p["section_id"] == mapping.plex_section_id
                for p in discovered["plex_roots"]
            ):
                raise ValueError(
                    "Le chemin Plex doit appartenir à la bibliothèque du même type sur le serveur associé."
                )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    location = location or StorageLocation()
    location.name = body.name.strip()
    location.mount_path = mount
    location.mappings = [m.model_dump() for m in body.mappings]
    location.reserve_bytes = int(body.reserve_gb * 1e9)
    location.enabled = body.enabled
    location.health = "not_checked"
    location.checked_at = None
    location.free_bytes = None
    db.add(location)
    await db.commit()
    await db.refresh(location)
    return service.location_json(location)


@router.post("/locations")
async def create_location(body: LocationBody, db=Depends(get_db_async)):
    return await save_location(db, body)


@router.put("/locations/{location_id}")
async def update_location(location_id: int, body: LocationBody, db=Depends(get_db_async)):
    location = await db.get(StorageLocation, location_id)
    if not location:
        raise HTTPException(404, "Stockage inconnu.")
    active = (
        await db.execute(
            select(StorageTransfer.id).where(
                (StorageTransfer.source_id == location_id) | (StorageTransfer.destination_id == location_id),
                StorageTransfer.status.notin_(["completed", "cancelled"]),
            )
        )
    ).first()
    if active:
        raise HTTPException(409, "Ce stockage appartient à une tâche non terminée.")
    return await save_location(db, body, location)


@router.post("/preview/start", status_code=202)
async def start_preview(body: PreviewBody):
    from ..storage import preview_jobs

    try:
        return await preview_jobs.start(body)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/preview/{key}")
async def preview_status(key: str):
    from ..storage import preview_jobs

    if len(key) != 32 or any(char not in "0123456789abcdef" for char in key):
        raise HTTPException(404, "Aperçu inconnu.")
    try:
        return await preview_jobs.status(key)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/preview")
async def preview(body: PreviewBody, db=Depends(get_db_async)):
    await db.execute(text("SELECT pg_advisory_xact_lock(190041, 2)"))
    if body.task_id:
        await draft_task(db, body.task_id)
    try:
        result = await service.preview(db, body)
        await db.commit()
        return result
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/transfers")
async def transfers(db=Depends(get_db_async)):
    jobs = (await db.execute(select(StorageTransfer).order_by(StorageTransfer.id.desc()).limit(50))).scalars()
    return [await service.transfer_json(db, j) for j in jobs]


@router.post("/transfers")
async def create_transfer(body: PreviewBody, db=Depends(get_db_async)):
    if body.task_id:
        raise HTTPException(422, "Utiliser la modification de la tâche existante.")
    if not body.selection:
        raise HTTPException(422, "Valider une sélection explicite depuis l’aperçu.")
    # Serialize creation with all other previews->jobs. Never trust client paths/sizes.
    await db.execute(text("SELECT pg_advisory_xact_lock(190041, 2)"))
    try:
        plan = await service.preview(db, body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if set(body.selection) != set(i["key"] for i in plan["items"]):
        raise HTTPException(409, "La sélection a changé ou ne tient plus sur la destination : recalculer l’aperçu.")
    body.source_id = plan["source"]["id"]
    body.destination_id = plan["destination"]["id"]
    job = StorageTransfer(
        source_id=body.source_id,
        destination_id=body.destination_id,
        params=body.model_dump(exclude={"selection", "task_id", "start_immediately"}),
        auto_resume=body.auto_resume,
        status="queued" if body.start_immediately else "draft",
        desired_state="run" if body.start_immediately else "pause",
    )
    db.add(job)
    await db.flush()
    for item in plan["items"]:
        db.add(
            StorageTransferItem(
                transfer_id=job.id,
                arr_instance_id=item["arr_instance_id"],
                arr_id=item["arr_id"],
                title=item["title"],
                media_type=item["media_type"],
                size_bytes=item["size_bytes"],
                snapshot=item["snapshot"],
            )
        )
    await db.commit()
    return await service.transfer_json(db, job)


async def draft_task(db, transfer_id):
    job = (
        await db.execute(select(StorageTransfer).where(StorageTransfer.id == transfer_id).with_for_update())
    ).scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Tâche inconnue.")
    if job.status != "draft":
        raise HTTPException(409, "Seule une tâche non lancée peut être modifiée.")
    return job


@router.put("/transfers/{transfer_id}")
async def update_transfer(transfer_id: int, body: PreviewBody, db=Depends(get_db_async)):
    await db.execute(text("SELECT pg_advisory_xact_lock(190041, 2)"))
    job = await draft_task(db, transfer_id)
    body.task_id = transfer_id
    if not body.selection:
        raise HTTPException(422, "Choisir des titres dans l’aperçu.")
    try:
        plan = await service.preview(db, body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if set(body.selection) != {item["key"] for item in plan["items"]}:
        raise HTTPException(409, "La sélection a changé : recalculer l’aperçu.")
    await db.execute(delete(StorageTransferItem).where(StorageTransferItem.transfer_id == transfer_id))
    job.source_id = plan["source"]["id"]
    job.destination_id = plan["destination"]["id"]
    job.params = body.model_dump(exclude={"selection", "task_id", "start_immediately"})
    job.auto_resume = body.auto_resume
    job.status = "queued" if body.start_immediately else "draft"
    job.desired_state = "run" if body.start_immediately else "pause"
    job.updated_at = now_utc_naive()
    for item in plan["items"]:
        db.add(
            StorageTransferItem(
                transfer_id=job.id,
                arr_instance_id=item["arr_instance_id"],
                arr_id=item["arr_id"],
                title=item["title"],
                media_type=item["media_type"],
                size_bytes=item["size_bytes"],
                snapshot=item["snapshot"],
            )
        )
    await db.commit()
    return await service.transfer_json(db, job)


@router.delete("/transfers/{transfer_id}")
async def delete_draft(transfer_id: int, db=Depends(get_db_async)):
    await db.execute(text("SELECT pg_advisory_xact_lock(190041, 2)"))
    job = await draft_task(db, transfer_id)
    await db.execute(delete(StorageTransferItem).where(StorageTransferItem.transfer_id == job.id))
    await db.delete(job)
    await db.commit()
    return {"deleted": transfer_id}


class CommandBody(BaseModel):
    action: Literal["pause", "resume", "stop", "retry", "cancel"]


@router.post("/transfers/{transfer_id}/command")
async def command(transfer_id: int, body: CommandBody, db=Depends(get_db_async)):
    job = await db.get(StorageTransfer, transfer_id)
    if not job:
        raise HTTPException(404, "Tâche inconnue.")
    if body.action == "cancel" and job.status not in ("completed", "cancelled"):
        job.desired_state = "cancel"
        job.status = "cancelling"
        job.auto_resume = False
        job.updated_at = now_utc_naive()
        await db.commit()
        return await service.transfer_json(db, job)
    if job.status in ("cancelling", "cancel_blocked", "cancelled"):
        raise HTTPException(409, "Cette tâche est annulée ou en cours d’annulation.")
    if job.status == "draft":
        raise HTTPException(409, "Recalculer l’aperçu avant de lancer cette tâche.")
    if job.status == "completed":
        raise HTTPException(409, "Cette tâche est terminée.")
    job.desired_state = "run" if body.action in ("resume", "retry") else body.action
    if job.desired_state == "run" and job.status != "running":
        job.status = "queued"
    job.updated_at = now_utc_naive()
    await db.commit()
    return await service.transfer_json(db, job)


@router.post("/locations/{location_id}/mappings/{mapping_index}/check")
async def check_mapping(location_id: int, mapping_index: int, db=Depends(get_db_async)):
    location = await db.get(StorageLocation, location_id)
    if not location:
        raise HTTPException(404, "Stockage inconnu.")
    if mapping_index < 0 or mapping_index >= len(location.mappings):
        raise HTTPException(404, "Correspondance inconnue.")
    try:
        return await service.check_mapping(db, location, mapping_index)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, "Comparaison indisponible : vérifier les connexions Arr/Plex.") from exc


@router.post("/roots/check")
async def check_draft_mapping(body: MappingBody, db=Depends(get_db_async)):
    from types import SimpleNamespace

    try:
        body.arr_root = absolute_path(body.arr_root)
        body.plex_root = absolute_path(body.plex_root)
        return await service.check_mapping(db, SimpleNamespace(mappings=[body.model_dump()]), 0)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, "Comparaison indisponible : vérifier les connexions Arr/Plex.") from exc


@router.post("/roots/resolve")
async def resolve_root(body: MappingBody, db=Depends(get_db_async)):
    try:
        return await service.resolve_mapping(db, body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, "Détection indisponible : vérifier le moteur et les connexions Arr/Plex.") from exc
