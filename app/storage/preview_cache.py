"""Reuse read-only inventories within one plan, never across transfers or requests."""

from contextlib import contextmanager
from contextvars import ContextVar
from copy import deepcopy

_cache = ContextVar("storage_preview_cache", default=None)


@contextmanager
def inventory_cache():
    token = _cache.set({})
    try:
        yield
    finally:
        _cache.reset(token)


async def read_inventory(key, fetch):
    cache = _cache.get()
    if cache is None:
        return await fetch()
    if key not in cache:
        cache[key] = await fetch()
    return deepcopy(cache[key])
