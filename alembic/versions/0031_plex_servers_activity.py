"""Plusieurs serveurs Plex : serveur des lectures, Tautulli par serveur, routage Arr

Revision ID: 0031_plex_servers_activity
Revises: 0030_plex_servers
Create Date: 2026-10-01
"""

import sqlalchemy as sa

from alembic import op

revision = "0031_plex_servers_activity"
down_revision = "0030_plex_servers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("playback_sessions", sa.Column("server_id", sa.Integer(), nullable=True))
    op.create_index("ix_playback_sessions_server_id", "playback_sessions", ["server_id"])
    op.add_column("plex_servers", sa.Column("tautulli_url", sa.String(), nullable=True))
    op.add_column("plex_servers", sa.Column("tautulli_api_key", sa.Text(), nullable=True))
    op.add_column(
        "arr_instances",
        sa.Column(
            "plex_server_id",
            sa.Integer(),
            sa.ForeignKey("plex_servers.id", name="fk_arr_instances_plex_server", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_constraint("fk_arr_instances_plex_server", "arr_instances", type_="foreignkey")
    op.drop_column("arr_instances", "plex_server_id")
    op.drop_column("plex_servers", "tautulli_api_key")
    op.drop_column("plex_servers", "tautulli_url")
    op.drop_index("ix_playback_sessions_server_id", table_name="playback_sessions")
    op.drop_column("playback_sessions", "server_id")
