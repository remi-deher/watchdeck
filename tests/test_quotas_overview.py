"""Demandes & quotas : qui approche de son quota, et quels comptes ont une exception."""

from types import SimpleNamespace

import pytest

from app.services import request_quotas
from app.services.request_quotas import quota_exception, quotas_overview


def _user(**extra):
    base = dict(
        id=1,
        plex_user_id="p1",
        custom_name=None,
        display_name="Illan",
        role="user",
        enabled=True,
        quota_movie_limit=None,
        quota_show_limit=None,
        auto_approve=False,
        always_require_approval=False,
    )
    base.update(extra)
    return SimpleNamespace(**base)


def test_a_user_following_the_rules_is_no_exception():
    assert quota_exception(_user()) is None


def test_custom_quota_or_auto_approval_is_an_exception():
    assert quota_exception(_user(quota_movie_limit=10))["quota_movie_limit"] == 10
    assert quota_exception(_user(auto_approve=True, custom_name="Léa"))["name"] == "Léa"


class _Db:
    def __init__(self, counts, users):
        self._answers = [counts, users]

    async def execute(self, _query):
        answer = self._answers.pop(0)

        class _R:
            def all(self):
                return answer

            def scalars(self):
                return self

        return _R()


@pytest.mark.asyncio
async def test_overview_ranks_users_by_how_close_they_are(monkeypatch):
    settings = SimpleNamespace(quota_movie_limit=5, quota_show_limit=3, quota_period_days=7)
    users = [
        _user(id=1, plex_user_id="a", display_name="Illan"),
        _user(id=2, plex_user_id="b", display_name="Noah", quota_movie_limit=10),
        _user(id=3, plex_user_id="c", display_name="Léa", role="admin", auto_approve=True),
        _user(id=4, plex_user_id="d", display_name="Seb"),
    ]
    counts = [("a", "movie", 4), ("a", "show", 3), ("b", "movie", 5), ("c", "movie", 40)]
    result = await quotas_overview(_Db(counts, users), settings)

    assert result["period_days"] == 7
    assert result["limits"] == {"movie": 5, "show": 3}
    # Illan a épuisé ses séries (3/3) : il passe devant Noah (5/10) ; l'admin et Seb (rien) n'y sont pas.
    assert [entry["name"] for entry in result["usage"]] == ["Illan", "Noah"]
    assert result["usage"][0]["show"] == {"used": 3, "limit": 3}
    assert [entry["name"] for entry in result["exceptions"]] == ["Léa", "Noah"]


def test_approval_rule_per_account():
    from app.services.request_quotas import needs_approval

    on = SimpleNamespace(require_approval=True)
    off = SimpleNamespace(require_approval=False)
    assert needs_approval(on, _user()) is True
    assert needs_approval(on, _user(auto_approve=True)) is False
    assert needs_approval(off, _user()) is False
    # « Toujours soumis à approbation » s'applique même approbation coupée, et prime sur l'auto-approbation.
    assert needs_approval(off, _user(always_require_approval=True)) is True
    assert needs_approval(on, _user(always_require_approval=True, auto_approve=True)) is True


def test_always_approval_is_an_exception():
    exception = quota_exception(_user(always_require_approval=True, auto_approve=True))
    assert exception["always_require_approval"] is True
    assert exception["auto_approve"] is False
