"""Quotas de demandes par utilisateur (films / series sur une periode glissante)

Revision ID: 0035_request_quotas
Revises: 0034_trusted_proxies
Create Date: 2026-10-02
"""

import sqlalchemy as sa

from alembic import op

revision = "0035_request_quotas"
down_revision = "0034_trusted_proxies"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.add_column(sa.Column("quota_movie_limit", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("quota_show_limit", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("quota_period_days", sa.Integer(), nullable=False, server_default="7"))
    with op.batch_alter_table("plex_users") as batch_op:
        batch_op.add_column(sa.Column("quota_movie_limit", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("quota_show_limit", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("plex_users") as batch_op:
        batch_op.drop_column("quota_show_limit")
        batch_op.drop_column("quota_movie_limit")
    with op.batch_alter_table("settings") as batch_op:
        batch_op.drop_column("quota_period_days")
        batch_op.drop_column("quota_show_limit")
        batch_op.drop_column("quota_movie_limit")
