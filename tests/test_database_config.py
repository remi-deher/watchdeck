from app.database import postgres_engine_kwargs


def test_postgres_pool_defaults(monkeypatch):
    for name in ("DB_POOL_SIZE", "DB_MAX_OVERFLOW", "DB_POOL_TIMEOUT", "DB_POOL_RECYCLE"):
        monkeypatch.delenv(name, raising=False)

    assert postgres_engine_kwargs() == {
        "pool_pre_ping": True,
        "pool_size": 15,
        "max_overflow": 15,
        "pool_timeout": 30,
        "pool_recycle": 1800,
    }


def test_postgres_pool_accepts_environment_overrides(monkeypatch):
    monkeypatch.setenv("DB_POOL_SIZE", "20")
    monkeypatch.setenv("DB_MAX_OVERFLOW", "10")
    monkeypatch.setenv("DB_POOL_TIMEOUT", "12")
    monkeypatch.setenv("DB_POOL_RECYCLE", "900")

    options = postgres_engine_kwargs()

    assert options["pool_size"] == 20
    assert options["max_overflow"] == 10
    assert options["pool_timeout"] == 12
    assert options["pool_recycle"] == 900
