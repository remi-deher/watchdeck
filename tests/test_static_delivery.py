import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

# La sortie de `npm run build` n'est plus suivie par git. En local, sans build, ces tests
# n'ont rien a verifier ; en CI le frontend est compile avant pytest (tests.yml), et
# l'absence de build y est une erreur : un oubli d'etape ne doit pas passer inapercu.
BUILT = Path("app/static/vue/index.html").exists()
pytestmark = pytest.mark.skipif(
    not BUILT and not os.environ.get("CI"),
    reason="frontend non compile : lancer `npm run build` pour ces tests",
)


def test_vite_assets_are_immutable_and_gzipped():
    asset = next(path for path in Path("app/static/vue/assets").glob("*.js") if path.stat().st_size > 1000)
    response = TestClient(app).get(f"/vue/assets/{asset.name}", headers={"Accept-Encoding": "gzip"})

    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert response.headers["content-encoding"] == "gzip"


def test_vite_index_is_never_stored():
    response = TestClient(app).get("/vue/index.html")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store, no-cache, must-revalidate, max-age=0"
