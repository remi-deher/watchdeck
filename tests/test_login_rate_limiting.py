"""Protection contre la force brute sur /login.

Le mecanisme existait (compteur de tentatives echouees par IP sur une fenetre
glissante, voir app/routers/auth.py) mais n'etait couvert par aucun test : une
regression l'aurait desactive silencieusement, et rien n'aurait echoue. C'est
precisement le genre de protection dont la panne ne se voit pas -- tout continue
de fonctionner, simplement plus rien ne freine un attaquant.

Les quatre proprietes verifiees ici sont celles qui rendent la protection utile :
sans la fenetre glissante elle bloquerait definitivement, sans le filtre sur les
echecs une utilisation normale finirait par se bloquer elle-meme, et sans le
cloisonnement par IP un seul attaquant bloquerait tout le monde.
"""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async
from app.main import app
from app.models import LoginAttempt, Settings
from app.routers.auth import _MAX_ATTEMPTS, _WINDOW_SECONDS, _is_rate_limited, _record_login_attempt
from app.utils import now_utc_naive

IP = "203.0.113.7"


def _attempt(ip: str, *, success: bool, age_seconds: int = 0) -> LoginAttempt:
    return LoginAttempt(
        ip_address=ip,
        username="admin",
        success=success,
        reason=None if success else "bad_credentials",
        attempted_at=now_utc_naive() - timedelta(seconds=age_seconds),
    )


@pytest.mark.asyncio
async def test_under_the_limit_is_not_blocked(async_db):
    async_db.add_all([_attempt(IP, success=False) for _ in range(_MAX_ATTEMPTS - 1)])
    async_db.commit()

    assert await _is_rate_limited(async_db, IP) is False


@pytest.mark.asyncio
async def test_reaching_the_limit_blocks(async_db):
    async_db.add_all([_attempt(IP, success=False) for _ in range(_MAX_ATTEMPTS)])
    async_db.commit()

    assert await _is_rate_limited(async_db, IP) is True


@pytest.mark.asyncio
async def test_successful_logins_never_count_towards_the_limit(async_db):
    """Sinon une utilisation parfaitement normale finirait par se bloquer elle-meme."""
    async_db.add_all([_attempt(IP, success=True) for _ in range(_MAX_ATTEMPTS * 2)])
    async_db.commit()

    assert await _is_rate_limited(async_db, IP) is False


@pytest.mark.asyncio
async def test_attempts_older_than_the_window_are_forgotten(async_db):
    """La fenetre est glissante : sans cela, un blocage serait definitif."""
    async_db.add_all([_attempt(IP, success=False, age_seconds=_WINDOW_SECONDS + 60) for _ in range(_MAX_ATTEMPTS * 2)])
    async_db.commit()

    assert await _is_rate_limited(async_db, IP) is False


@pytest.mark.asyncio
async def test_the_limit_is_isolated_per_ip(async_db):
    """Un attaquant ne doit pas pouvoir bloquer la connexion des autres utilisateurs."""
    async_db.add_all([_attempt("198.51.100.4", success=False) for _ in range(_MAX_ATTEMPTS * 2)])
    async_db.commit()

    assert await _is_rate_limited(async_db, IP) is False
    assert await _is_rate_limited(async_db, "198.51.100.4") is True


@pytest.mark.asyncio
async def test_failed_attempts_are_persisted_so_the_counter_can_grow(async_db):
    """Le compteur ne sert a rien si les echecs ne sont pas enregistres."""
    for _ in range(_MAX_ATTEMPTS):
        await _record_login_attempt(async_db, IP, "admin", False, "bad_credentials")

    assert await _is_rate_limited(async_db, IP) is True


def test_login_endpoint_returns_429_once_the_limit_is_reached(async_db):
    """Verification de bout en bout : le refus intervient bien AVANT toute
    verification d'identifiants, donc sans reveler si le compte existe."""
    async_db.add(Settings(id=1, auth_username="admin", auth_password_hash="hash"))
    # TestClient se presente toujours avec l'hote « testclient ».
    async_db.add_all([_attempt("testclient", success=False) for _ in range(_MAX_ATTEMPTS)])
    async_db.commit()

    app.dependency_overrides[get_db_async] = lambda: async_db
    try:
        client = TestClient(app, raise_server_exceptions=False)
        response = client.post("/login", data={"username": "admin", "password": "peu importe"})
        assert response.status_code == 429
        assert "Trop de tentatives" in response.json()["detail"]
    finally:
        app.dependency_overrides.pop(get_db_async, None)
