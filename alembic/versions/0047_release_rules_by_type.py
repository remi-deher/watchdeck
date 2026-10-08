"""Release rules of their own for series (size per episode, words)."""

import sqlalchemy as sa

from alembic import op

revision = "0047_release_rules_by_type"
down_revision = "0046_storage_reserve"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "settings", sa.Column("torrent_split_by_type", sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.add_column("settings", sa.Column("torrent_show_required_keywords", sa.String(), nullable=True))
    op.add_column("settings", sa.Column("torrent_show_forbidden_keywords", sa.String(), nullable=True))
    op.add_column("settings", sa.Column("torrent_show_min_size_gb", sa.Float(), nullable=True))
    op.add_column("settings", sa.Column("torrent_show_max_size_gb", sa.Float(), nullable=True))


def downgrade():
    for column in (
        "torrent_show_max_size_gb",
        "torrent_show_min_size_gb",
        "torrent_show_forbidden_keywords",
        "torrent_show_required_keywords",
        "torrent_split_by_type",
    ):
        op.drop_column("settings", column)
