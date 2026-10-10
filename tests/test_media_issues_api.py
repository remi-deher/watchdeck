"""Signalements : ce que l'API sert, et ce que l'interface peut en faire."""

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async
from app.dependencies import require_auth, require_moderator
from app.main import app
from app.models import LibraryItem, MediaIssue, Settings


@pytest.fixture()
def client(async_db):
    async_db.add(Settings(id=1))
    async_db.commit()
    app.dependency_overrides[require_auth] = lambda: None
    app.dependency_overrides[require_moderator] = lambda: None
    app.dependency_overrides[get_db_async] = lambda: async_db
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def _issue(async_db, **overrides) -> MediaIssue:
    base = {
        "title": "Le Voyage de Chihiro",
        "media_type": "movie",
        "issue_type": "audio",
        "message": "Pas de piste française",
        "status": "open",
        "reporter_name": "Lisa",
    }
    base.update(overrides)
    issue = MediaIssue(**base)
    async_db.add(issue)
    async_db.commit()
    return issue


def test_list_serves_the_media_title_the_page_displays(client, async_db):
    """Le titre du média doit arriver sous le nom que la page lit.

    L'ancienne page affichait `issue.media_title`, un champ que l'API n'a jamais
    renvoyé : le repli s'appliquait toujours et seul le type de problème s'affichait,
    jamais le film concerné. L'interface TypeScript déclarait le champ en optionnel, ce
    qui rendait l'erreur silencieuse.
    """
    _issue(async_db)

    payload = client.get("/api/media/issues").json()

    assert [row["title"] for row in payload["items"]] == ["Le Voyage de Chihiro"]
    assert payload["items"][0]["reporter_name"] == "Lisa"


def test_list_exposes_the_available_types_for_filtering(client, async_db):
    """Les types couvrent toute la table, pas la sélection courante.

    Filtrer sur un type ne doit pas faire disparaître les autres du menu.
    """
    _issue(async_db, issue_type="audio")
    _issue(async_db, issue_type="subtitle")

    filtre = client.get("/api/media/issues?issue_type=audio").json()

    assert [row["issue_type"] for row in filtre["items"]] == ["audio"]
    assert filtre["types"] == ["audio", "subtitle"]


def test_list_resolves_the_poster_from_the_linked_media(client, async_db):
    """La carte a besoin d'une affiche ; le signalement ne la porte pas lui-même."""
    item = LibraryItem(
        title="Le Voyage de Chihiro", media_type="movie", poster_url="/poster.jpg", art_url="/fanart.jpg"
    )
    async_db.add(item)
    async_db.commit()
    _issue(async_db, library_item_id=item.id)

    payload = client.get("/api/media/issues").json()

    assert payload["items"][0]["poster_url"].startswith("/api/image-proxy?url=")
    media = payload["items"][0]["media"]
    assert media["id"] == item.id
    assert "fanart.jpg" in media["backdrop_url"]
    assert "poster.jpg" in media["poster_url"]
    assert payload["items"][0]["problem"]["key"].startswith("report:")
    issue_id = payload["items"][0]["id"]
    updated = client.patch(f"/api/media/issues/{issue_id}", json={"status": "closed"}).json()
    assert updated["media"] == media
    assert [action["key"] for action in updated["problem"]["actions"]] == ["open"]


def test_a_note_can_be_written_and_read_back(client, async_db):
    """`admin_note` existait en base et dans l'API, sans aucun écran pour la saisir."""
    issue = _issue(async_db)

    updated = client.patch(f"/api/media/issues/{issue.id}", json={"admin_note": "Ré-encodé côté Radarr."}).json()

    assert updated["admin_note"] == "Ré-encodé côté Radarr."
    assert client.get("/api/media/issues").json()["items"][0]["admin_note"] == "Ré-encodé côté Radarr."


def test_all_really_means_all(client, async_db):
    """« Tous » doit renvoyer tous les statuts, pas le défaut.

    `status` vaut « open » par défaut — c'est ce qu'on veut voir en arrivant — mais du
    coup omettre le paramètre filtrait au lieu de tout renvoyer, et le filtre « Tous »
    de l'interface ne montrait que les signalements ouverts.
    """
    _issue(async_db, status="open")
    _issue(async_db, status="investigating")
    _issue(async_db, status="closed")

    assert len(client.get("/api/media/issues").json()["items"]) == 1
    assert len(client.get("/api/media/issues?status=all").json()["items"]) == 3
    assert len(client.get("/api/media/issues?status=closed").json()["items"]) == 1


def test_the_status_vocabulary_has_a_single_terminal_state(client, async_db):
    """« resolved » faisait doublon avec « closed » et restait inatteignable.

    L'API l'acceptait, l'interface ne le proposait ni ne l'écrivait jamais : un statut
    que rien ne permettait d'atteindre et que le filtre ne savait pas retrouver.
    """
    issue = _issue(async_db)

    assert client.patch(f"/api/media/issues/{issue.id}", json={"status": "resolved"}).status_code == 400
    for status in ("investigating", "closed", "open"):
        assert client.patch(f"/api/media/issues/{issue.id}", json={"status": status}).status_code == 200


def test_audit_endpoint_serves_the_whole_problem_contract(client, async_db):
    from app.services.handling_problem import HandlingProblem

    item = LibraryItem(title="Pistes", media_type="movie", has_vf=True, fr_is_default=False, art_url="/fanart.jpg")
    async_db.add(item)
    async_db.commit()
    response = client.get("/api/vf-upgrades/audit")
    assert response.status_code == 200
    row = next(row for row in response.json()["items"] if row["id"] == item.id)
    assert "fanart.jpg" in row["backdrop_url"]
    assert row["problems"][0]["kind"] == "audio_secondary"
    assert row["problems"][0]["fixable"]
    HandlingProblem.model_validate(row["problems"][0])


def test_request_poster_is_preserved_when_library_has_only_fanart(client, async_db):
    from app.models import MediaRequest

    library = LibraryItem(title="Deux images", media_type="movie", art_url="/fanart.jpg")
    request = MediaRequest(
        title="Deux images", media_type="movie", poster_url="/request-poster.jpg", plex_user_id="alice"
    )
    async_db.add(library)
    async_db.add(request)
    async_db.commit()
    issue = _issue(async_db, library_item_id=library.id, request_id=request.id)
    row = client.get("/api/media/issues").json()["items"][0]
    assert row["media"]["id"] == library.id
    assert "request-poster.jpg" in row["media"]["poster_url"]
    assert "fanart.jpg" in row["media"]["backdrop_url"]
    updated = client.patch(f"/api/media/issues/{issue.id}", json={"admin_note": "Vérifié"}).json()
    assert updated["media"] == row["media"]
