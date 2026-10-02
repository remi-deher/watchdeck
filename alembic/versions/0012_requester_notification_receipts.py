"""track successful notifications per requester

Revision ID: 0012_requester_receipts
Revises: 0011_media_identity_integrity
Create Date: 2026-08-27
"""

import sqlalchemy as sa

from alembic import op

revision = "0012_requester_receipts"
down_revision = "0011_media_identity_integrity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "requester_notification_receipts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("req_id", sa.Integer(), nullable=False),
        sa.Column("plex_user_id", sa.String(), nullable=False),
        sa.Column("event_key", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["req_id"], ["media_requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("req_id", "plex_user_id", "event_key", name="uq_requester_notification_receipt"),
    )
    op.create_index("ix_requester_notification_receipts_created_at", "requester_notification_receipts", ["created_at"])
    op.create_index("ix_requester_notification_receipts_req_id", "requester_notification_receipts", ["req_id"])
    op.create_index(
        "ix_requester_notification_receipts_plex_user_id", "requester_notification_receipts", ["plex_user_id"]
    )

    # Legacy flags reliably describe the primary requester's delivery. Extras are
    # intentionally not backfilled: their missing mail is the incident repaired here.
    op.execute(
        """
        INSERT INTO requester_notification_receipts (created_at, req_id, plex_user_id, event_key)
        SELECT CURRENT_TIMESTAMP, id, plex_user_id, 'request'
          FROM media_requests
         WHERE request_mail_sent = TRUE
        """
    )
    op.execute(
        """
        INSERT INTO requester_notification_receipts (created_at, req_id, plex_user_id, event_key)
        SELECT CURRENT_TIMESTAMP, id, plex_user_id, 'available'
          FROM media_requests
         WHERE available_mail_sent = TRUE
        """
    )


def downgrade() -> None:
    op.drop_index("ix_requester_notification_receipts_plex_user_id", table_name="requester_notification_receipts")
    op.drop_index("ix_requester_notification_receipts_req_id", table_name="requester_notification_receipts")
    op.drop_index("ix_requester_notification_receipts_created_at", table_name="requester_notification_receipts")
    op.drop_table("requester_notification_receipts")
