"""Validated rsync execution endpoints."""

import sqlalchemy as sa

from alembic import op

revision = "0041_storage_accesses"
down_revision = "0040_storage_capacity"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "storage_accesses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("method", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("revision", sa.String(), nullable=False),
        sa.Column("connection", sa.JSON(), nullable=False),
        sa.Column("credentials", sa.Text(), nullable=True),
        sa.Column("roots", sa.JSON(), nullable=False),
        sa.Column("validation", sa.JSON(), nullable=False),
    )


def downgrade():
    op.drop_table("storage_accesses")
