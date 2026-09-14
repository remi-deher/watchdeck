"""Filigrane de la resynchronisation de disponibilite episode

Revision ID: 0024_episode_availability_watermark
Revises: 0023_analytics_fingerprint
Create Date: 2026-09-14
"""

import sqlalchemy as sa

from alembic import op

revision = "0024_episode_availability_watermark"
down_revision = "0023_analytics_fingerprint"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.add_column(sa.Column("episode_availability_last_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.drop_column("episode_availability_last_at")
