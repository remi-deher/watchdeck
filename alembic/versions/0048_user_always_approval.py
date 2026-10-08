"""Per-account option: every request of this account waits for an administrator."""

import sqlalchemy as sa

from alembic import op

revision = "0048_user_always_approval"
down_revision = "0047_release_rules_by_type"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "plex_users",
        sa.Column("always_require_approval", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column("plex_users", "always_require_approval")
