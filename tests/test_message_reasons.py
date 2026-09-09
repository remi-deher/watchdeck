"""Motifs réutilisables pour les annulations et les corrections."""

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async
from app.dependencies import require_auth, require_moderator
from app.main import app
from app.models import MessageReason, Settings
from app.routers.message_reasons_api import DEFAULT_REASONS


@pytest.fixture()
def client(async_db):
    async_db.add(Settings(id=1))
    async_db.commit()
    app.dependency_overrides[require_auth] = lambda: None
    app.dependency_overrides[require_moderator] = lambda: None
    app.dependency_overrides[get_db_async] = lambda: async_db
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def test_the_catalog_is_seeded_on_first_read(client):
    """Une liste vide n'aide personne : l'application arrive avec ses motifs.

    Ils restent modifiables et supprimables — ce sont des points de départ, pas des
    constantes.
    """
    payload = client.get("/api/message-reasons").json()

    assert len(payload["items"]) == len(DEFAULT_REASONS)
    assert payload["events"] == ["cancelled", "correction"]
    # L'ordre de la liste fait foi : la position est calculée, pas saisie.
    assert [row["position"] for row in payload["items"]] == list(range(len(DEFAULT_REASONS)))


def test_seeding_happens_only_once(client, async_db):
    """Relire la liste ne doit pas la dupliquer, ni ressusciter un motif supprimé."""
    first = client.get("/api/message-reasons").json()["items"]
    client.delete(f"/api/message-reasons/{first[0]['id']}")

    second = client.get("/api/message-reasons").json()["items"]

    assert len(second) == len(first) - 1


def test_each_context_has_its_own_list(client):
    """Un motif d'annulation n'a rien à faire dans une correction."""
    annulations = client.get("/api/message-reasons?event=cancelled").json()["items"]
    corrections = client.get("/api/message-reasons?event=correction").json()["items"]

    assert annulations and corrections
    assert {row["event"] for row in annulations} == {"cancelled"}
    assert {row["event"] for row in corrections} == {"correction"}


def test_a_reason_can_be_rewritten(client):
    """C'est tout l'intérêt : le message associé se change sans toucher au code."""
    reason = client.get("/api/message-reasons?event=cancelled").json()["items"][0]

    updated = client.patch(
        f"/api/message-reasons/{reason['id']}",
        json={"message": "Formulation maison.", "enabled": False},
    ).json()

    assert updated["message"] == "Formulation maison."
    assert updated["enabled"] is False
    assert updated["label"] == reason["label"]


def test_an_empty_reason_is_refused(client):
    """Un motif sans libellé serait invisible dans la liste ; sans message, inutile."""
    reason = client.get("/api/message-reasons").json()["items"][0]

    assert client.patch(f"/api/message-reasons/{reason['id']}", json={"label": "   "}).status_code == 400
    assert client.post("/api/message-reasons", json={"event": "cancelled", "label": "x", "message": " "}).status_code == 400
    assert (
        client.post("/api/message-reasons", json={"event": "inconnu", "label": "x", "message": "y"}).status_code == 400
    )


def test_a_custom_reason_joins_the_list(client, async_db):
    created = client.post(
        "/api/message-reasons",
        json={"event": "cancelled", "label": "Trop volumineux", "message": "Le fichier dépasse la place disponible."},
    ).json()

    assert created["enabled"] is True
    stored = async_db.query(MessageReason).filter_by(id=created["id"]).one()
    assert stored.label == "Trop volumineux"
