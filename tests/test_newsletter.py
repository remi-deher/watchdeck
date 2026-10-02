"""Lettre « Nouveautes de la semaine »."""

from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async
from app.dependencies import require_admin, require_auth
from app.main import app
from app.models import LibraryItem, PlexUser, Settings
from app.services import newsletter
from app.utils import now_utc_naive
from tests.async_support import make_test_session

NOW = datetime(2026, 10, 2, 18, 0)


def _episode(show, guid, season):
    return SimpleNamespace(grandparentTitle=show, grandparentGuid=guid, parentIndex=season)


def test_recent_episodes_grouped_by_show():
    section = MagicMock(type="show", title="Séries")
    section.searchEpisodes.return_value = [
        _episode("Andor", "plex://show/1", 2),
        _episode("Andor", "plex://show/1", 2),
        _episode("Severance", "plex://show/2", 1),
    ]
    other = MagicMock(type="show", title="Animés")
    plex = MagicMock()
    plex.library.sections.return_value = [section, other, MagicMock(type="movie")]
    with patch("app.services.plex_finder.connect", return_value=plex):
        shows = newsletter.recent_episodes_blocking([("http://plex", "t", ["Séries"])], NOW)
    assert shows["plex://show/1"]["count"] == 2 and shows["plex://show/1"]["seasons"] == {2}
    assert shows["plex://show/2"]["title"] == "Severance"
    other.searchEpisodes.assert_not_called()

    with patch("app.services.plex_finder.connect", side_effect=RuntimeError("down")):
        assert newsletter.recent_episodes_blocking([("http://plex", "t", [])], NOW) == {}


def test_window_and_due_rules():
    settings = Settings(newsletter_enabled=True, newsletter_weekday=4, newsletter_hour=18)
    assert newsletter.window_start(settings, NOW) == NOW - timedelta(days=7)
    settings.newsletter_last_sent_at = NOW - timedelta(days=3)
    assert newsletter.window_start(settings, NOW) == NOW - timedelta(days=3)
    settings.newsletter_last_sent_at = NOW - timedelta(days=40)
    assert newsletter.window_start(settings, NOW) == NOW - timedelta(days=14)

    settings.newsletter_last_sent_at = None
    assert newsletter.is_due(settings, NOW, hour=18, weekday=4)
    assert not newsletter.is_due(settings, NOW, hour=17, weekday=4)
    assert not newsletter.is_due(settings, NOW, hour=18, weekday=3)
    settings.newsletter_last_sent_at = NOW - timedelta(hours=2)
    assert not newsletter.is_due(settings, NOW, hour=18, weekday=4)
    assert not newsletter.is_due(Settings(newsletter_enabled=False), NOW, hour=18, weekday=4)


def test_language_labels_and_render():
    assert newsletter.language_label(LibraryItem(title="a", media_type="movie", has_vf=True)) == "VF"
    assert (
        newsletter.language_label(LibraryItem(title="a", media_type="movie", has_vf=False, sub_fr_status="ok"))
        == "VOSTFR"
    )
    assert (
        newsletter.language_label(LibraryItem(title="a", media_type="movie", has_vf=False, sub_fr_status="absent"))
        == "VO"
    )
    assert newsletter.language_label(LibraryItem(title="a", media_type="movie")) is None

    entries = [
        newsletter.NewsletterEntry(
            title="Dune <2>",
            media_type="movie",
            year=2024,
            language="VF",
            poster_url="https://img/x.jpg",
            library_item_id=3,
        ),
        newsletter.NewsletterEntry(title="Andor", media_type="show", episode_count=2, seasons=[2]),
        newsletter.NewsletterEntry(title="Severance", media_type="show", episode_count=1),
        newsletter.NewsletterEntry(title="Pluribus", media_type="show", new_series=True),
    ]
    html = newsletter.render_html(entries, NOW - timedelta(days=7), "https://watchdeck.example")
    assert "Dune &lt;2&gt;" in html
    assert "https://watchdeck.example/library/media/library/3" in html
    assert "2 nouveaux épisodes (saison 2)" in html
    assert "1 nouvel épisode" in html and "Nouvelle série" in html
    assert "1 film(s) et 3 série(s)" in html

    embeds = newsletter.discord_embeds(entries, NOW)
    assert embeds[0]["thumbnail"] == {"url": "https://img/x.jpg"}
    assert "**Andor**" in embeds[0]["description"]
    long = [newsletter.NewsletterEntry(title="x" * 200, media_type="movie") for _ in range(40)]
    assert len(newsletter.discord_embeds(long, NOW)[0]["description"]) <= 4000


def test_recipients_skip_pseudo_accounts_and_duplicates():
    users = [
        PlexUser(plex_user_id="u1", notification_email="a@x.fr, b@x.fr"),
        PlexUser(plex_user_id="u2", plex_email="a@x.fr"),
        PlexUser(plex_user_id="manual", plex_email="c@x.fr"),
        PlexUser(plex_user_id="u3"),
    ]
    assert newsletter.recipients(users) == ["a@x.fr"]


@pytest.mark.asyncio
async def test_collect_entries_merges_new_items_and_new_episodes():
    db = make_test_session()
    try:
        recent = now_utc_naive() - timedelta(days=1)
        movie = LibraryItem(
            title="Film", media_type="movie", added_at=recent, has_vf=True, poster_url="https://image.tmdb.org/f.jpg"
        )
        new_show = LibraryItem(title="Nouvelle", media_type="show", added_at=recent, plex_guid="plex://show/new")
        old_show = LibraryItem(
            title="Ancienne", media_type="show", added_at=recent - timedelta(days=90), plex_guid="plex://show/old"
        )
        db.add_all(
            [
                movie,
                new_show,
                old_show,
                LibraryItem(title="Vieux film", media_type="movie", added_at=recent - timedelta(days=30)),
            ]
        )
        db.commit()
        shows = {
            "plex://show/new": {"title": "Nouvelle", "guid": "plex://show/new", "seasons": {1}, "count": 8},
            "plex://show/old": {"title": "Ancienne", "guid": "plex://show/old", "seasons": {3}, "count": 1},
            "Inconnue": {"title": "Inconnue", "guid": None, "seasons": set(), "count": 2},
        }
        conn = SimpleNamespace(url="http://plex", token="t", libraries=[{"name": "Séries"}])
        with (
            patch("app.services.plex_servers.active_connections", new=AsyncMock(return_value=[conn])),
            patch.object(newsletter, "recent_episodes_blocking", return_value=shows),
        ):
            entries = await newsletter.collect_entries(db, Settings(), now_utc_naive() - timedelta(days=7))
        titles = [(e.title, e.detail) for e in entries]
        assert ("Film", "Film") in titles
        assert ("Nouvelle", "Nouvelle série") in titles
        assert ("Ancienne", "1 nouvel épisode (saison 3)") in titles
        assert ("Inconnue", "2 nouveaux épisodes") in titles
        assert all(title != "Vieux film" for title, _ in titles)
        assert next(e for e in entries if e.title == "Film").poster_url == "https://image.tmdb.org/f.jpg"
    finally:
        db.close()


@pytest.mark.asyncio
async def test_send_newsletter_emails_subscribers_and_discord():
    db = make_test_session()
    try:
        settings = Settings(
            email_enabled=True,
            smtp_from="wd@x.fr",
            discord_enabled=True,
            discord_webhook_url="https://discord/hook",
            newsletter_discord=True,
        )
        db.add_all(
            [
                settings,
                PlexUser(plex_user_id="u1", plex_email="a@x.fr", notify_newsletter=True, enabled=True),
                PlexUser(plex_user_id="u2", plex_email="b@x.fr", notify_newsletter=False, enabled=True),
            ]
        )
        db.commit()
        entry = newsletter.NewsletterEntry(title="Film", media_type="movie")
        smtp = AsyncMock()
        with (
            patch.object(newsletter, "AsyncSessionLocal", return_value=db),
            patch.object(newsletter, "collect_entries", new=AsyncMock(return_value=[entry])),
            patch("app.services.email_providers.has_enabled_provider", new=AsyncMock(return_value=True)),
            patch("app.services.email_service._send", new=smtp),
            patch("app.services.notifications._post_discord_embed", new=AsyncMock()) as discord,
        ):
            result = await newsletter.send_newsletter(now=NOW)
            assert result == {"status": "sent", "items": 1, "emails": 1, "errors": 0, "discord": True}
            assert smtp.call_args.args[1] == "a@x.fr"
            discord.assert_awaited_once()
            assert settings.newsletter_last_sent_at == NOW

            test = await newsletter.send_newsletter(only_to="admin@x.fr", now=NOW + timedelta(days=1))
            assert test["test"] is True and smtp.call_args.args[1] == "admin@x.fr"
            assert settings.newsletter_last_sent_at == NOW  # un test ne decale pas l'envoi

        with (
            patch.object(newsletter, "AsyncSessionLocal", return_value=db),
            patch.object(newsletter, "collect_entries", new=AsyncMock(return_value=[])),
        ):
            assert (await newsletter.send_newsletter(now=NOW + timedelta(days=7)))["status"] == "empty"
    finally:
        db.close()


def test_newsletter_routes():
    db = make_test_session()
    try:
        db.add(Settings(admin_notification_email="admin@x.fr"))
        db.commit()
        app.dependency_overrides[require_auth] = lambda: None
        app.dependency_overrides[require_admin] = lambda: None
        app.dependency_overrides[get_db_async] = lambda: db
        client = TestClient(app, raise_server_exceptions=False)

        entry = newsletter.NewsletterEntry(title="Film", media_type="movie")
        with patch.object(newsletter, "collect_entries", new=AsyncMock(return_value=[entry])):
            response = client.get("/api/newsletter/preview")
        assert response.status_code == 200 and "Nouveautés de la semaine" in response.text

        with patch.object(
            newsletter, "send_newsletter", new=AsyncMock(return_value={"status": "sent", "emails": 1})
        ) as send:
            assert client.post("/api/newsletter/test", json={}).json()["recipient"] == "admin@x.fr"
            assert send.call_args.kwargs == {"only_to": "admin@x.fr"}
            assert client.post("/api/newsletter/send").json()["status"] == "sent"
        with patch.object(
            newsletter, "send_newsletter", new=AsyncMock(return_value={"status": "email_not_configured"})
        ):
            assert client.post("/api/newsletter/test", json={"email": "x@y.fr"}).status_code == 400
        assert client.post("/api/newsletter/test", json={"email": "pas-une-adresse"}).status_code == 400
    finally:
        for dep in (require_auth, require_admin, get_db_async):
            app.dependency_overrides.pop(dep, None)
        db.close()
