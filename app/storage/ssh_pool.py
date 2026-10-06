"""SSH transports scoped to one item; channels remain isolated per operation."""

import hashlib
import json
import threading
from contextvars import ContextVar
from functools import wraps

_current = ContextVar("storage_ssh_pool", default=None)


class ConnectionPool:
    def __init__(self):
        self.clients = {}
        self.lock = threading.Lock()

    def acquire(self, config, connect):
        # Include credentials and host pin without retaining them in pool keys.
        key = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).digest()
        with self.lock:
            client = self.clients.get(key)
            transport = client.get_transport() if client else None
            if transport is None or not transport.is_active() or not transport.is_authenticated():
                if client:
                    client.close()
                self.clients.pop(key, None)
                client = connect(config)
                client.get_transport().set_keepalive(15)
                self.clients[key] = client
            return client

    def close(self):
        with self.lock:
            for client in self.clients.values():
                client.close()
            self.clients.clear()


def acquire(config, connect):
    pool = _current.get()
    return pool.acquire(config, connect) if pool else connect(config)


def release(client):
    if _current.get() is None:
        client.close()


def scoped_connections(function):
    @wraps(function)
    async def wrapped(*args, **kwargs):
        pool = ConnectionPool()
        token = _current.set(pool)
        try:
            return await function(*args, **kwargs)
        finally:
            _current.reset(token)
            pool.close()

    return wrapped
