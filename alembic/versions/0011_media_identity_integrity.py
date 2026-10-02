"""repair media identity links and add relational safeguards

Revision ID: 0011_media_identity_integrity
Revises: 0010_vf_upgrade_ignored_series
Create Date: 2026-08-27
"""

import sqlalchemy as sa

from alembic import op

revision = "0011_media_identity_integrity"
down_revision = "0010_vf_upgrade_ignored_series"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Generic repair first: a movie request can never point at a show LibraryItem,
    # regardless of external ids supplied by Plex agents.
    op.execute(
        """
        UPDATE media_requests AS request
           SET library_item_id = NULL
          FROM library_items AS item
         WHERE request.library_item_id = item.id
           AND (CASE WHEN request.media_type = 'movie' THEN 'movie' ELSE 'show' END) <> item.media_type
        """
    )

    # Production incident: Plex attached tvdb://358180 both to this show and to an
    # unrelated movie.  Restore the native show identity; the next typed Plex sync
    # creates a separate movie row and relinks its request.
    op.execute(
        """
        UPDATE library_items
           SET tmdb_id = '85841',
               tvdb_id = '358180',
               imdb_id = 'tt9826314',
               updated_at = CURRENT_TIMESTAMP
         WHERE plex_guid = 'plex://show/5d9c0918705e7a001e6ea4b7'
        """
    )

    # A request already proven by its linked Plex item must not remain technically
    # marked as awaiting Plex after a later Sonarr refresh.
    op.execute(
        """
        UPDATE media_requests AS request
           SET fulfillment_status = 'completed',
               fulfillment_updated_at = CURRENT_TIMESTAMP,
               fulfillment_error = NULL
          FROM library_items AS item
         WHERE request.library_item_id = item.id
           AND request.status = 'available'
           AND request.fulfillment_status = 'awaiting_plex'
           AND item.plex_guid IS NOT NULL
        """
    )

    # Les trois cles etrangeres ci-dessous sont declarees ON DELETE SET NULL : une
    # reference vers une ligne supprimee devrait donc deja valoir NULL. Sans contrainte
    # jusqu'ici, rien ne l'imposait, et toute base ayant vu disparaitre un library_item
    # ou une instance *arr conserve des references pendantes qui font echouer le
    # ALTER TABLE. On applique donc a posteriori la semantique que la contrainte
    # garantira desormais, plutot que de faire echouer la migration.
    op.execute(
        """
        UPDATE media_requests
           SET library_item_id = NULL
         WHERE library_item_id IS NOT NULL
           AND library_item_id NOT IN (SELECT id FROM library_items)
        """
    )
    op.execute(
        """
        UPDATE media_requests
           SET arr_instance_id = NULL
         WHERE arr_instance_id IS NOT NULL
           AND arr_instance_id NOT IN (SELECT id FROM arr_instances)
        """
    )
    op.execute(
        """
        UPDATE library_items
           SET arr_instance_id = NULL
         WHERE arr_instance_id IS NOT NULL
           AND arr_instance_id NOT IN (SELECT id FROM arr_instances)
        """
    )

    op.create_foreign_key(
        "fk_media_requests_library_item",
        "media_requests",
        "library_items",
        ["library_item_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_media_requests_arr_instance",
        "media_requests",
        "arr_instances",
        ["arr_instance_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_library_items_arr_instance",
        "library_items",
        "arr_instances",
        ["arr_instance_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "ck_media_requests_media_type",
        "media_requests",
        "media_type IN ('movie', 'show')",
    )
    op.create_check_constraint(
        "ck_library_items_media_type",
        "library_items",
        "media_type IN ('movie', 'show', 'artist', 'album', 'track')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_library_items_media_type", "library_items", type_="check")
    op.drop_constraint("ck_media_requests_media_type", "media_requests", type_="check")
    op.drop_constraint("fk_library_items_arr_instance", "library_items", type_="foreignkey")
    op.drop_constraint("fk_media_requests_arr_instance", "media_requests", type_="foreignkey")
    op.drop_constraint("fk_media_requests_library_item", "media_requests", type_="foreignkey")
