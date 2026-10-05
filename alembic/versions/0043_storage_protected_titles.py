"""Durable title exclusions for storage planning."""

import sqlalchemy as sa

from alembic import op

revision = "0043_storage_protected_titles"
down_revision = "0042_storage_connections"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "storage_protected_titles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "arr_instance_id", sa.Integer(), sa.ForeignKey("arr_instances.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("arr_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
    )
    op.create_index("ix_storage_protected_arr", "storage_protected_titles", ["arr_instance_id", "arr_id"], unique=True)


def downgrade():
    op.drop_table("storage_protected_titles")
