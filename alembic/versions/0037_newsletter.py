"""Lettre hebdomadaire « Nouveautes de la semaine »

Revision ID: 0037_newsletter
Revises: 0036_subtitle_search
Create Date: 2026-10-02
"""

import sqlalchemy as sa

from alembic import op

revision = "0037_newsletter"
down_revision = "0036_subtitle_search"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.add_column(sa.Column("newsletter_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("newsletter_weekday", sa.Integer(), nullable=False, server_default="4"))
        batch_op.add_column(sa.Column("newsletter_hour", sa.Integer(), nullable=False, server_default="18"))
        batch_op.add_column(sa.Column("newsletter_discord", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("newsletter_last_sent_at", sa.DateTime(), nullable=True))
    with op.batch_alter_table("plex_users") as batch_op:
        batch_op.add_column(sa.Column("notify_newsletter", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table("plex_users") as batch_op:
        batch_op.drop_column("notify_newsletter")
    with op.batch_alter_table("settings") as batch_op:
        batch_op.drop_column("newsletter_last_sent_at")
        batch_op.drop_column("newsletter_discord")
        batch_op.drop_column("newsletter_hour")
        batch_op.drop_column("newsletter_weekday")
        batch_op.drop_column("newsletter_enabled")
