"""Replace global planning locks with durable, per-title reservations."""

import sqlalchemy as sa

from alembic import op

revision = "0044_storage_item_claims"
down_revision = "0043_storage_protected_titles"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("storage_locations", sa.Column("virtual_key", sa.String(), nullable=True))
    op.create_index("uq_storage_locations_virtual_key", "storage_locations", ["virtual_key"], unique=True)

    # Give existing Arr virtual roots a stable identity so parallel read-only
    # previews cannot create duplicate storage rows for the same root.
    bind = op.get_bind()
    locations = sa.table(
        "storage_locations",
        sa.column("id", sa.Integer()),
        sa.column("mount_path", sa.String()),
        sa.column("mappings", sa.JSON()),
        sa.column("virtual_key", sa.String()),
    )
    seen = set()
    for row in bind.execute(
        sa.select(locations.c.id, locations.c.mappings).where(locations.c.mount_path == "")
    ).mappings():
        mappings = row["mappings"] or []
        if len(mappings) != 1:
            continue
        mapping = mappings[0]
        instance_id, root = mapping.get("arr_instance_id"), mapping.get("arr_root")
        if instance_id is None or not root:
            continue
        key = f"{instance_id}:{root}"
        if key in seen:
            continue
        seen.add(key)
        bind.execute(locations.update().where(locations.c.id == row["id"]).values(virtual_key=key))

    op.add_column(
        "storage_transfer_items",
        sa.Column("claimed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Drafts do not reserve media. Existing queued, paused, blocked, and running
    # tasks keep their title reserved across deployment and worker restarts.
    bind.execute(
        sa.text(
            """
            UPDATE storage_transfer_items AS item
               SET claimed = TRUE
              FROM storage_transfers AS transfer
             WHERE transfer.id = item.transfer_id
               AND transfer.status NOT IN ('draft', 'completed', 'cancelled')
               AND item.status NOT IN ('completed', 'cancelled')
            """
        )
    )
    op.create_index(
        "uq_storage_transfer_item_claimed_arr",
        "storage_transfer_items",
        ["arr_instance_id", "arr_id"],
        unique=True,
        postgresql_where=sa.text("claimed IS TRUE"),
    )


def downgrade():
    op.drop_index("uq_storage_transfer_item_claimed_arr", table_name="storage_transfer_items")
    op.drop_column("storage_transfer_items", "claimed")
    op.drop_index("uq_storage_locations_virtual_key", table_name="storage_locations")
    op.drop_column("storage_locations", "virtual_key")
