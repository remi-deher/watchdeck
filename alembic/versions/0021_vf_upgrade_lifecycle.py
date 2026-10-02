"""Relance automatique des ameliorations VF : guids deja tentes

Revision ID: 0021_vf_upgrade_lifecycle
Revises: 0020_vf_upgrade_grading
Create Date: 2026-09-14
"""

import sqlalchemy as sa

from alembic import op

revision = "0021_vf_upgrade_lifecycle"
down_revision = "0020_vf_upgrade_grading"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("vf_upgrade_suggestions") as batch_op:
        batch_op.add_column(sa.Column("attempted_guids_json", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("vf_upgrade_suggestions") as batch_op:
        batch_op.drop_column("attempted_guids_json")
