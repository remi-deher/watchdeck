"""Version de session par compte, pour revoquer les sessions ouvertes

Revision ID: 0033_session_version
Revises: 0032_message_reasons_cleanup
Create Date: 2026-10-01
"""

import sqlalchemy as sa

from alembic import op

revision = "0033_session_version"
down_revision = "0032_message_reasons_cleanup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("plex_users") as batch_op:
        batch_op.add_column(sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    with op.batch_alter_table("plex_users") as batch_op:
        batch_op.drop_column("session_version")
