"""Connexion Tracearr.

Même rôle que Tautulli — observer les sessions en direct et en conserver la décision de
lecture — mais l'API publique v2 de Tracearr expose en plus le débit, les codecs source
et flux, et les identifiants IMDb/TMDb/TVDb. La clé est stockée chiffrée, comme les
autres secrets de connexion.
"""

import sqlalchemy as sa

from alembic import op

revision = "0015_tracearr_connection"
down_revision = "0014_playback_enrichment"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("settings") as batch:
        batch.add_column(sa.Column("tracearr_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("tracearr_url", sa.String(), nullable=True))
        batch.add_column(sa.Column("tracearr_api_key", sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table("settings") as batch:
        batch.drop_column("tracearr_api_key")
        batch.drop_column("tracearr_url")
        batch.drop_column("tracearr_enabled")
