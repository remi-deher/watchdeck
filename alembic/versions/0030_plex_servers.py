"""Plusieurs serveurs Plex : table des serveurs et emplacements des medias

Revision ID: 0030_plex_servers
Revises: 0029_playback_audio_channels
Create Date: 2026-10-01
"""

import sqlalchemy as sa

from alembic import op

revision = "0030_plex_servers"
down_revision = "0029_playback_audio_channels"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plex_servers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("url", sa.String(), nullable=True),
        sa.Column("token", sa.Text(), nullable=True),
        sa.Column("libraries", sa.Text(), nullable=True),
        sa.Column("machine_identifier", sa.String(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    # Un seul serveur principal : sa connexion reste dans settings (plex_url/plex_token).
    op.create_index(
        "uq_plex_servers_primary",
        "plex_servers",
        ["is_primary"],
        unique=True,
        postgresql_where=sa.text("is_primary"),
    )
    op.execute(
        "INSERT INTO plex_servers (name, is_primary, enabled, created_at) "
        "VALUES ('Serveur principal', true, true, now() at time zone 'utc')"
    )

    op.create_table(
        "library_item_locations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "library_item_id",
            sa.Integer(),
            sa.ForeignKey("library_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "server_id",
            sa.Integer(),
            sa.ForeignKey("plex_servers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rating_key", sa.String(), nullable=False),
        sa.Column("plex_guid", sa.String(), nullable=True),
        sa.Column("seen_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("server_id", "rating_key", name="uq_library_item_location_server_key"),
    )
    op.create_index("ix_library_item_locations_item", "library_item_locations", ["library_item_id"])
    op.create_index("ix_library_item_locations_server_id", "library_item_locations", ["server_id"])


def downgrade() -> None:
    op.drop_index("ix_library_item_locations_server_id", table_name="library_item_locations")
    op.drop_index("ix_library_item_locations_item", table_name="library_item_locations")
    op.drop_table("library_item_locations")
    op.drop_index("uq_plex_servers_primary", table_name="plex_servers")
    op.drop_table("plex_servers")
