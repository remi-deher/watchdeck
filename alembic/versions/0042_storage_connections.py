"""Separate SSH credentials from root mappings, preserving old profiles."""

import uuid

import sqlalchemy as sa

from alembic import op

revision = "0042_storage_connections"
down_revision = "0041_storage_accesses"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "storage_connections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("method", sa.String(), nullable=False),
        sa.Column("revision", sa.String(), nullable=False),
        sa.Column("connection", sa.JSON(), nullable=False),
        sa.Column("credentials", sa.Text()),
        sa.Column("fingerprint", sa.String(), nullable=False),
        sa.Column("tested", sa.Boolean(), nullable=False),
    )
    op.add_column("storage_accesses", sa.Column("connection_id", sa.Integer(), sa.ForeignKey("storage_connections.id")))
    bind = op.get_bind()
    accesses = sa.table(
        "storage_accesses",
        sa.column("id"),
        sa.column("name"),
        sa.column("method"),
        sa.column("connection", sa.JSON()),
        sa.column("credentials"),
        sa.column("connection_id"),
    )
    connections = sa.table(
        "storage_connections",
        sa.column("id"),
        sa.column("name"),
        sa.column("method"),
        sa.column("revision"),
        sa.column("connection", sa.JSON()),
        sa.column("credentials"),
        sa.column("fingerprint"),
        sa.column("tested"),
    )
    for row in bind.execute(sa.select(accesses)).mappings():
        conn = row["connection"] or {}
        new_id = bind.execute(
            connections.insert()
            .values(
                name=row["name"],
                method=row["method"],
                revision=uuid.uuid4().hex,
                connection=conn,
                credentials=row["credentials"],
                fingerprint=conn.get("fingerprint", ""),
                tested=False,
            )
            .returning(connections.c.id)
        ).scalar_one()
        bind.execute(
            accesses.update()
            .where(accesses.c.id == row["id"])
            .values(connection_id=new_id, connection={}, credentials=None)
        )


def downgrade():
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "UPDATE storage_accesses a SET connection=c.connection, credentials=c.credentials FROM storage_connections c WHERE a.connection_id=c.id"
        )
    )
    op.drop_column("storage_accesses", "connection_id")
    op.drop_table("storage_connections")
