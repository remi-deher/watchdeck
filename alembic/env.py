import os
import sys
from logging.config import fileConfig

from sqlalchemy import create_engine, inspect, pool, text

from alembic import context

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.database import async_database_url
from app.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _sync_url(url: str) -> str:
    """Alembic tourne en synchrone : l'URL applicative (asyncpg) passe sur psycopg2."""
    return "postgresql+psycopg2://" + async_database_url(url).split("://", 1)[1]


def run_migrations_offline() -> None:
    url = os.environ.get("DATABASE_URL") or config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = _sync_url(os.environ.get("DATABASE_URL") or config.get_main_option("sqlalchemy.url"))
    engine = create_engine(url, poolclass=pool.NullPool)
    with engine.connect() as connection:
        if inspect(connection).has_table("alembic_version"):
            connection.execute(text("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)"))
        else:
            connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(128) NOT NULL PRIMARY KEY)"))
        connection.commit()
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
