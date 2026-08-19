"""Garde-fou : aucun endpoint ne doit repondre a un appelant non authentifie.

Pourquoi ce fichier existe
--------------------------
L'API expose plus de 300 operations, protegees selon TROIS conventions differentes :

1. au niveau du routeur     : APIRouter(dependencies=[Depends(require_admin)])
2. au niveau du decorateur  : @router.get("/x", dependencies=[Depends(require_admin)])
3. dans le corps            : Depends(current_user) + _check_permission(...)

La troisieme est la plus fragile : rien n'empeche d'ajouter demain un endpoint dans
security_api.py en oubliant l'appel a _check_permission -- il serait alors accessible
sans authentification, silencieusement, et aucun test existant ne le verrait passer
(10 tests d'autorisation pour 317 operations avant ce fichier).

Ce test ne verifie pas une liste figee d'endpoints : il enumere le schema OpenAPI a
l'execution. Tout nouvel endpoint est donc couvert automatiquement des sa creation.
Pour en rendre un public il faut l'ajouter explicitement a PUBLIC_ENDPOINTS ci-dessous,
ce qui force la decision a etre consciente et relue -- et documente au passage la
surface publique reelle de l'application.
"""

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async
from app.main import app

# Surface publique assumee. Toute entree ici est une decision de securite deliberee.
PUBLIC_ENDPOINTS: set[tuple[str, str]] = {
    # Parcours de connexion : accessible par definition avant toute session.
    ("GET", "/login"),
    ("POST", "/login"),
    ("GET", "/logout"),
    ("POST", "/login/plex/pin"),
    ("GET", "/login/plex/check/{pin_id}"),
    # Connexion par passkey : appelee avant toute session par definition. Ne renvoie
    # qu'un defi cryptographique, aucune donnee utilisateur (voir auth.py).
    ("POST", "/api/webauthn/login/options"),
    ("POST", "/api/webauthn/login/verify"),
    # Premiere installation : par construction, aucun compte n'existe encore.
    # setup_get / setup_post / setup_restore refusent d'agir des qu'un compte existe
    # (verification explicite dans app/routers/auth.py).
    ("GET", "/setup"),
    ("POST", "/setup"),
    ("POST", "/setup/restore"),
    # Page legale, volontairement consultable sans compte.
    ("GET", "/privacy"),
    # Webhooks entrants : authentifies par jeton dans la requete, pas par session,
    # car appeles par Sonarr/Radarr/Plex qui n'ont pas de cookie.
    ("POST", "/webhook/sonarr"),
    ("POST", "/webhook/radarr"),
    ("POST", "/webhook/plex"),
    # Techniques / sans donnee metier.
    # (favicon, /api/docs, /api/openapi.json et /api/i18n sont exclus du schema OpenAPI
    # et ne sont donc pas parcourus par ce test : inutile de les lister ici.)
    ("GET", "/api/session"),  # renvoie l'etat de session, y compris "non connecte"
}

# Statuts acceptables pour un appel non authentifie : refus explicite, ou bien
# l'endpoint n'existe pas sous cette forme (405/404 sur un parametre substitue).
REJECTED = {401, 403}


def _sample_path(path: str) -> str:
    """Remplace les parametres de chemin par des valeurs plausibles.

    La valeur importe peu : le refus doit intervenir AVANT toute recherche en base.
    Si un endpoint renvoie 404 plutot que 401, c'est deja un signal -- cela veut dire
    qu'il a interroge la base avant de verifier qui appelle.
    """
    out = []
    for part in path.split("/"):
        if part.startswith("{") and part.endswith("}"):
            out.append("test" if "lang" in part or "service" in part or "name" in part else "1")
        else:
            out.append(part)
    return "/".join(out)


def _operations() -> list[tuple[str, str]]:
    spec = app.openapi()
    ops = []
    for path, methods in spec["paths"].items():
        for method in methods:
            if method.lower() in ("get", "post", "put", "patch", "delete"):
                ops.append((method.upper(), path))
    return sorted(ops)


def _resolve(schema: dict, spec: dict) -> dict:
    """Deref un $ref OpenAPI (les modeles Pydantic sont references, pas inlines)."""
    ref = schema.get("$ref")
    if not ref:
        return schema
    node = spec
    for key in ref.lstrip("#/").split("/"):
        node = node.get(key, {})
    return node


def _dummy(schema: dict, spec: dict):
    schema = _resolve(schema, spec)
    if "anyOf" in schema:  # Optional[...] -> premiere branche non nulle
        for branch in schema["anyOf"]:
            if branch.get("type") != "null":
                return _dummy(branch, spec)
    kind = schema.get("type")
    if kind == "string":
        return "x"
    if kind == "integer":
        return 1
    if kind == "number":
        return 1.0
    if kind == "boolean":
        return True
    if kind == "array":
        return []
    return {}


def _request_body(method: str, path: str, spec: dict):
    """Corps minimal satisfaisant la validation, pour que la requete atteigne
    reellement le controle d'autorisation.

    Sans ca, FastAPI renvoie 422 avant meme d'executer les verifications faites dans
    le corps de la fonction (motif `Depends(current_user)` + `_check_permission`) :
    le test semblerait vert alors qu'il n'aurait rien prouve sur ces endpoints.
    """
    operation = spec["paths"].get(path, {}).get(method.lower(), {})
    content = operation.get("requestBody", {}).get("content", {}).get("application/json")
    if not content:
        return None
    schema = _resolve(content.get("schema", {}), spec)
    if schema.get("type") != "object" or "properties" not in schema:
        return {}
    required = schema.get("required") or list(schema["properties"])
    return {name: _dummy(schema["properties"][name], spec) for name in required}


@pytest.fixture()
def anon_client(async_db):
    """Client SANS aucune surcharge d'authentification, contrairement aux autres tests.

    Seule la base est surchargee : on veut exercer la vraie chaine de dependances de
    securite, pas la court-circuiter.
    """
    app.dependency_overrides[get_db_async] = lambda: async_db
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.pop(get_db_async, None)


def test_openapi_exposes_every_route():
    """Filet du filet : si l'enumeration casse, le test principal deviendrait vide
    et passerait sans rien verifier."""
    ops = _operations()
    assert len(ops) > 250, f"Enumeration OpenAPI suspecte : {len(ops)} operations"


def test_public_allowlist_has_no_stale_entry():
    """Empeche la liste blanche de garder des endpoints qui n'existent plus : une
    entree obsolete masquerait un futur endpoint reintroduit sous le meme chemin."""
    declared = {(m, p) for m, p in _operations()}
    extra = {e for e in PUBLIC_ENDPOINTS if e not in declared}
    # /openapi.json est servi par Starlette, hors schema : tolere.
    extra.discard(("GET", "/openapi.json"))
    assert not extra, f"Entrees publiques obsoletes a retirer : {sorted(extra)}"


def test_every_endpoint_rejects_anonymous_callers(anon_client):
    """Chaque operation non listee comme publique doit refuser un appel anonyme."""
    spec = app.openapi()
    leaked = []
    for method, path in _operations():
        if (method, path) in PUBLIC_ENDPOINTS:
            continue
        body = _request_body(method, path, spec)
        response = anon_client.request(method, _sample_path(path), json=body)
        if response.status_code not in REJECTED:
            leaked.append(f"{method} {path} -> {response.status_code}")

    assert not leaked, (
        "Endpoints accessibles sans authentification (ou refusant trop tard) :\n  "
        + "\n  ".join(leaked)
        + "\n\nSoit la dependance de securite manque, soit l'endpoint est public "
        "et doit etre ajoute a PUBLIC_ENDPOINTS avec sa justification."
    )
