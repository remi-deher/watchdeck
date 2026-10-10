import asyncio
from types import SimpleNamespace as NS

import pytest

from app.storage.locks import MutationLocks, item_paths


def test_item_reserves_media_folders_in_the_filesystem_namespace():
    item = NS(
        snapshot={
            "source_mount": "/data",
            "destination_mount": "/usb",
            "relative": "Monk",
            "source_arr": "/arr/Monk",
            "destination_arr": "/arr-usb/Monk",
        }
    )
    assert item_paths(item) == ["/data/Monk", "/usb/Monk"]


@pytest.mark.asyncio
@pytest.mark.parametrize("other", ["/data/Film", "/data/Film/season", "/data"])
async def test_overlapping_folders_are_serialized(other):
    locks = MutationLocks()
    entered = asyncio.Event()

    async def second():
        async with locks.hold([other]):
            entered.set()

    async with locks.hold(["/data/Film"]):
        task = asyncio.create_task(second())
        await asyncio.sleep(0)
        assert not entered.is_set()
        async with locks.hold([other], wait=False) as acquired:
            assert not acquired
    await asyncio.wait_for(task, 1)
    assert entered.is_set()


@pytest.mark.asyncio
async def test_cancelled_waiter_and_failed_operation_release_reservations():
    locks = MutationLocks()
    async with locks.hold(["/a", "/b"]):

        async def wait():
            async with locks.hold(["/b", "/c"]):
                pytest.fail("Reservation conflicting with the active copy")

        task = asyncio.create_task(wait())
        await asyncio.sleep(0)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        async with locks.hold(["/c"], wait=False) as acquired:
            assert acquired
    with pytest.raises(ValueError):
        async with locks.hold(["/b", "/a", "/a/../a"]):
            raise ValueError("failure")
    assert not locks.active


@pytest.mark.asyncio
async def test_reversed_path_order_cannot_deadlock():
    locks = MutationLocks()
    started = asyncio.Event()
    release = asyncio.Event()

    async def first():
        async with locks.hold(["/b", "/a"]):
            started.set()
            await release.wait()

    async def second():
        async with locks.hold(["/a", "/b"]):
            return True

    a = asyncio.create_task(first())
    await started.wait()
    b = asyncio.create_task(second())
    await asyncio.sleep(0)
    release.set()
    assert (await asyncio.wait_for(asyncio.gather(a, b), 1))[1]
