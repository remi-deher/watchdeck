import pytest

from app.crypto import decrypt_secret, encrypt_secret


def _clear_key_env(monkeypatch):
    for name in ("WATCHDECK_ENCRYPTION_KEY", "WATCHDECK_SECRET_KEY"):
        monkeypatch.delenv(name, raising=False)


def test_encrypt_secret_auto_generates_persisted_key_without_env(monkeypatch, tmp_path):
    """Sans WATCHDECK_ENCRYPTION_KEY/WATCHDECK_SECRET_KEY, une clé est générée et persistée
    (data/.encryption_key) plutôt que de stocker les secrets en clair : sinon toute
    installation qui oublie la variable d'env se retrouve silencieusement non chiffrée."""
    pytest.importorskip("cryptography")
    _clear_key_env(monkeypatch)
    monkeypatch.chdir(tmp_path)

    encrypted = encrypt_secret("secret")

    assert encrypted != "secret"
    assert encrypted.startswith("enc:v1:")
    assert decrypt_secret(encrypted) == "secret"
    assert (tmp_path / "data" / ".encryption_key").exists()

    # La clé persistée est réutilisée : un second appel déchiffre la même valeur.
    assert decrypt_secret(encrypted) == "secret"


def test_encrypt_secret_roundtrip_with_key(monkeypatch):
    pytest.importorskip("cryptography")
    _clear_key_env(monkeypatch)
    monkeypatch.setenv("WATCHDECK_ENCRYPTION_KEY", "test-key")

    encrypted = encrypt_secret("secret")

    assert encrypted != "secret"
    assert encrypted.startswith("enc:v1:")
    assert decrypt_secret(encrypted) == "secret"
