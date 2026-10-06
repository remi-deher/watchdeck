"""Independent Arr/Plex observations for storage planning."""

import sqlalchemy as sa

from alembic import op

revision = "0045_storage_inventory"
down_revision = "0044_storage_item_claims"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "storage_inventory",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("endpoint_id", sa.Integer(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("endpoint_revision", sa.String(), nullable=False),
        sa.Column("media_type", sa.String(), nullable=False),
        sa.Column("provider_id", sa.String()),
        sa.Column("present", sa.Boolean(), nullable=False),
        sa.Column("observed_at", sa.DateTime(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.UniqueConstraint("source", "endpoint_id", "entity_id", name="uq_storage_inventory_entity"),
    )
    op.create_index("ix_storage_inventory_identity", "storage_inventory", ["source", "endpoint_id", "provider_id"])
    op.create_table(
        "storage_inventory_scopes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("endpoint_id", sa.Integer(), nullable=False),
        sa.Column("endpoint_revision", sa.String(), nullable=False),
        sa.Column("observed_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("source", "endpoint_id", name="uq_storage_inventory_scope"),
    )


def downgrade():
    op.drop_table("storage_inventory_scopes")
    op.drop_table("storage_inventory")
