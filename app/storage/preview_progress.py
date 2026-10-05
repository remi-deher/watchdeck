"""Per-preview phase reporting shared across the storage planning call tree."""

import logging
from contextvars import ContextVar

_reporter = ContextVar("storage_preview_progress_reporter", default=None)
logger = logging.getLogger(__name__)


def set_reporter(callback):
    return _reporter.set(callback)


def reset_reporter(token):
    _reporter.reset(token)


async def report(phase):
    callback = _reporter.get()
    if callback:
        try:
            await callback(phase)
        except Exception:
            # Progress is informational; a Redis hiccup must not cancel a safe plan.
            logger.debug("Could not publish storage preview phase", exc_info=True)
