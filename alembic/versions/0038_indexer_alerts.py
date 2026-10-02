"""Alerte quand un indexeur Prowlarr tombe ou revient

Revision ID: 0038_indexer_alerts
Revises: 0037_newsletter
Create Date: 2026-10-02
"""

import sqlalchemy as sa

from alembic import op

revision = "0038_indexer_alerts"
down_revision = "0037_newsletter"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.add_column(sa.Column("indexer_alerts_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.drop_column("indexer_alerts_enabled")
