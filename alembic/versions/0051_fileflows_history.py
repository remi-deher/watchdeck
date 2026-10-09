"""FileFlows processing history (before/after summaries, timings) and alert channels."""

import sqlalchemy as sa

from alembic import op

revision = "0051_fileflows_history"
down_revision = "0050_fileflows_control"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "fileflows_processing",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("file_uid", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=True),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("library", sa.String(), nullable=True),
        sa.Column("disk", sa.String(), nullable=True),
        sa.Column("flow", sa.String(), nullable=True),
        sa.Column(
            "library_item_id", sa.Integer(), sa.ForeignKey("library_items.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=False),
        sa.Column("total_seconds", sa.Float(), nullable=True),
        sa.Column("wait_seconds", sa.Float(), nullable=True),
        sa.Column("processing_seconds", sa.Float(), nullable=True),
        sa.Column("original_size", sa.BigInteger(), nullable=True),
        sa.Column("final_size", sa.BigInteger(), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("before", sa.JSON(), nullable=True),
        sa.Column("after", sa.JSON(), nullable=True),
        sa.Column("steps", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("file_uid", "ended_at", name="uq_fileflows_processing_run"),
    )
    op.create_index("ix_fileflows_processing_file_uid", "fileflows_processing", ["file_uid"])
    op.create_index("ix_fileflows_processing_disk", "fileflows_processing", ["disk"])
    op.create_index("ix_fileflows_processing_library_item_id", "fileflows_processing", ["library_item_id"])
    op.create_index("ix_fileflows_processing_ended", "fileflows_processing", ["ended_at"])
    op.add_column("settings", sa.Column("fileflows_alert_channels", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("settings", "fileflows_alert_channels")
    op.drop_table("fileflows_processing")
