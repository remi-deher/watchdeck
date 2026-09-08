"""Durable unique notification delivery ledger."""

import sqlalchemy as sa

from alembic import op

revision = "0013_notification_deliveries"
down_revision = "0012_requester_receipts"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "notification_deliveries",
        sa.Column("send_key", sa.String(), primary_key=True),
        sa.Column("req_id", sa.Integer(), nullable=False),
        sa.Column("event", sa.String(), nullable=False),
        sa.Column("recipient", sa.String(), nullable=False),
        sa.Column("state", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("provider_id", sa.Integer(), nullable=True),
        sa.Column("provider_message_id", sa.String(), nullable=True),
        sa.Column("detail", sa.String(), nullable=True),
    )
    op.create_index("ix_notification_deliveries_req_id", "notification_deliveries", ["req_id"])
    op.create_index("ix_notification_deliveries_state", "notification_deliveries", ["state"])


def downgrade():
    op.drop_table("notification_deliveries")
