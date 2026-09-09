"""Motifs réutilisables pour les annulations et les corrections.

Un administrateur qui annule une demande écrivait son explication à la main, à chaque
fois : le même refus se formulait différemment d'une fois à l'autre, et les tournures les
plus utiles se perdaient. La table porte un libellé — ce qu'on choisit dans la liste — et
le message envoyé au demandeur, modifiable.
"""

import sqlalchemy as sa

from alembic import op

revision = "0018_message_reasons"
down_revision = "0017_issue_status_vocabulary"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "message_reasons",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_message_reasons_event", "message_reasons", ["event"])


def downgrade():
    op.drop_index("ix_message_reasons_event", table_name="message_reasons")
    op.drop_table("message_reasons")
