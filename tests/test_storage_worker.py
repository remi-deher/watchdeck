"""Exercise real file copies; simulate only Arr/Plex and the mount boundary."""

import threading
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock

import pytest

from app.models import ArrInstance
from app.storage import worker


@pytest.fixture
def transfer(tmp_path, monkeypatch):
    source = tmp_path / "source"
    destination = tmp_path / "destination"
    source.mkdir()
    destination.mkdir()
    media = source / "Film"
    media.mkdir()
    (media / "film.mkv").write_bytes(b"content" * 1000)
    instance = NS(id=1, enabled=True, arr_type="radarr", plex_server_id=1)
    dest = NS(reserve_bytes=0)

    async def get(model, id):
        return instance if model is ArrInstance else dest

    db = NS(get=get, commit=AsyncMock())
    snap = dict(
        source_mount=str(source),
        destination_mount=str(destination),
        relative="Film",
        source_arr="/data/FILMS/Film",
        destination_arr="/usb/FILMS/Film",
        source_plex="/media/FILMS/Film",
        destination_plex="/usb/MEDIA/FILMS/Film",
        destination_root="/usb/FILMS",
        plex_section_id="3",
        tmdb_id=10,
    )
    item = NS(
        id=1,
        arr_instance_id=1,
        arr_id=1,
        size_bytes=5000,
        title="Film",
        media_type="movie",
        status="pending",
        claimed=True,
        progress={},
        proofs={},
        snapshot=snap,
        reason=None,
    )
    job = NS(destination_id=2, params={"verification": "renforce"})
    media_state = {
        "path": snap["source_arr"],
        "roots": [
            {"path": "/data/FILMS", "accessible": True, "freeSpace": 1_000_000_000_000},
            {"path": "/usb/FILMS", "accessible": True, "freeSpace": 1_000_000_000_000},
        ],
    }

    async def arr(instance, method, path, body=None):
        if path == "rootfolder":
            return list(media_state["roots"])
        if path.startswith("queue"):
            return {"records": []}
        if path == "movie/1":
            return dict(media_state)
        if method == "PUT":
            media_state.update(body)
            return body
        if path == "command" and method == "POST":
            return {"id": 1}
        if path == "command/1":
            return {"status": "completed"}
        if path.startswith("moviefile"):
            return [{"relativePath": "film.mkv"}]
        raise AssertionError(path)

    async def plex(conn, path, params=None):
        if path == "/identity":
            return {"machineIdentifier": "server"}
        if path.startswith("/library/metadata/"):
            return {"Metadata": [{"Guid": [{"id": "tmdb://10"}]}]}
        return {}

    async def files(conn, section, path, kind, **kwargs):
        if path == snap["source_plex"] or media_state["path"] == snap["destination_arr"]:
            return {"film.mkv": ["123"]}
        return {}

    monkeypatch.setattr(worker, "local_media", lambda root, relative: Path(root) / relative)
    monkeypatch.setattr(worker, "connection_for", AsyncMock(return_value=NS(id=1)))
    monkeypatch.setattr(worker, "arr_request", arr)
    monkeypatch.setattr(worker, "plex_get", plex)
    monkeypatch.setattr(worker, "plex_files", files)
    monkeypatch.setattr(worker, "is_playing", AsyncMock(return_value=False))
    monkeypatch.setenv("COPY_ENGINE", "python")
    return NS(
        db=db,
        item=item,
        job=job,
        source=media,
        destination=destination / "Film",
        state=media_state,
        stop=threading.Event(),
    )


@pytest.mark.asyncio
async def test_resume_destination_lookup_allows_original_source_folder(transfer, monkeypatch):
    t = transfer
    t.destination.mkdir()
    original_lookup = worker.plex_files
    calls = []

    async def lookup(*args, **kwargs):
        calls.append((args[2], kwargs))
        return await original_lookup(*args, **kwargs)

    monkeypatch.setattr(worker, "plex_files", lookup)
    await worker.process_item(t.db, t.job, t.item, t.stop)
    destination_probe = next(kwargs for path, kwargs in calls if path == t.item.snapshot["destination_plex"])
    assert destination_probe["expected_other_root"] == t.item.snapshot["source_plex"]
    assert t.item.status == "plex_pending" and t.source.exists()
    await worker.process_item(t.db, t.job, t.item, t.stop, finalize_only=True)
    assert t.item.status == "completed"


@pytest.mark.asyncio
async def test_copy_switch_confirm_cleanup_and_restart(transfer):
    t = transfer
    await worker.process_item(t.db, t.job, t.item, t.stop)
    assert t.item.status == "plex_pending" and t.source.exists()
    await worker.process_item(t.db, t.job, t.item, t.stop, finalize_only=True)
    assert t.item.status == "completed"
    assert not t.source.exists()
    assert (t.destination / "film.mkv").read_bytes() == b"content" * 1000
    assert t.item.progress["copied_bytes"] == 7000
    assert t.item.snapshot["cleanup_intent"]
    assert t.item.progress["finished_at"]
    t.item.claimed = True  # Simulate the durable claim reacquired by a retry.
    await worker.process_item(t.db, t.job, t.item, t.stop)
    assert t.item.status == "completed"
    (t.destination / "film.mkv").write_bytes(b"changed")
    t.item.claimed = True
    with pytest.raises(ValueError, match="Destination modifiée"):
        await worker.process_item(t.db, t.job, t.item, t.stop)


@pytest.mark.asyncio
async def test_active_playback_defers_without_copy(transfer, monkeypatch):
    monkeypatch.setattr(worker, "is_playing", AsyncMock(return_value=True))
    t = transfer
    await worker.process_item(t.db, t.job, t.item, t.stop)
    assert t.item.status == "deferred" and t.source.exists() and not t.destination.exists()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "issue",
    [
        "root",
        "identity",
        "arr_path",
        "download",
        "stop",
        "foreign_destination",
        "foreign_plex",
        "missing_plex",
        "missing_source",
    ],
)
async def test_preconditions_preserve_original(transfer, monkeypatch, issue):
    t = transfer
    if issue == "root":
        t.state["roots"] = []
    elif issue == "identity":
        t.item.snapshot["plex_machine"] = "other"
    elif issue == "arr_path":
        t.state["path"] = "/unknown/Film"
    elif issue == "download":
        monkeypatch.setattr(worker, "no_arr_download", AsyncMock(side_effect=ValueError("Download active")))
    elif issue == "stop":
        t.stop.set()
    elif issue in ("foreign_destination", "foreign_plex"):
        t.destination.mkdir()
        if issue == "foreign_destination":
            (t.destination / "unknown.txt").write_text("foreign")
        else:
            monkeypatch.setattr(
                worker, "plex_files", AsyncMock(side_effect=[{"film.mkv": ["123"]}, {"film.mkv": ["999"]}])
            )
    elif issue == "missing_plex":
        monkeypatch.setattr(worker, "plex_files", AsyncMock(return_value={}))
    elif issue == "missing_source":
        (t.source / "film.mkv").unlink()
        t.source.rmdir()
    with pytest.raises((ValueError, worker.Interrompu)):
        await worker.process_item(t.db, t.job, t.item, t.stop)
    if issue != "missing_source":
        assert t.source.exists()


@pytest.mark.asyncio
async def test_plex_pending_preserves_source_until_confirmation(transfer, monkeypatch):
    t = transfer
    monkeypatch.setattr(worker, "plex_files", AsyncMock(return_value={"film.mkv": ["123"]}))
    await worker.process_item(t.db, t.job, t.item, t.stop)
    assert t.item.status == "plex_pending" and t.source.exists() and t.destination.exists()
    monkeypatch.setattr(worker, "plex_files", AsyncMock(return_value={"film.mkv": ["123"]}))
    await worker.process_item(t.db, t.job, t.item, t.stop, finalize_only=True)
    assert t.item.status == "completed" and not t.source.exists()


@pytest.mark.asyncio
async def test_rescan_failure_preserves_source(transfer, monkeypatch):
    original = worker.arr_request

    async def fail(*args, **kwargs):
        if args[2] == "command/1":
            return {"status": "failed"}
        return await original(*args, **kwargs)

    monkeypatch.setattr(worker, "arr_request", fail)
    t = transfer
    with pytest.raises(ValueError, match="Rescan"):
        await worker.process_item(t.db, t.job, t.item, t.stop)
    assert t.source.exists() and t.destination.exists()


@pytest.mark.asyncio
@pytest.mark.parametrize("destination", [{}, {"film.mkv": ["999"]}])
async def test_finalization_never_deletes_without_same_plex_identity(transfer, monkeypatch, destination):
    t = transfer
    await worker.process_item(t.db, t.job, t.item, t.stop)
    monkeypatch.setattr(worker, "plex_files", AsyncMock(return_value=destination))
    if destination:
        with pytest.raises(ValueError, match="autre fiche"):
            await worker.process_item(t.db, t.job, t.item, t.stop, finalize_only=True)
    else:
        await worker.process_item(t.db, t.job, t.item, t.stop, finalize_only=True)
    assert t.item.status == "plex_pending"
    assert t.source.exists()
    assert not t.item.snapshot.get("cleanup_intent")


@pytest.mark.asyncio
async def test_finalization_rechecks_playback_after_verification(transfer, monkeypatch):
    t = transfer
    await worker.process_item(t.db, t.job, t.item, t.stop)
    monkeypatch.setattr(worker, "is_playing", AsyncMock(side_effect=[False, False, True]))
    await worker.process_item(t.db, t.job, t.item, t.stop, finalize_only=True)
    assert t.item.status == "plex_pending" and t.source.exists()


@pytest.mark.asyncio
async def test_finalization_does_not_recopy_or_submit_another_arr_scan(transfer, monkeypatch):
    t = transfer
    await worker.process_item(t.db, t.job, t.item, t.stop)
    request = AsyncMock(side_effect=worker.arr_request)
    monkeypatch.setattr(worker, "arr_request", request)
    monkeypatch.setattr(worker, "copier_fichier", lambda *args: pytest.fail("Already copied"))
    await worker.process_item(t.db, t.job, t.item, t.stop, finalize_only=True)
    assert t.item.status == "completed"
    assert all(call.args[1] == "GET" for call in request.call_args_list)
    assert t.item.progress["plex_source_refresh_pending"]


class Context:
    def __init__(self, value):
        self.value = value

    async def __aenter__(self):
        return self.value

    async def __aexit__(self, *args):
        return False


@pytest.mark.asyncio
@pytest.mark.parametrize("outcome", ["completed", "blocked", "pause", "lease_lost"])
async def test_queue_continues_and_durable_commands(tmp_path, monkeypatch, outcome):
    import asyncio

    job = NS(id=1, status="queued", desired_state="pause" if outcome == "pause" else "run")
    items = [
        NS(id=1, status="completed", claimed=False),
        NS(id=2, status="pending", progress={}, claimed=True),
        NS(id=3, status="pending", progress={}, claimed=True),
    ]
    result = NS(scalars=lambda: NS(all=lambda: items))
    db = NS(
        get=AsyncMock(return_value=job), execute=AsyncMock(return_value=result), commit=AsyncMock(), refresh=AsyncMock()
    )
    monkeypatch.setattr(worker, "AsyncSessionLocal", lambda: Context(db))
    monkeypatch.setattr(worker, "validate_transfer_roots", AsyncMock())
    monkeypatch.setattr(worker, "refresh_storage", AsyncMock())
    monkeypatch.setattr(worker, "HEARTBEAT", tmp_path / "heartbeat")
    monkeypatch.setattr(worker, "SHUTDOWN", threading.Event())
    lease = NS(execute=AsyncMock(side_effect=RuntimeError("lease lost") if outcome == "lease_lost" else None))

    async def process(db, job, item, stop, *, preflight_validated=False):
        await asyncio.sleep(0)
        if stop.is_set():
            raise worker.Interrompu()
        if outcome == "blocked" and item.id == 2:
            raise ValueError("blocked title")
        item.status = "completed"

    monkeypatch.setattr(worker, "process_item", process)
    if outcome == "lease_lost":
        with pytest.raises(RuntimeError, match="Verrou perdu"):
            await worker.run_transfer(1, lease)
    else:
        await worker.run_transfer(1, lease)
    if outcome == "completed":
        assert job.status == "completed"
    if outcome == "blocked":
        assert job.status == "blocked" and items[2].status == "completed"
    if outcome == "pause":
        assert job.status == "paused"


@pytest.mark.asyncio
@pytest.mark.parametrize("queued", ["job", "idle"])
async def test_restart_recovery_respects_auto_resume_and_manual_pause(tmp_path, monkeypatch, queued):
    from app.storage import plex_finalization

    monkeypatch.setattr(plex_finalization, "run_finalizer", AsyncMock())
    shutdown = threading.Event()
    monkeypatch.setattr(worker, "SHUTDOWN", shutdown)
    monkeypatch.setattr(worker, "HEARTBEAT", tmp_path / "heartbeat")
    restart = [
        NS(status="running", desired_state="run", auto_resume=True),
        NS(status="running", desired_state="run", auto_resume=False),
    ]
    paused = NS(status="queued", desired_state="pause")

    def result(values):
        return NS(scalars=lambda: values)

    db = NS(
        execute=AsyncMock(
            side_effect=[
                result(restart),
                result([paused]),
                NS(scalar_one_or_none=lambda: None),
                NS(scalar_one_or_none=lambda: NS(id=7) if queued == "job" else None),
            ]
        ),
        commit=AsyncMock(),
    )
    lease = NS(execute=AsyncMock(return_value=NS(scalar=lambda: True)), commit=AsyncMock())
    monkeypatch.setattr(worker, "async_engine", NS(connect=lambda: Context(lease)))
    monkeypatch.setattr(worker, "AsyncSessionLocal", lambda: Context(db))
    monkeypatch.setattr(worker.shutil, "which", lambda _: True)
    monkeypatch.setattr(worker, "refresh_storage", AsyncMock())

    async def run(*args):
        shutdown.set()

    monkeypatch.setattr(worker, "run_transfer", run)

    async def sleep(*args):
        shutdown.set()

    monkeypatch.setattr(worker.asyncio, "sleep", sleep)
    await worker.main()
    assert restart[0].status == "queued" and restart[1].status == "paused"
    assert paused.status == "paused"


@pytest.mark.asyncio
async def test_capacity_health_reports_missing_mount(tmp_path, monkeypatch):
    good = NS(mount_path=str(tmp_path))
    bad = NS(mount_path="absent")
    db = NS(execute=AsyncMock(return_value=NS(scalars=lambda: [good, bad])), commit=AsyncMock())
    monkeypatch.setattr(worker, "AsyncSessionLocal", lambda: Context(db))

    def root(path):
        if path == "absent":
            raise ValueError("missing mount")
        return Path(path)

    monkeypatch.setattr(worker, "mounted_root", root)
    await worker.refresh_storage()
    assert good.total_bytes > 0 and good.health == "ok"
    assert bad.total_bytes is None and bad.free_bytes is None and bad.health == "unavailable"


@pytest.mark.asyncio
async def test_pagination_and_session_paths(monkeypatch):
    def metadata(key, file):
        return {"ratingKey": key, "Media": [{"Part": [{"file": file}]}]}

    pages = [
        {"totalSize": 2, "Metadata": [metadata("1", "/media/Film/a.mkv")]},
        {"totalSize": 2, "Metadata": [metadata("2", "/elsewhere/b.mkv")]},
    ]
    monkeypatch.setattr(worker, "plex_get", AsyncMock(side_effect=pages))
    assert await worker.plex_files(None, "3", "/media/Film", "movie") == {"a.mkv": ["1"]}
    monkeypatch.setattr(worker, "plex_get", AsyncMock(return_value={"Metadata": [metadata("1", "/usb/Film/a.mkv")]}))
    assert await worker.is_playing(None, dict(source_plex="/media/Film", destination_plex="/usb/Film"))


@pytest.mark.asyncio
async def test_plex_transfer_lookup_targets_one_movie_by_title_and_path(monkeypatch):
    title_search = AsyncMock(
        return_value={
            "Metadata": [
                {
                    "ratingKey": "42",
                    "Media": [{"Part": [{"file": "/media/Film/Film.mkv"}]}],
                }
            ]
        }
    )
    monkeypatch.setattr(worker, "plex_get", title_search)
    result = await worker.plex_files(
        NS(),
        "3",
        "/media/Film",
        "movie",
        snapshot={"tmdb_id": 42},
        title="Film",
    )
    assert result == {"Film.mkv": ["42"]}
    title_search.assert_awaited_once_with(
        title_search.await_args.args[0],
        "/library/sections/3/all",
        {"type": 1, "title": "Film", "includeMedia": 1, "includeGuids": 1},
    )


@pytest.mark.asyncio
async def test_plex_transfer_lookup_targets_series_leaves_and_known_rating_keys(monkeypatch):
    plex = NS()
    lookup = AsyncMock(
        side_effect=[
            {"Metadata": [{"ratingKey": "show-1"}]},
            {"Metadata": [{"ratingKey": "episode-1", "Media": [{"Part": [{"file": "/media/Show/S01E01.mkv"}]}]}]},
            {"Metadata": [{"ratingKey": "episode-1", "Media": [{"Part": [{"file": "/usb/Show/S01E01.mkv"}]}]}]},
        ]
    )
    monkeypatch.setattr(worker, "plex_get", lookup)
    source = await worker.plex_files(plex, "2", "/media/Show", "series", snapshot={"tvdb_id": 8}, title="Show")
    destination = await worker.plex_files(plex, "2", "/usb/Show", "series", rating_keys=source)
    assert source == {"S01E01.mkv": ["episode-1"]}
    assert destination == source
    assert [call.args[1] for call in lookup.await_args_list] == [
        "/library/sections/2/all",
        "/library/metadata/show-1/allLeaves",
        "/library/metadata/episode-1",
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "arr_title,aliases,plex_title",
    [
        ("The Honor Student at Magic High School (2021)", [], "The Honor Student at Magic High School"),
        ("Frieren: Beyond Journey's End", [], "Frieren"),
        ("English title (2026)", ["Titre français"], "Titre français"),
    ],
)
async def test_plex_lookup_finds_aliases_without_scanning_library(monkeypatch, arr_title, aliases, plex_title):
    async def request(conn, path, params):
        if path.endswith("/allLeaves"):
            return {"Metadata": [{"ratingKey": "ep", "Media": [{"Part": [{"file": "/media/Show/ep.mkv"}]}]}]}
        assert params["title"] and not params["title"].startswith("=")
        return {
            "Metadata": [{"ratingKey": "show", "Guid": [{"id": "tvdb://8"}]}] if params["title"] == plex_title else []
        }

    lookup = AsyncMock(side_effect=request)
    monkeypatch.setattr(worker, "plex_get", lookup)
    assert await worker.plex_files(
        None, "2", "/media/Show", "series", snapshot={"tvdb_id": 8, "alternate_titles": aliases}, title=arr_title
    ) == {"ep.mkv": ["ep"]}
    assert len(lookup.await_args_list) <= 13


@pytest.mark.asyncio
async def test_plex_lookup_rejects_wrong_identity_and_wrong_folder(monkeypatch):
    lookup = AsyncMock(
        return_value={
            "Metadata": [
                {
                    "ratingKey": "wrong-id",
                    "Guid": [{"id": "tmdb://99"}],
                    "Media": [{"Part": [{"file": "/media/Film/a.mkv"}]}],
                },
                {
                    "ratingKey": "wrong-path",
                    "Guid": [{"id": "tmdb://42"}],
                    "Media": [{"Part": [{"file": "/media/Other/a.mkv"}]}],
                },
            ]
        }
    )
    monkeypatch.setattr(worker, "plex_get", lookup)
    assert await worker.plex_files(None, "3", "/media/Film", "movie", snapshot={"tmdb_id": 42}, title="Film") == {}


@pytest.mark.asyncio
async def test_plex_lookup_rejects_duplicate_same_identity_in_folder(monkeypatch):
    lookup = AsyncMock(
        return_value={
            "Metadata": [
                {"ratingKey": key, "Guid": [{"id": "tmdb://42"}], "Media": [{"Part": [{"file": "/media/Film/a.mkv"}]}]}
                for key in ("1", "2")
            ]
        }
    )
    monkeypatch.setattr(worker, "plex_get", lookup)
    with pytest.raises(ValueError, match="Plusieurs fiches"):
        await worker.plex_files(None, "3", "/media/Film", "movie", snapshot={"tmdb_id": 42}, title="Film")


@pytest.mark.asyncio
async def test_plex_lookup_uses_translated_name_from_identity_and_server_mirror(monkeypatch):
    db = NS(execute=AsyncMock(return_value=NS(scalars=lambda: NS(all=lambda: ["Un amour invisible"]))))

    async def request(conn, path, params):
        if path.endswith("/allLeaves"):
            return {"Metadata": [{"ratingKey": "ep", "Media": [{"Part": [{"file": "/media/Show/ep.mkv"}]}]}]}
        return {
            "Metadata": [{"ratingKey": "show", "Guid": [{"id": "tvdb://470520"}]}]
            if params["title"] == "Un amour invisible"
            else []
        }

    monkeypatch.setattr(worker, "plex_get", AsyncMock(side_effect=request))
    assert await worker.plex_files(
        NS(id=7),
        "2",
        "/media/Show",
        "series",
        snapshot={"tvdb_id": 470520},
        title="Love Unseen Beneath the Clear Night Sky (2026)",
        db=db,
    ) == {"ep.mkv": ["ep"]}
    statement = db.execute.await_args.args[0].compile()
    assert "library_item_locations.server_id" in str(statement)
    assert "library_items.tvdb_id" in str(statement)
    assert 7 in statement.params.values() and "470520" in statement.params.values()


@pytest.mark.asyncio
async def test_plex_http_empty_refresh_and_json(monkeypatch):
    import httpx

    response = [
        httpx.Response(200, content=b"", request=httpx.Request("GET", "http://test")),
        httpx.Response(200, json={"MediaContainer": {"size": 2}}, request=httpx.Request("GET", "http://test")),
    ]

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, *args, **kwargs):
            return response.pop(0)

    monkeypatch.setattr(worker.httpx, "AsyncClient", lambda **kwargs: Client())
    conn = NS(url="http://test", token="dummy")
    assert await worker.plex_get(conn, "/refresh") == {}
    assert await worker.plex_get(conn, "/sections") == {"size": 2}


@pytest.mark.asyncio
@pytest.mark.parametrize("done", [True, False])
async def test_engine_processes_cancellation_and_pending_arr_does_not_block_next_job(tmp_path, monkeypatch, done):
    from app.storage import plex_finalization

    monkeypatch.setattr(plex_finalization, "run_finalizer", AsyncMock())
    import asyncio

    from app.storage import cancellation

    real_sleep = asyncio.sleep
    shutdown = threading.Event()
    monkeypatch.setattr(worker, "SHUTDOWN", shutdown)
    monkeypatch.setattr(worker, "HEARTBEAT", tmp_path / "heartbeat")
    restart = NS(status="running", desired_state="cancel", auto_resume=True)
    queued = NS(status="queued", desired_state="cancel")
    job = NS(id=1, status="cancelling")
    results = [NS(scalars=lambda: [restart]), NS(scalars=lambda: [queued]), NS(scalar_one_or_none=lambda: job)]
    if not done:
        results.append(NS(scalar_one_or_none=lambda: NS(id=2)))
    db = NS(execute=AsyncMock(side_effect=results), commit=AsyncMock())
    lease = NS(execute=AsyncMock(return_value=NS(scalar=lambda: True)), commit=AsyncMock())
    monkeypatch.setattr(worker, "async_engine", NS(connect=lambda: Context(lease)))
    monkeypatch.setattr(worker, "AsyncSessionLocal", lambda: Context(db))
    monkeypatch.setattr(worker.shutil, "which", lambda _: True)
    monkeypatch.setattr(worker, "refresh_storage", AsyncMock())

    async def cancel(*args):
        await real_sleep(0)
        assert worker.HEARTBEAT.exists()
        if done:
            shutdown.set()
        return done

    monkeypatch.setattr(cancellation, "cancel_transfer", cancel)

    async def run(*args):
        shutdown.set()

    run_mock = AsyncMock(side_effect=run)
    monkeypatch.setattr(worker, "run_transfer", run_mock)

    async def sleep(*args):
        await real_sleep(0)

    monkeypatch.setattr(worker.asyncio, "sleep", sleep)
    await worker.run_engine()
    assert restart.status == queued.status == "cancelling"
    if done:
        run_mock.assert_not_awaited()
    else:
        assert run_mock.await_args.args[0] == 2


@pytest.mark.asyncio
async def test_copy_rate_is_published_after_each_second_before_three_seconds(transfer, monkeypatch):
    t = transfer
    original_copy = worker.copier_fichier
    clock = [worker.time.monotonic()]
    monkeypatch.setattr(worker.time, "monotonic", lambda: clock[0])
    rates = []

    def copying(src, dst, advance, stop, proof, phase, mode):
        def measured(delta):
            if not delta:
                return
            first = delta // 2
            for part in (first, delta - first):
                clock[0] += 1.1
                advance(part)
                rates.append(t.item.progress.get("bytes_per_second"))

        return original_copy(src, dst, measured, stop, proof, phase, mode)

    monkeypatch.setattr(worker, "copier_fichier", copying)
    await worker.process_item(t.db, t.job, t.item, t.stop)
    assert len(rates) == 2 and all(rate is not None and rate > 0 for rate in rates)
    assert rates[0] == pytest.approx(rates[1])
    assert t.item.progress["last_bytes_per_second"] == pytest.approx(rates[-1])
