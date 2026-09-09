"""Un seul vocabulaire pour les statuts de signalement.

L'API acceptait quatre statuts — ``open``, ``investigating``, ``resolved`` et
``closed`` — mais l'interface n'en proposait que trois et n'écrivait jamais
``resolved`` : deux mots pour la même idée, dont un que rien ne permettait d'atteindre.
Les signalements déjà marqués ``resolved`` basculent vers ``closed``, qui devient le
seul état terminal.
"""

from alembic import op

revision = "0017_issue_status_vocabulary"
down_revision = "0016_configurable_job_intervals"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("UPDATE media_issues SET status = 'closed' WHERE status = 'resolved'")


def downgrade():
    # Irréversible : rien ne distingue plus un signalement clos d'un signalement résolu.
    # Le retour arrière laisse donc les lignes en l'état plutôt que d'inventer une
    # répartition.
    pass
