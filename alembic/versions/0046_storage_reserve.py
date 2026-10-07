"""Optional percentage reserve, preserving existing absolute reserves."""

import sqlalchemy as sa

from alembic import op

revision = "0046_storage_reserve"
down_revision = "0045_storage_inventory"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("storage_locations", sa.Column("reserve_percent", sa.Float(), nullable=True))


def downgrade():
    op.drop_column("storage_locations", "reserve_percent")
