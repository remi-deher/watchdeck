"""Motifs de message : retrait de deux motifs par défaut trop vagues

« Absent du catalogue de téléchargement » et « Hors périmètre du serveur » ne disaient
rien d'utile au demandeur. Seuls les motifs restés tels que livrés sont retirés : un
motif dont l'administrateur a modifié le libellé ou le message est conservé.

Revision ID: 0032_message_reasons_cleanup
Revises: 0031_plex_servers_activity
Create Date: 2026-10-01
"""

import sqlalchemy as sa

from alembic import op

revision = "0032_message_reasons_cleanup"
down_revision = "0031_plex_servers_activity"
branch_labels = None
depends_on = None

#: Libellés et messages exacts tels que semés par `ensure_defaults` jusqu'en v1.64.0.
REMOVED_DEFAULTS = (
    (
        "Absent du catalogue de téléchargement",
        "Ce média n'existe pas dans le catalogue sur lequel s'appuie le serveur : il ne peut donc pas être "
        "téléchargé. La fiche que vous voyez dans Plex vient de son catalogue à lui, plus large que le nôtre — "
        "certaines entrées n'ont pas d'équivalent récupérable. "
        "Pensez à retirer ce média de votre liste d'envies Plex : sans cela, il continuera d'y apparaître.",
    ),
    (
        "Hors périmètre du serveur",
        "Ce média ne fait pas partie de ce que ce serveur héberge. La demande a donc été annulée, sans préjuger "
        "de son intérêt : c'est un choix de périmètre, pas un jugement sur le contenu.",
    ),
)


def upgrade() -> None:
    bind = op.get_bind()
    for label, message in REMOVED_DEFAULTS:
        bind.execute(
            sa.text("DELETE FROM message_reasons WHERE event = 'cancelled' AND label = :label AND message = :message"),
            {"label": label, "message": message},
        )


def downgrade() -> None:
    # Les motifs sont des donnees d'administration : on ne les recree pas.
    pass
