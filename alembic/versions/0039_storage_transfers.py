"""Durable storage targets and manual transfers.

Revision ID: 0039_storage_transfers
Revises: 0038_indexer_alerts
"""

import sqlalchemy as sa

from alembic import op

revision = "0039_storage_transfers"
down_revision = "0038_indexer_alerts"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "storage_locations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("mount_path", sa.String(), nullable=False),
        sa.Column("mappings", sa.JSON(), nullable=False),
        sa.Column("reserve_bytes", sa.BigInteger(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("free_bytes", sa.BigInteger()),
        sa.Column("checked_at", sa.DateTime()),
        sa.Column("health", sa.String(), nullable=False),
    )
    op.create_table(
        "storage_transfers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_id", sa.Integer(), sa.ForeignKey("storage_locations.id"), nullable=False),
        sa.Column("destination_id", sa.Integer(), sa.ForeignKey("storage_locations.id"), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("desired_state", sa.String(), nullable=False),
        sa.Column("auto_resume", sa.Boolean(), nullable=False),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("worker_seen_at", sa.DateTime()),
        sa.Column("error", sa.String()),
    )
    op.create_index("ix_storage_transfers_status", "storage_transfers", ["status"])
    op.create_table(
        "storage_transfer_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "transfer_id", sa.Integer(), sa.ForeignKey("storage_transfers.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("arr_instance_id", sa.Integer(), sa.ForeignKey("arr_instances.id"), nullable=False),
        sa.Column("arr_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("media_type", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("proofs", sa.JSON(), nullable=False),
        sa.Column("progress", sa.JSON(), nullable=False),
        sa.Column("reason", sa.String()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_storage_transfer_items_transfer_id", "storage_transfer_items", ["transfer_id"])
    op.create_index("ix_storage_transfer_item_arr", "storage_transfer_items", ["arr_instance_id", "arr_id"])


def downgrade():
    op.drop_table("storage_transfer_items")
    op.drop_table("storage_transfers")
    op.drop_table("storage_locations")
