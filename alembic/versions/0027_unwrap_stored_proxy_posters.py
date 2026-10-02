"""Affiches enregistrees sous forme d'URL du proxy : retour a l'URL source

L'import manuel renvoyait l'affiche recue par le client, deja enveloppee dans
/api/image-proxy ; elle etait stockee telle quelle puis recopiee dans l'historique des
telechargements. Les rails (qui relisent la base) n'affichaient pas ces affiches, et les
e-mails n'en avaient pas d'utilisable. Seules les URL `?url=` sont reecrites : les URL
`?plex_path=` restent servies par le proxy.

Revision ID: 0027_unwrap_stored_proxy_posters
Revises: 0026_playback_transcode_buffer
Create Date: 2026-09-25
"""

from urllib.parse import parse_qsl, urlsplit

import sqlalchemy as sa

from alembic import op

revision = "0027_unwrap_stored_proxy_posters"
down_revision = "0026_playback_transcode_buffer"
branch_labels = None
depends_on = None

_TABLES = ("media_requests", "download_history", "library_items")


def _source(url: str) -> str | None:
    while url and url.startswith("/api/image-proxy"):
        source = dict(parse_qsl(urlsplit(url).query)).get("url")
        if not source:
            return None
        url = source
    return url


def upgrade() -> None:
    conn = op.get_bind()
    for table in _TABLES:
        rows = conn.execute(
            sa.text(f"SELECT id, poster_url FROM {table} WHERE poster_url LIKE '/api/image-proxy?url=%'")
        ).fetchall()
        for row_id, poster_url in rows:
            source = _source(poster_url)
            if source:
                conn.execute(
                    sa.text(f"UPDATE {table} SET poster_url = :url WHERE id = :id"),
                    {"url": source, "id": row_id},
                )


def downgrade() -> None:
    # Donnees corrigees, rien a restaurer : l'ancienne forme etait le defaut.
    pass
