"""FileFlows control: runners mode, pause during Plex playback, Plex location mapping."""

import sqlalchemy as sa

from alembic import op

revision = "0050_fileflows_control"
down_revision = "0049_fileflows_reorder"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("settings", sa.Column("fileflows_runners_mode", sa.String(), nullable=False, server_default="manual"))
    op.add_column("settings", sa.Column("fileflows_plex_pause", sa.String(), nullable=False, server_default="off"))
    op.add_column(
        "settings",
        sa.Column("fileflows_plex_pause_relaunched", sa.String(), nullable=False, server_default="follow"),
    )
    op.add_column(
        "settings", sa.Column("fileflows_plex_resume_minutes", sa.Integer(), nullable=False, server_default="5")
    )
    op.add_column("settings", sa.Column("fileflows_plex_locations", sa.Text(), nullable=True))


def downgrade():
    for column in (
        "fileflows_plex_locations",
        "fileflows_plex_resume_minutes",
        "fileflows_plex_pause_relaunched",
        "fileflows_plex_pause",
        "fileflows_runners_mode",
    ):
        op.drop_column("settings", column)
