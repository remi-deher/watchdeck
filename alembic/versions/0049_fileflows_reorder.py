"""FileFlows queue interleaving by library (disabled by default)."""

import sqlalchemy as sa

from alembic import op

revision = "0049_fileflows_reorder"
down_revision = "0048_user_always_approval"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "settings",
        sa.Column("fileflows_reorder_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("settings", sa.Column("fileflows_reorder_libraries", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("settings", "fileflows_reorder_libraries")
    op.drop_column("settings", "fileflows_reorder_enabled")
