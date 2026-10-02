"""Intervalles réglables pour les tâches jusqu'ici figées.

Six tâches planifiées portaient leur cadence en dur dans le code : la page Planification
les affichait avec un intervalle « Toutes les 10 minutes » qu'aucun réglage ne permettait
de changer. Chaque colonne prend pour valeur par défaut exactement la constante qu'elle
remplace, de sorte que la migration ne modifie le comportement d'aucune installation :
elle rend simplement modifiable ce qui ne l'était pas.
"""

import sqlalchemy as sa

from alembic import op

revision = "0016_configurable_job_intervals"
down_revision = "0015_tracearr_connection"
branch_labels = None
depends_on = None

# (colonne, type, defaut) — le defaut reprend la constante actuelle du job.
COLUMNS = (
    ("arr_queue_interval_seconds", sa.Integer(), "60"),
    ("torrent_status_interval_seconds", sa.Integer(), "120"),
    ("new_vff_interval_seconds", sa.Integer(), "60"),
    ("seer_sync_interval_minutes", sa.Integer(), "60"),
    ("library_analytics_interval_minutes", sa.Integer(), "10"),
    ("notification_purge_hour", sa.Integer(), "3"),
)


def upgrade():
    with op.batch_alter_table("settings") as batch:
        for name, kind, default in COLUMNS:
            batch.add_column(sa.Column(name, kind, nullable=False, server_default=default))


def downgrade():
    with op.batch_alter_table("settings") as batch:
        for name, _kind, _default in reversed(COLUMNS):
            batch.drop_column(name)
