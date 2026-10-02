"""Motif libre attache a une notification

Revision ID: 0025_notification_log_reason
Revises: 0024_episode_availability_watermark
Create Date: 2026-09-21
"""

import sqlalchemy as sa

from alembic import op

revision = "0025_notification_log_reason"
down_revision = "0024_episode_availability_watermark"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("notification_logs") as batch_op:
        batch_op.add_column(sa.Column("reason", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("notification_logs") as batch_op:
        batch_op.drop_column("reason")
