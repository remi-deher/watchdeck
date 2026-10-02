"""Recherche de sous-titres francais (Plex a la demande ou Bazarr)

Revision ID: 0036_subtitle_search
Revises: 0035_request_quotas
Create Date: 2026-10-02
"""

import sqlalchemy as sa

from alembic import op

revision = "0036_subtitle_search"
down_revision = "0035_request_quotas"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.add_column(
            sa.Column("subtitle_search_enabled", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch_op.add_column(sa.Column("subtitle_search_provider", sa.String(), nullable=False, server_default="auto"))
        batch_op.add_column(
            sa.Column("subtitle_search_interval_hours", sa.Integer(), nullable=False, server_default="6")
        )
        batch_op.add_column(sa.Column("subtitle_search_batch_size", sa.Integer(), nullable=False, server_default="20"))
    with op.batch_alter_table("library_items") as batch_op:
        batch_op.add_column(sa.Column("subtitle_searched_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("subtitle_search_result", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("library_items") as batch_op:
        batch_op.drop_column("subtitle_search_result")
        batch_op.drop_column("subtitle_searched_at")
    with op.batch_alter_table("settings") as batch_op:
        batch_op.drop_column("subtitle_search_batch_size")
        batch_op.drop_column("subtitle_search_interval_hours")
        batch_op.drop_column("subtitle_search_provider")
        batch_op.drop_column("subtitle_search_enabled")
