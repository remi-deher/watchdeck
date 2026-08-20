"""Cache de favicons de trackers -- surtout ses protections.

Ce module etait couvert a 0%. Il merite mieux que la moyenne, parce qu'il fait
quelque chose de structurellement risque : il telecharge une ressource a une adresse
que l'utilisateur controle indirectement (l'URL d'annonce d'un tracker).

Sans garde-fou c'est une SSRF : il suffirait d'un tracker pointant vers
http://169.254.169.254/ (metadonnees d'instance cloud) ou vers un service interne
pour que le serveur aille le chercher lui-meme et en renvoie le contenu.

Les protections existent (refus des adresses non publiques, redirections desactivees,
plafond de taille, re-encodage de l'image). Aucune n'etait verifiee : leur disparition
serait passee inapercue, l'application continuant de fonctionner normalement.
"""

import socket
from io import BytesIO
from unittest.mock import AsyncMock, patch

import pytest
from PIL import Image

from app.services.tracker_favicons import (
    _MAX_BYTES,
    _download,
    _public_host,
    _safe_png,
    tracker_host,
)


def _addrinfo(*ips: str):
    """Imite socket.getaddrinfo : (famille, type, proto, canonname, sockaddr)."""
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443)) for ip in ips]


def _png_bytes(size: tuple[int, int] = (64, 64), mode: str = "RGB") -> bytes:
    buffer = BytesIO()
    Image.new(mode, size, "red").save(buffer, format="PNG")
    return buffer.getvalue()


# --- Extraction du nom d'hote ------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("https://tracker.example.com/announce", "tracker.example.com"),
        # Une chaine d'annonce peut lister plusieurs trackers : seul le premier compte.
        ("https://a.example.com/announce,https://b.example.com/announce", "a.example.com"),
        # Sans schema, l'URL doit rester interpretable.
        ("tracker.example.com", "tracker.example.com"),
        # Normalisation : casse et point final (racine DNS absolue).
        ("HTTPS://Tracker.Example.COM./announce", "tracker.example.com"),
        ("", None),
        ("   ", None),
    ],
)
def test_tracker_host_extraction(value, expected):
    assert tracker_host(value) == expected


# --- Garde-fou SSRF ----------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("ip", "reason"),
    [
        ("127.0.0.1", "boucle locale"),
        ("192.168.1.10", "reseau prive"),
        ("10.0.0.5", "reseau prive"),
        ("172.16.0.3", "reseau prive"),
        ("169.254.169.254", "metadonnees d'instance cloud"),
        ("0.0.0.0", "adresse non specifiee"),
    ],
)
async def test_non_public_addresses_are_refused(ip, reason):
    with patch("app.services.tracker_favicons.socket.getaddrinfo", return_value=_addrinfo(ip)):
        assert await _public_host("evil.example.com") is False, f"doit refuser : {reason}"


@pytest.mark.asyncio
async def test_public_address_is_accepted():
    with patch("app.services.tracker_favicons.socket.getaddrinfo", return_value=_addrinfo("93.184.216.34")):
        assert await _public_host("example.com") is True


@pytest.mark.asyncio
async def test_a_single_private_address_disqualifies_the_host():
    """Un nom peut resoudre vers plusieurs adresses. Si l'une d'elles est interne,
    l'hote doit etre refuse : accepter reviendrait a laisser le sort de la requete
    dependre de l'adresse choisie au moment de la connexion."""
    with patch(
        "app.services.tracker_favicons.socket.getaddrinfo",
        return_value=_addrinfo("93.184.216.34", "192.168.1.10"),
    ):
        assert await _public_host("mixed.example.com") is False


@pytest.mark.asyncio
async def test_unresolvable_host_is_refused():
    with patch("app.services.tracker_favicons.socket.getaddrinfo", side_effect=OSError("NXDOMAIN")):
        assert await _public_host("nope.invalid") is False


@pytest.mark.asyncio
async def test_download_never_contacts_a_non_public_host():
    """Le refus doit intervenir AVANT toute requete reseau : c'est la requete
    elle-meme qui constitue la SSRF, pas ce qu'on fait de sa reponse."""
    with (
        patch("app.services.tracker_favicons._public_host", new=AsyncMock(return_value=False)),
        patch("app.services.tracker_favicons.httpx.AsyncClient") as client,
    ):
        assert await _download("192.168.1.10") == (None, None)
        client.assert_not_called()


@pytest.mark.asyncio
async def test_download_does_not_follow_redirects():
    """Suivre une redirection annulerait le controle d'adresse : un hote public
    pourrait rediriger vers une adresse interne."""
    captured = {}

    class _Response:
        # 404 : la boucle passe au schema suivant sans rien telecharger, ce qui
        # suffit ici -- seuls les parametres de construction du client sont testes.
        status_code = 404

    class _Stream:
        async def __aenter__(self):
            return _Response()

        async def __aexit__(self, *_):
            return False

    class _Client:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        def stream(self, *_args, **_kwargs):
            return _Stream()

    with (
        patch("app.services.tracker_favicons._public_host", new=AsyncMock(return_value=True)),
        patch("app.services.tracker_favicons.httpx.AsyncClient", _Client),
    ):
        assert await _download("example.com") == (None, None)

    assert captured.get("follow_redirects") is False


# --- Validation de l'image ---------------------------------------------------


def test_oversized_content_is_rejected():
    assert _safe_png(b"x" * (_MAX_BYTES + 1)) is None


def test_empty_content_is_rejected():
    assert _safe_png(b"") is None


def test_non_image_content_is_rejected():
    assert _safe_png(b"<html>pas une image</html>") is None


def test_valid_image_is_reencoded_as_a_small_png():
    """Le re-encodage n'est pas qu'une mise a l'echelle : il reconstruit l'image,
    ce qui neutralise une charge utile dissimulee dans le fichier d'origine."""
    result = _safe_png(_png_bytes((512, 512)))

    assert result is not None
    with Image.open(BytesIO(result)) as image:
        assert image.format == "PNG"
        assert max(image.size) <= 32


def test_palette_image_is_converted_to_a_supported_mode():
    result = _safe_png(_png_bytes((64, 64), mode="P"))

    assert result is not None
    with Image.open(BytesIO(result)) as image:
        assert image.mode in {"RGB", "RGBA"}
