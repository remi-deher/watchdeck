"""Fusion multi-sources de l'historique de lecture.

Deux besoins, une seule migration :

* ``watched_ms`` devient nullable. La colonne était ``NOT NULL DEFAULT 0``, ce qui
  confond « aucune durée n'a jamais été mesurée » et « la lecture a duré zéro ». Dès
  qu'une source de couverture sans durée alimente la table -- l'historique Plex n'en
  fournit aucune --, cette confusion écrase le temps regardé moyen et fausse les
  compteurs d'engagement. Une durée inconnue doit rester inconnue, et se compter comme
  telle dans l'indicateur de couverture.

* ``enrichment_sources`` mémorise, champ par champ, qui a fourni la valeur. C'est ce qui
  rend la règle « aucune source n'écrase l'autre » vérifiable au lieu d'être une
  convention tacite : on sait toujours si une décision vient de la capture directe, de
  Tracearr ou de Tautulli, et un import ultérieur sait ce qu'il a le droit d'améliorer.
"""

import sqlalchemy as sa

from alembic import op

revision = "0014_playback_enrichment"
down_revision = "0013_notification_deliveries"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("playback_sessions") as batch:
        batch.alter_column("watched_ms", existing_type=sa.BigInteger(), nullable=True)
        batch.add_column(sa.Column("enrichment_sources", sa.Text(), nullable=True))


def downgrade():
    # Le retour arrière doit reboucher les trous : la colonne redevient NOT NULL, et une
    # durée inconnue ne peut alors être exprimée que par zéro.
    op.execute("UPDATE playback_sessions SET watched_ms = 0 WHERE watched_ms IS NULL")
    with op.batch_alter_table("playback_sessions") as batch:
        batch.drop_column("enrichment_sources")
        batch.alter_column("watched_ms", existing_type=sa.BigInteger(), nullable=False)
