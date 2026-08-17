from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.pagination import PaginationParams, paginated_response, pagination_params


def test_pagination_params_defaults_and_values_via_fastapi():
    app = FastAPI()

    @app.get("/items")
    def list_items(pagination: PaginationParams = Depends(pagination_params(max_limit=200, default_limit=50))):
        return {"offset": pagination.offset, "limit": pagination.limit}

    client = TestClient(app)

    defaults = client.get("/items")
    assert defaults.json() == {"offset": 0, "limit": 50}

    ok = client.get("/items", params={"limit": 150, "offset": 10})
    assert ok.status_code == 200
    assert ok.json() == {"offset": 10, "limit": 150}


def test_pagination_params_rejects_out_of_bounds_via_fastapi():
    """Les bornes doivent produire un 422 FastAPI (comme avant factorisation, pour les
    endpoints qui validaient déjà via Query(ge=,le=)) plutôt qu'un clamp silencieux :
    le contrat d'API observable ne doit pas changer."""
    app = FastAPI()

    @app.get("/items")
    def list_items(pagination: PaginationParams = Depends(pagination_params(max_limit=200, default_limit=50))):
        return {"offset": pagination.offset, "limit": pagination.limit}

    client = TestClient(app)

    over_max = client.get("/items", params={"limit": 300})
    assert over_max.status_code == 422

    negative_limit = client.get("/items", params={"limit": -5})
    assert negative_limit.status_code == 422

    negative_offset = client.get("/items", params={"offset": -10})
    assert negative_offset.status_code == 422


def test_pagination_params_strict_false_clamps_silently():
    """strict=False reproduit le comportement des endpoints qui n'avaient jamais eu
    de Query(ge=,le=) avant factorisation (ex. notifications_api.py) : toute valeur
    est acceptée (200 OK) et clampée en silence, pas de 422."""
    app = FastAPI()

    @app.get("/items")
    def list_items(
        pagination: PaginationParams = Depends(pagination_params(max_limit=200, default_limit=50, strict=False)),
    ):
        return {"offset": pagination.offset, "limit": pagination.limit}

    client = TestClient(app)

    over_max = client.get("/items", params={"limit": 999})
    assert over_max.status_code == 200
    assert over_max.json()["limit"] == 200

    negative = client.get("/items", params={"limit": -5, "offset": -10})
    assert negative.status_code == 200
    assert negative.json() == {"offset": 0, "limit": 1}


def test_paginated_response():
    resp = paginated_response(items=[1, 2, 3], total=10, offset=0, limit=3, key="items", extra_key="val")
    assert resp == {
        "items": [1, 2, 3],
        "total": 10,
        "offset": 0,
        "limit": 3,
        "has_more": True,
        "extra_key": "val",
    }

    resp2 = paginated_response(items=[1, 2, 3], total=3, offset=0, limit=3, key="logs")
    assert resp2 == {
        "logs": [1, 2, 3],
        "total": 3,
        "offset": 0,
        "limit": 3,
        "has_more": False,
    }
