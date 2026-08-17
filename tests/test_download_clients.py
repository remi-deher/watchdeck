import os
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.download_clients import (
    _resolves_to_forbidden_target,
    _sanitized_watch_folder_path,
    add_torrent_to_client,
    add_watch_folder_torrent,
    check_client_connection,
    control_qbittorrent_torrent,
    control_transmission_torrent,
    delete_torrent,
    get_torrent_status,
    list_qbittorrent_torrents,
    list_transmission_torrents,
)


def test_sanitized_watch_folder_path_rejects_relative_path():
    """Regression CodeQL py/path-injection : un chemin relatif ne doit jamais atteindre
    os.path.isdir/open/os.remove tel quel."""
    assert _sanitized_watch_folder_path("relative/folder") is None
    assert _sanitized_watch_folder_path("") is None
    assert _sanitized_watch_folder_path(None) is None


def test_sanitized_watch_folder_path_resolves_traversal_segments(tmp_path):
    """`os.path.normpath` resout les segments ".." avant que la fonction ne les inspecte
    (aucune notion de repertoire racine autorise ici -- c'est un chemin admin arbitraire,
    pas un acces sandboxe) : le resultat est le chemin final canonique, pas un rejet."""
    traversal = str(tmp_path / "sub" / ".." / "escaped")
    assert _sanitized_watch_folder_path(traversal) == os.path.normpath(str(tmp_path / "escaped"))


def test_sanitized_watch_folder_path_accepts_normalized_absolute_path(tmp_path):
    assert _sanitized_watch_folder_path(str(tmp_path)) == os.path.normpath(str(tmp_path))


@pytest.mark.asyncio
async def test_qbittorrent_connection_success():
    mock_response_login = MagicMock()
    mock_response_login.status_code = 200
    mock_response_login.text = "Ok."
    mock_response_login.cookies = {"SID": "test_sid_123"}

    mock_response_version = MagicMock()
    mock_response_version.status_code = 200
    mock_response_version.text = "4.5.2"

    with (
        patch("httpx.AsyncClient.post", new=AsyncMock(return_value=mock_response_login)),
        patch("httpx.AsyncClient.get", new=AsyncMock(return_value=mock_response_version)),
    ):
        ok, msg = await check_client_connection("qbittorrent", "http://localhost:8080", "user", "pass")
        assert ok is True
        assert "Connecté à qBittorrent v4.5.2" in msg


@pytest.mark.asyncio
async def test_qbittorrent_connection_without_credentials_skips_login():
    version = MagicMock(status_code=200, text="5.1.0")
    version.raise_for_status.return_value = None
    with (
        patch("app.services.download_clients.qbittorrent_login", new=AsyncMock()) as login,
        patch("httpx.AsyncClient.get", new=AsyncMock(return_value=version)) as get,
    ):
        ok, msg = await check_client_connection("qbittorrent", "http://qbit", None, None)

    assert ok is True
    assert "qBittorrent v5.1.0" in msg
    login.assert_not_awaited()
    assert get.await_args.kwargs["cookies"] == {}


@pytest.mark.asyncio
async def test_qbittorrent_add_without_credentials_uses_direct_api():
    added = MagicMock(status_code=200, text="Ok.")
    added.raise_for_status.return_value = None
    with (
        patch("app.services.download_clients.qbittorrent_login", new=AsyncMock()) as login,
        patch("httpx.AsyncClient.post", new=AsyncMock(return_value=added)) as post,
    ):
        ok, _msg, info_hash = await add_torrent_to_client(
            "qbittorrent", "http://qbit", "", "", "magnet:?xt=urn:btih:abc"
        )

    assert ok is True
    assert info_hash == "abc"
    login.assert_not_awaited()
    assert post.await_args.kwargs["cookies"] == {}


@pytest.mark.asyncio
async def test_transmission_list_normalizes_torrents():
    payload = {
        "result": "success",
        "arguments": {
            "torrents": [
                {
                    "hashString": "abc",
                    "name": "Film",
                    "status": 4,
                    "percentDone": 0.25,
                    "totalSize": 1024,
                    "rateDownload": 42,
                    "rateUpload": 2,
                    "uploadRatio": 0.5,
                    "eta": 60,
                    "labels": ["watchdeck", "films"],
                }
            ]
        },
    }
    with patch("app.services.download_clients.transmission_rpc", new=AsyncMock(return_value=payload)):
        torrents = await list_transmission_torrents("http://transmission", None, None)

    assert torrents[0] == {
        "hash": "abc",
        "name": "Film",
        "state": "downloading",
        "progress": 0.25,
        "size": 1024,
        "dlspeed": 42,
        "upspeed": 2,
        "ratio": 0.5,
        "eta": 60,
        "category": "",
        "tags": "watchdeck, films",
        "save_path": "",
        "added_on": None,
        "completed_on": None,
        "comment": "",
        "trackers": "",
    }


@pytest.mark.asyncio
async def test_transmission_control_deletes_files_when_requested():
    rpc = AsyncMock(return_value={"result": "success"})
    with patch("app.services.download_clients.transmission_rpc", new=rpc):
        ok = await control_transmission_torrent("http://transmission", None, None, "abc", "delete", delete_files=True)

    assert ok is True
    assert rpc.await_args.args[4] == "torrent-remove"
    assert rpc.await_args.args[5] == {"ids": ["abc"], "delete-local-data": True}


@pytest.mark.asyncio
async def test_qbittorrent_add_torrent_success():
    mock_response_login = MagicMock()
    mock_response_login.status_code = 200
    mock_response_login.text = "Ok."
    mock_response_login.cookies = {"SID": "test_sid_123"}

    mock_response_add = MagicMock()
    mock_response_add.status_code = 200
    mock_response_add.text = "Ok."

    with patch("httpx.AsyncClient.post") as mock_post:
        mock_post.side_effect = [mock_response_login, mock_response_add]

        ok, msg, info_hash = await add_torrent_to_client(
            "qbittorrent", "http://localhost:8080", "user", "pass", "magnet:?xt=urn:btih:abc", "category", "tag1,tag2"
        )
        assert ok is True
        assert "added" in msg or "ajouté" in msg
        assert info_hash == "abc"


@pytest.mark.asyncio
async def test_transmission_connection_success():
    mock_response_409 = MagicMock()
    mock_response_409.status_code = 409
    mock_response_409.headers = {"X-Transmission-Session-Id": "sess_abc"}

    mock_response_200 = MagicMock()
    mock_response_200.status_code = 200
    mock_response_200.json.return_value = {"result": "success", "arguments": {"version": "3.00"}}

    with patch("httpx.AsyncClient.post") as mock_post:
        mock_post.side_effect = [mock_response_409, mock_response_200]

        ok, msg = await check_client_connection("transmission", "http://localhost:9091", "user", "pass")
        assert ok is True
        assert "Connecté à Transmission v3.00" in msg


@pytest.mark.asyncio
async def test_transmission_add_torrent_success():
    mock_response_409 = MagicMock()
    mock_response_409.status_code = 409
    mock_response_409.headers = {"X-Transmission-Session-Id": "sess_abc"}

    mock_response_200 = MagicMock()
    mock_response_200.status_code = 200
    mock_response_200.json.return_value = {
        "result": "success",
        "arguments": {"torrent-added": {"hashString": "xyz", "id": 5, "name": "test"}},
    }

    with patch("httpx.AsyncClient.post") as mock_post:
        mock_post.side_effect = [mock_response_409, mock_response_200]

        ok, msg, info_hash = await add_torrent_to_client(
            "transmission", "http://localhost:9091", "user", "pass", "magnet:?xt=urn:btih:abc", None, "tag1"
        )
        assert ok is True
        assert "added" in msg or "ajouté" in msg
        assert info_hash == "xyz"


@pytest.mark.asyncio
async def test_watch_folder_success():
    with tempfile.TemporaryDirectory() as tmpdir:
        ok, msg = await check_client_connection("watch_folder", tmpdir, None, None)
        assert ok is True

        mock_content = b"fake torrent content"
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = mock_content
        mock_response.headers = {"content-disposition": 'attachment; filename="my_movie.torrent"'}

        with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=mock_response)):
            ok, msg, info_hash = await add_torrent_to_client(
                "watch_folder", tmpdir, None, None, "http://prowlarr/download/123"
            )
            assert ok is True
            assert info_hash is not None
            assert os.path.isfile(os.path.join(tmpdir, "my_movie.torrent"))


@pytest.mark.asyncio
async def test_resolves_to_forbidden_target_blocks_loopback_and_link_local():
    """Regression SSRF (CodeQL py/full-ssrf) : le loopback du conteneur et le
    lien-local (dont la metadata cloud 169.254.169.254) doivent etre rejetes."""
    assert await _resolves_to_forbidden_target("127.0.0.1") is True
    assert await _resolves_to_forbidden_target("169.254.169.254") is True


@pytest.mark.asyncio
async def test_resolves_to_forbidden_target_allows_normal_and_unresolvable_hosts():
    """Un hote normal reste autorise, et un hote qui ne se resout pas (ex. nom de
    service Docker interne indisponible depuis l'environnement de test) ne doit
    pas etre traite comme suspect : on laisse httpx echouer naturellement plutot
    que de bloquer un usage legitime."""
    assert await _resolves_to_forbidden_target("example.com") is False
    assert await _resolves_to_forbidden_target("this-host-does-not-exist.invalid") is False


@pytest.mark.asyncio
async def test_watch_folder_torrent_rejects_loopback_url():
    with tempfile.TemporaryDirectory() as tmpdir:
        ok, msg, info_hash = await add_watch_folder_torrent(tmpdir, "http://127.0.0.1/download/123")
        assert ok is False
        assert info_hash is None


@pytest.mark.asyncio
async def test_get_torrent_status_qbittorrent():
    mock_response_login = MagicMock()
    mock_response_login.status_code = 200
    mock_response_login.text = "Ok."
    mock_response_login.cookies = {"SID": "test_sid_123"}

    mock_response_info = MagicMock()
    mock_response_info.status_code = 200
    mock_response_info.json.return_value = [
        {
            "name": "My test torrent",
            "progress": 0.455,
            "state": "downloading",
            "ratio": 1.2,
            "seeding_time": 3600,
            "dlspeed": 102400,
            "upspeed": 51200,
            "eta": 300,
        }
    ]

    with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=mock_response_login)):
        with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=mock_response_info)):
            status = await get_torrent_status("qbittorrent", "http://localhost:8080", "user", "pass", "abc")
            assert status is not None
            assert status["name"] == "My test torrent"
            assert status["progress"] == 45.5
            assert status["status"] == "downloading"
            assert status["ratio"] == 1.2


@pytest.mark.asyncio
async def test_delete_torrent_transmission():
    mock_response_409 = MagicMock()
    mock_response_409.status_code = 409
    mock_response_409.headers = {"X-Transmission-Session-Id": "sess_abc"}

    mock_response_200 = MagicMock()
    mock_response_200.status_code = 200
    mock_response_200.json.return_value = {"result": "success"}

    with patch("httpx.AsyncClient.post") as mock_post:
        mock_post.side_effect = [mock_response_409, mock_response_200]

        ok = await delete_torrent("transmission", "http://localhost:9091", "user", "pass", "xyz", True)
        assert ok is True


@pytest.mark.asyncio
async def test_qbittorrent_control_and_full_queue():
    login = MagicMock(status_code=200, text="Ok.", cookies={"SID": "sid"})
    queue = MagicMock(status_code=200)
    queue.json.return_value = [{"hash": "abc", "name": "Film", "progress": 0.5}]
    command = MagicMock(status_code=200)
    with (
        patch("httpx.AsyncClient.post", new=AsyncMock(side_effect=[login, login, command])) as post,
        patch("httpx.AsyncClient.get", new=AsyncMock(return_value=queue)),
    ):
        rows = await list_qbittorrent_torrents("http://qbit", "user", "pass")
        ok = await control_qbittorrent_torrent("http://qbit", "user", "pass", "abc", "pause")

    assert rows[0]["name"] == "Film"
    assert ok is True
    assert post.await_args_list[-1].args[0].endswith("/api/v2/torrents/stop")
