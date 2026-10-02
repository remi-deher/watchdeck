"""Quotas de demandes par utilisateur (films / series sur une periode glissante)."""

from datetime import timedelta

import pytest
from fastapi import HTTPException

from app.models import MediaRequest, PlexUser, RequestStatus, Settings
from app.routers.library_api import MediaAddRequest, _enforce_request_quota
from app.services import request_quotas
from app.utils import now_utc_naive
from tests.async_support import make_test_session


def _request(uid: str, title: str, media_type: str = "movie", days_ago: float = 1, **extra) -> MediaRequest:
    return MediaRequest(
        plex_user_id=uid,
        plex_user=uid,
        title=title,
        media_type=media_type,
        status=extra.pop("status", RequestStatus.sent_to_arr),
        source=extra.pop("source", "user_request"),
        requested_at=now_utc_naive() - timedelta(days=days_ago),
        **extra,
    )


@pytest.mark.asyncio
async def test_quota_counts_only_recent_user_requests():
    db = make_test_session()
    try:
        settings = Settings(quota_movie_limit=2, quota_period_days=7)
        user = PlexUser(plex_user_id="u1", role="user")
        db.add_all(
            [
                user,
                _request("u1", "Recent A"),
                _request("u1", "Old", days_ago=10),
                _request("u1", "Refusee", status=RequestStatus.rejected),
                _request("u1", "Synchro", source="arr_sync"),
                _request("u1", "Serie", media_type="show"),
                _request("u2", "Autre compte"),
            ]
        )
        db.commit()

        state = await request_quotas.quota_state(db, settings, user, "u1", "movie")
        assert state.limit == 2
        assert state.used == 1
        assert state.exceeded is False
        assert state.remaining == 1
    finally:
        db.close()


@pytest.mark.asyncio
async def test_quota_exceeded_gives_next_slot_from_oldest_request():
    db = make_test_session()
    try:
        settings = Settings(quota_movie_limit=2, quota_period_days=7)
        user = PlexUser(plex_user_id="u1", role="user")
        oldest = _request("u1", "A", days_ago=5)
        db.add_all([user, oldest, _request("u1", "B", days_ago=1)])
        db.commit()

        state = await request_quotas.quota_state(db, settings, user, "u1", "movie")
        assert state.exceeded is True
        assert state.next_slot_at == oldest.requested_at + timedelta(days=7)
        assert "2 films par période de 7 jours" in request_quotas.exceeded_message(state)
    finally:
        db.close()


def test_user_override_and_zero_mean_unlimited():
    settings = Settings(quota_movie_limit=3, quota_show_limit=0)
    assert request_quotas.effective_limit(settings, PlexUser(plex_user_id="a"), "movie") == 3
    assert request_quotas.effective_limit(settings, PlexUser(plex_user_id="a"), "show") is None
    assert request_quotas.effective_limit(settings, PlexUser(plex_user_id="a", quota_movie_limit=10), "movie") == 10
    assert request_quotas.effective_limit(settings, PlexUser(plex_user_id="a", quota_movie_limit=0), "movie") is None
    assert request_quotas.effective_limit(None, None, "movie") is None


def test_moderators_and_admins_are_exempt():
    assert request_quotas.is_exempt(PlexUser(plex_user_id="a", role="admin"))
    assert request_quotas.is_exempt(PlexUser(plex_user_id="a", role="moderator"))
    assert not request_quotas.is_exempt(PlexUser(plex_user_id="a", role="user"))
    assert request_quotas.is_exempt(None, {"is_owner": True})


@pytest.mark.asyncio
async def test_discover_request_refused_when_quota_reached():
    db = make_test_session()
    try:
        settings = Settings(quota_movie_limit=1)
        db.add_all([PlexUser(plex_user_id="u1", role="user"), _request("u1", "Deja", tmdb_id="1")])
        db.commit()
        caller = {"plex_user_id": "u1", "role": "user"}

        body = MediaAddRequest(title="Nouveau", media_type="movie", tmdb_id=2, plex_user_id="u1")
        with pytest.raises(HTTPException) as exc:
            await _enforce_request_quota(db, settings, caller, body)
        assert exc.value.status_code == 429

        # Redemander un media deja connu ne cree pas de demande : pas de blocage.
        again = MediaAddRequest(title="Deja", media_type="movie", tmdb_id=1, plex_user_id="u1")
        await _enforce_request_quota(db, settings, caller, again)

        # Les series ont leur propre limite (ici illimitee).
        show = MediaAddRequest(title="Serie", media_type="show", tvdb_id=3, plex_user_id="u1")
        await _enforce_request_quota(db, settings, caller, show)
    finally:
        db.close()


@pytest.mark.asyncio
async def test_user_quotas_payload_for_exempt_and_limited_accounts():
    db = make_test_session()
    try:
        settings = Settings(quota_movie_limit=4, quota_show_limit=2, quota_period_days=14)
        user = PlexUser(plex_user_id="u1", role="user")
        db.add_all([user, _request("u1", "Serie", media_type="show")])
        db.commit()

        payload = await request_quotas.user_quotas(db, settings, user, "u1")
        assert payload["exempt"] is False
        assert payload["period_days"] == 14
        assert payload["movie"]["remaining"] == 4
        assert payload["show"]["used"] == 1 and payload["show"]["limit"] == 2

        none = await request_quotas.user_quotas(db, settings, None, None)
        assert none["exempt"] is True and none["movie"]["limit"] is None
    finally:
        db.close()
