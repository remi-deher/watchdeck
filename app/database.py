"""
Database access layer for SQLAlchemy.

PostgreSQL is the only supported engine: DATABASE_URL must point to it (any of the
postgresql://, postgres://, postgresql+psycopg2:// or postgresql+asyncpg:// forms).
"""

import asyncio
import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.future import select
from sqlalchemy.orm import declarative_base

POSTGRES_URL_PREFIXES = ("postgresql+asyncpg://", "postgresql+psycopg2://", "postgresql://", "postgres://")


def async_database_url(url: str) -> str:
    """Normalise une URL PostgreSQL vers le pilote asyncpg ; refuse tout autre moteur."""
    for prefix in POSTGRES_URL_PREFIXES:
        if url.startswith(prefix):
            return "postgresql+asyncpg://" + url[len(prefix) :]
    raise RuntimeError(
        "DATABASE_URL doit pointer vers PostgreSQL (postgresql://utilisateur:motdepasse@hote:5432/base). "
        "SQLite n'est plus pris en charge."
    )


DATABASE_URL = os.getenv("DATABASE_URL", "")
ASYNC_DATABASE_URL = async_database_url(DATABASE_URL)


def postgres_engine_kwargs() -> dict[str, object]:
    """Return the bounded, environment-configurable PostgreSQL pool settings."""
    return {
        "pool_pre_ping": True,
        "pool_size": int(os.getenv("DB_POOL_SIZE", "15")),
        "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "15")),
        "pool_timeout": int(os.getenv("DB_POOL_TIMEOUT", "30")),
        "pool_recycle": int(os.getenv("DB_POOL_RECYCLE", "1800")),
    }


# Keep enough headroom for bursts caused by slow external integrations without consuming
# PostgreSQL's whole connection budget. Values remain configurable for installations with
# a different database capacity.
async_engine = create_async_engine(ASYNC_DATABASE_URL, **postgres_engine_kwargs())
AsyncSessionLocal = async_sessionmaker(async_engine, expire_on_commit=False, class_=AsyncSession)

Base = declarative_base()


async def get_db_async():
    async with AsyncSessionLocal() as db:
        yield db


def run_migrations():
    """Run Alembic migrations in a subprocess with retries."""
    import logging
    import subprocess
    import sys
    import time

    max_retries = 5
    for attempt in range(1, max_retries + 1):
        try:
            subprocess.run(
                [sys.executable, "-m", "alembic", "upgrade", "head"],
                capture_output=False,
                check=True,
            )
            return
        except subprocess.CalledProcessError as e:
            if attempt == max_retries:
                logging.error(f"Failed to run migrations after {max_retries} attempts.")
                raise e
            logging.warning(
                f"Database not ready or migration failed, retrying in 5 seconds (attempt {attempt}/{max_retries})..."
            )
            time.sleep(5)


async def seed_defaults():
    """Create default Settings and local admin user rows when needed."""
    import secrets

    from .models import PlexUser, Settings

    async with AsyncSessionLocal() as db:
        s = (await db.execute(select(Settings))).scalars().first()
        if not s:
            s = Settings(id=1)
            db.add(s)
            await db.flush()
        if not s.webhook_secret:
            s.webhook_secret = secrets.token_urlsafe(32)

        if s.auth_username:
            admin_user = (
                (await db.execute(select(PlexUser).filter(PlexUser.plex_user_id == s.auth_username))).scalars().first()
            )
            if not admin_user:
                admin_user = PlexUser(
                    plex_user_id=s.auth_username,
                    display_name="Administrateur",
                    role="admin",
                    can_login=True,
                    enabled=True,
                    source="local",
                    password_hash=s.auth_password_hash,
                    totp_secret=s.totp_secret,
                    totp_enabled=s.totp_enabled,
                )
                db.add(admin_user)
            else:
                if admin_user.password_hash != s.auth_password_hash:
                    admin_user.password_hash = s.auth_password_hash
                if admin_user.totp_secret != s.totp_secret:
                    admin_user.totp_secret = s.totp_secret
                if admin_user.totp_enabled != s.totp_enabled:
                    admin_user.totp_enabled = s.totp_enabled

        await db.commit()


async def init_db():
    """Initialize the DB: schema migrations, then defaults."""
    await asyncio.to_thread(run_migrations)
    await seed_defaults()
