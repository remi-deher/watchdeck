"""Reverse-proxies de confiance, pour lire l'IP reelle des clients

Revision ID: 0034_trusted_proxies
Revises: 0033_session_version
Create Date: 2026-10-01
"""

import sqlalchemy as sa

from alembic import op

revision = "0034_trusted_proxies"
down_revision = "0033_session_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.add_column(sa.Column("trusted_proxies", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.drop_column("trusted_proxies")
