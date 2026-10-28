"""Reusable, cookie-free HTTP pools for token-authenticated integrations."""

import asyncio
from contextlib import asynccontextmanager
from http.cookiejar import CookieJar, DefaultCookiePolicy
from weakref import WeakKeyDictionary

import httpx

_pools = WeakKeyDictionary()
_locks = WeakKeyDictionary()


class _RejectCookies(DefaultCookiePolicy):
    def set_ok(self, cookie, request):
        return False

    def return_ok(self, cookie, request):
        return False


@asynccontextmanager
async def shared_http_client(*, timeout=15, verify=True, follow_redirects=False):
    # Tokens stay on individual requests. Neither cookies nor default credentials
    # may leak from one Plex account to another through a reused client.
    loop = asyncio.get_running_loop()
    pools = _pools.setdefault(loop, {})
    key = (httpx.AsyncClient, timeout, verify, follow_redirects)
    async with _locks.setdefault(loop, asyncio.Lock()):
        if key not in pools:
            owner = httpx.AsyncClient(
                timeout=timeout,
                verify=verify,
                follow_redirects=follow_redirects,
                cookies=CookieJar(policy=_RejectCookies()),
                limits=httpx.Limits(max_connections=50, max_keepalive_connections=20, keepalive_expiry=30),
            )
            # __aenter__ does not perform network I/O; insert before another caller can use it.
            client = await owner.__aenter__()
            pools[key] = (owner, client)
    yield pools[key][1]


async def close_http_clients():
    pools = _pools.pop(asyncio.get_running_loop(), {})
    for owner, _ in pools.values():
        await owner.__aexit__(None, None, None)
