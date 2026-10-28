"""Real local sockets verify reuse and isolation of integration pools."""

import asyncio

import pytest

from app.services.http_pool import close_http_clients, shared_http_client


@pytest.mark.asyncio
async def test_http_reuses_connection_without_reusing_account_cookies():
    connections = 0
    requests = []

    async def serve(reader, writer):
        nonlocal connections
        connections += 1
        try:
            while True:
                data = await reader.readuntil(b"\r\n\r\n")
                requests.append(data.decode())
                writer.write(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nSet-Cookie: account=first; Path=/\r\n\r\nok")
                await writer.drain()
        except (asyncio.IncompleteReadError, ConnectionError):
            pass
        finally:
            writer.close()

    server = await asyncio.start_server(serve, "127.0.0.1", 0)
    url = f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}/"
    try:
        async with shared_http_client(timeout=3) as first:
            assert (await first.get(url, headers={"X-Plex-Token": "first"})).text == "ok"
        async with shared_http_client(timeout=3) as second:
            assert second is first
            assert (await second.get(url, headers={"X-Plex-Token": "second"})).text == "ok"
        assert connections == 1
        assert "X-Plex-Token: first" in requests[0]
        assert "X-Plex-Token: second" in requests[1]
        assert "Cookie:" not in requests[1]
        async with shared_http_client(timeout=3, verify=False) as other_tls:
            assert other_tls is not first
        await close_http_clients()
        assert first.is_closed and other_tls.is_closed
    finally:
        await close_http_clients()
        server.close()
        await server.wait_closed()


@pytest.mark.asyncio
async def test_redis_publications_reuse_pool_and_close(monkeypatch):
    from unittest.mock import AsyncMock, Mock

    from redis.asyncio import Redis

    from app import realtime

    client = AsyncMock()
    client.xadd.return_value = "1-0"
    factory = Mock(return_value=client)
    monkeypatch.setenv("REDIS_URL", "redis://fixture:6379/0")
    monkeypatch.setattr(Redis, "from_url", factory)
    try:
        await realtime.publish("health.updated", {"n": 1})
        await realtime.publish("health.updated", {"n": 2})
        assert factory.call_count == 1
        assert client.xadd.await_count == 2
        client.aclose.assert_not_awaited()
    finally:
        await realtime.close_publishers()
    client.aclose.assert_awaited_once()
