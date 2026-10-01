"""Plusieurs serveurs Plex : lectures en direct et historique par serveur."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from sqlalchemy.future import select

from app.models import PlaybackSession, PlexServer, Settings
from app.services import playback_activity
from app.services.playback_activity import (
    _collect_plex_activity_unlocked,
    _miss_counts,
    activity_history,
    handle_websocket_state,
    live_activity_snapshot,
)
from tests.test_playback_activity import PRODUCTION_PAUSED_SESSION_XML


def _response(xml: str) -> MagicMock:
    resp = MagicMock()
    resp.text = xml
    resp.raise_for_status = MagicMock()
    return resp


def _client(responses: dict[str, object]) -> AsyncMock:
    """Client httpx factice : la reponse depend de l'hote interroge."""
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)

    async def get(url, **kwargs):
        for host, response in responses.items():
            if host in url:
                if isinstance(response, Exception):
                    raise response
                return response
        raise AssertionError(url)

    client.get = AsyncMock(side_effect=get)
    return client


@pytest.fixture(autouse=True)
def _reset_miss_counts():
    _miss_counts.clear()
    yield
    _miss_counts.clear()


def _setup(db) -> PlexServer:
    db.add(Settings(id=1, live_activity_enabled=True, plex_url="http://main:32400", plex_token="tok"))
    primary = PlexServer(name="Serveur principal", is_primary=True)
    second = PlexServer(name="Plex 4K", url="http://uhd:32400", token="tok2")
    if not db.query(PlexServer).filter(PlexServer.is_primary).first():
        db.add(primary)
    db.add(second)
    db.commit()
    return second


@pytest.mark.asyncio
async def test_sessions_of_each_server_are_kept_apart(async_db):
    second = _setup(async_db)
    responses = {"main": _response(PRODUCTION_PAUSED_SESSION_XML), "uhd": _response(PRODUCTION_PAUSED_SESSION_XML)}
    with (
        patch.object(playback_activity, "AsyncSessionLocal", return_value=async_db),
        patch.object(playback_activity.httpx, "AsyncClient", return_value=_client(responses)),
    ):
        result = await _collect_plex_activity_unlocked()

    assert result == {"status": "complete", "active": 2}
    rows = async_db.query(PlaybackSession).order_by(PlaybackSession.id).all()
    assert {row.server_id for row in rows} == {None, second.id}
    secondary = next(row for row in rows if row.server_id == second.id)
    assert secondary.source_session_id.startswith(f"{second.id}:")

    snapshot = await live_activity_snapshot(db=async_db)
    assert {item["server_name"] for item in snapshot["active"]} == {"Serveur principal", "Plex 4K"}


@pytest.mark.asyncio
async def test_unreachable_server_does_not_close_its_sessions(async_db):
    second = _setup(async_db)
    async_db.add(
        PlaybackSession(
            source="plex", source_session_id=f"{second.id}:abc", session_key=9, title="Film 4K", server_id=second.id
        )
    )
    async_db.commit()
    responses = {"main": _response("<MediaContainer size='0'></MediaContainer>"), "uhd": httpx.ConnectError("down")}
    with (
        patch.object(playback_activity, "AsyncSessionLocal", return_value=async_db),
        patch.object(playback_activity.httpx, "AsyncClient", return_value=_client(responses)),
    ):
        for _ in range(5):
            await _collect_plex_activity_unlocked()

    row = async_db.query(PlaybackSession).filter(PlaybackSession.server_id == second.id).one()
    assert row.ended_at is None


@pytest.mark.asyncio
async def test_websocket_stop_only_touches_its_own_server(async_db):
    second = _setup(async_db)
    async_db.add_all(
        [
            PlaybackSession(source="plex", source_session_id="a", session_key=7, title="Principal"),
            PlaybackSession(
                source="plex", source_session_id=f"{second.id}:b", session_key=7, title="4K", server_id=second.id
            ),
        ]
    )
    async_db.commit()
    with (
        patch.object(playback_activity, "AsyncSessionLocal", return_value=async_db),
        patch.object(playback_activity, "publish", new=AsyncMock()),
    ):
        await handle_websocket_state(7, None, "stopped", server_id=second.id)

    main = async_db.query(PlaybackSession).filter(PlaybackSession.title == "Principal").one()
    uhd = async_db.query(PlaybackSession).filter(PlaybackSession.title == "4K").one()
    assert main.ended_at is None
    assert uhd.ended_at is not None


@pytest.mark.asyncio
async def test_history_filters_by_server(async_db):
    from datetime import timedelta

    from app.utils import now_utc_naive

    second = _setup(async_db)
    primary = async_db.query(PlexServer).filter(PlexServer.is_primary).one()
    ended = now_utc_naive() - timedelta(hours=1)
    async_db.add_all(
        [
            PlaybackSession(source="plex", source_session_id="a", title="Principal", ended_at=ended),
            PlaybackSession(source="plex", source_session_id="b", title="4K", ended_at=ended, server_id=second.id),
        ]
    )
    async_db.commit()

    only_4k = await activity_history(30, db=async_db, server=second.id)
    assert [item["title"] for item in only_4k["items"]] == ["4K"]
    only_main = await activity_history(30, db=async_db, server=primary.id)
    assert [item["title"] for item in only_main["items"]] == ["Principal"]
    assert [facet["name"] for facet in only_main["facets"]["servers"]] == ["Serveur principal", "Plex 4K"]
    rows = (await async_db.execute(select(PlaybackSession))).scalars().all()
    assert len(rows) == 2


@pytest.mark.asyncio
async def test_statistics_with_real_async_session(async_database):
    """Les agregats chargent des colonnes choisies (load_only) : une colonne oubliee
    declenchait un chargement paresseux, interdit en async (MissingGreenlet -> 500)."""
    from datetime import timedelta

    from app.services.playback_activity import activity_snapshot
    from app.utils import now_utc_naive

    now = now_utc_naive() - timedelta(days=1)
    async with async_database.session_factory() as db:
        second = PlexServer(name="Plex 4K", url="http://uhd:32400", token="tok2")
        db.add(second)
        await db.flush()
        db.add_all(
            [
                PlaybackSession(
                    source="plex",
                    source_session_id="a",
                    title="Principal",
                    rating_key="10",
                    watched_ms=3_600_000,
                    user_name="Rémi",
                    started_at=now,
                    last_seen_at=now,
                    ended_at=now,
                ),
                PlaybackSession(
                    source="plex",
                    source_session_id=f"{second.id}:b",
                    title="4K",
                    rating_key="20",
                    watched_ms=3_600_000,
                    user_name="Rémi",
                    started_at=now,
                    last_seen_at=now,
                    ended_at=now,
                    server_id=second.id,
                ),
            ]
        )
        # Plus de lectures recentes que l'historique n'en charge en entier (100) : les
        # deux lectures ci-dessus n'existent alors que sous forme partielle (load_only).
        db.add_all(
            PlaybackSession(
                source="plex",
                source_session_id=f"recent-{index}",
                title=f"Recent {index}",
                user_name="Rémi",
                started_at=now + timedelta(minutes=index + 1),
                last_seen_at=now,
                ended_at=now,
            )
            for index in range(100)
        )
        await db.commit()

    async with async_database.session_factory() as db:
        snapshot = await activity_snapshot(30, db=db)

    thumbs = {item["title"]: item["thumb_url"] for item in snapshot["analytics"]["popular"]}
    assert thumbs["Principal"] == "/api/playback/thumb?path=%2Flibrary%2Fmetadata%2F10%2Fthumb"
    assert thumbs["4K"].endswith(f"&server={second.id}")
