"""Empreinte des sources de l'instantane analytique

Revision ID: 0023_analytics_fingerprint
Revises: 0022_vf_scan_watermark
Create Date: 2026-09-14
"""

import sqlalchemy as sa

from alembic import op

revision = "0023_analytics_fingerprint"
down_revision = "0022_vf_scan_watermark"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("library_analytics_snapshots") as batch_op:
        batch_op.add_column(sa.Column("source_fingerprint", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("library_analytics_snapshots") as batch_op:
        batch_op.drop_column("source_fingerprint")
