"""Storage capacity telemetry."""

import sqlalchemy as sa

from alembic import op

revision = "0040_storage_capacity"
down_revision = "0039_storage_transfers"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("storage_locations", sa.Column("total_bytes", sa.BigInteger(), nullable=True))


def downgrade():
    op.drop_column("storage_locations", "total_bytes")
