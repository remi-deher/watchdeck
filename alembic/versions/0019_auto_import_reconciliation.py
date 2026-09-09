"""Rapprochement automatique des imports bloqués.

Quand Sonarr ou Radarr ne rattache pas seul un téléchargement terminé à son média, il
fallait ouvrir la file, choisir le fichier et confirmer à la main. Deux réglages
apparaissent : un défaut global, et une surcharge par média — `NULL` suit le global,
ce qui permet de laisser un média capricieux en manuel sans désactiver le reste.
"""

import sqlalchemy as sa

from alembic import op

revision = "0019_auto_import_reconciliation"
down_revision = "0018_message_reasons"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "settings",
        sa.Column("auto_import_reconciliation", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Volontairement nullable : « pas de choix » est un état distinct de « désactivé ».
    op.add_column("media_requests", sa.Column("auto_import_reconciliation", sa.Boolean(), nullable=True))


def downgrade():
    op.drop_column("media_requests", "auto_import_reconciliation")
    op.drop_column("settings", "auto_import_reconciliation")
