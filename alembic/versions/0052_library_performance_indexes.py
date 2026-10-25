"""Indexes de performance pour la bibliothèque et les résolutions d'identité."""

import sqlalchemy as sa
from alembic import op

revision = "0052_library_performance_indexes"
down_revision = "0051_fileflows_history"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_media_requests_plex_guid", "media_requests", ["plex_guid"])
    op.create_index("ix_media_requests_imdb_id", "media_requests", ["imdb_id"])
    op.create_index(
        "ix_library_items_type_added",
        "library_items",
        ["media_type", sa.text("added_at DESC"), "title", "id"],
    )
    op.create_index(
        "ix_library_items_type_title",
        "library_items",
        ["media_type", "title", "id"],
    )


def downgrade():
    op.drop_index("ix_library_items_type_title", table_name="library_items")
    op.drop_index("ix_library_items_type_added", table_name="library_items")
    op.drop_index("ix_media_requests_imdb_id", table_name="media_requests")
    op.drop_index("ix_media_requests_plex_guid", table_name="media_requests")
