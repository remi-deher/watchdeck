"""
Buffer mémoire circulaire pour les logs applicatifs.

Installe un handler Python logging qui conserve les MAX_LOGS dernières entrées
en mémoire. Utilisé par l'endpoint /api/logs pour afficher les logs dans l'UI.
"""

import logging
import re
from collections import deque
from datetime import datetime, timezone

MAX_LOGS = 500

_buffer: deque = deque(maxlen=MAX_LOGS)

LEVEL_COLORS = {
    "DEBUG": "secondary",
    "INFO": "info",
    "WARNING": "warning",
    "ERROR": "danger",
    "CRITICAL": "danger",
}


class MemoryLogHandler(logging.Handler):
    def emit(self, record: logging.LogRecord):
        try:
            _buffer.append(
                {
                    "time": datetime.fromtimestamp(record.created, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                    "level": record.levelname,
                    "color": LEVEL_COLORS.get(record.levelname, "secondary"),
                    "logger": record.name,
                    "message": self.format(record) if record.exc_info else record.getMessage(),
                }
            )
        except Exception:
            pass


def get_logs() -> list[dict]:
    return list(reversed(_buffer))


# Secrets transmis en parametre d'URL (secret du webhook Plex, token Plex, cles d'API) :
# ils apparaissaient en clair dans les journaux d'acces d'uvicorn et ceux de httpx.
_SECRET_QUERY_RE = re.compile(r"(?i)([?&](?:secret|token|x-plex-token|api_?key|apikey|access_token)=)[^&\s\"']+")


def redact_secrets(text: str) -> str:
    return _SECRET_QUERY_RE.sub(r"\1***", text)


class RedactSecretsFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:
            return True
        if redact_secrets(message) == message:
            return True
        # Masquer dans les arguments sans les vider : le format d'acces
        # d'uvicorn deballe record.args (5 valeurs) au moment d'ecrire.
        if isinstance(record.args, tuple) and record.args:
            args = tuple(redact_secrets(arg) if isinstance(arg, str) else arg for arg in record.args)
            msg = redact_secrets(record.msg) if isinstance(record.msg, str) else record.msg
            try:
                rendered: str | None = str(msg) % args
            except (TypeError, ValueError):
                rendered = None
            if rendered is not None and redact_secrets(rendered) == rendered:
                record.msg, record.args = msg, args
                return True
        record.msg = redact_secrets(message)
        record.args = ()
        return True


_redact_filter = RedactSecretsFilter()


def install_redaction() -> None:
    """Masque les secrets d'URL dans tous les journaux (API comme worker)."""
    for existing in logging.getLogger().handlers:
        existing.addFilter(_redact_filter)
    # Les journaux d'acces d'uvicorn ne remontent pas au logger racine.
    for name in ("uvicorn.access", "uvicorn.error", "httpx"):
        logging.getLogger(name).addFilter(_redact_filter)


def install():
    handler = MemoryLogHandler()
    handler.setLevel(logging.INFO)
    logging.getLogger().addHandler(handler)
    install_redaction()
