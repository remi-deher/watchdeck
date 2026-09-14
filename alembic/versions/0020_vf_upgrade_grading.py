"""Bareme VF gradue : acceptation VFQ explicite + erreurs techniques par cycle

Revision ID: 0020_vf_upgrade_grading
Revises: 0019_auto_import_reconciliation
Create Date: 2026-09-14
"""

import sqlalchemy as sa

from alembic import op

revision = "0020_vf_upgrade_grading"
down_revision = "0019_auto_import_reconciliation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.add_column(sa.Column("vf_upgrade_accept_vfq", sa.Boolean(), nullable=False, server_default=sa.false()))
    with op.batch_alter_table("vf_upgrade_scan_runs") as batch_op:
        batch_op.add_column(sa.Column("tasks_errored", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    with op.batch_alter_table("vf_upgrade_scan_runs") as batch_op:
        batch_op.drop_column("tasks_errored")
    with op.batch_alter_table("settings") as batch_op:
        batch_op.drop_column("vf_upgrade_accept_vfq")
