"""Indexeurs exclus de l'alerte de panne

Revision ID: 0056_indexer_alerts_muted
Revises: 0055_collection_projections
Create Date: 2026-11-19
"""

import sqlalchemy as sa

from alembic import op

revision = "0056_indexer_alerts_muted"
down_revision = "0055_collection_projections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.add_column(sa.Column("indexer_alerts_muted", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.drop_column("indexer_alerts_muted")
