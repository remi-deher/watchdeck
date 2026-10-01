"""Code d'installation exige pour creer le premier compte (ou restaurer une sauvegarde).

Tant qu'aucun compte n'existe, /setup est public par construction. Sans ce code,
quiconque atteint l'instance avant son proprietaire (exposition directe sur Internet
juste apres le deploiement) pourrait s'en attribuer l'administration, ou restaurer une
archive de son choix. Le code est ecrit dans les journaux du conteneur au demarrage :
seul celui qui a la main sur le serveur le connait.
"""

import hmac
import logging
import os
import secrets

logger = logging.getLogger(__name__)

_SETUP_CODE_FILE = os.path.join("data", ".setup_code")


def setup_code() -> str:
    """Lit ou genere le code (WATCHDECK_SETUP_CODE prioritaire, sinon data/.setup_code)."""
    env_code = (os.getenv("WATCHDECK_SETUP_CODE") or "").strip()
    if env_code:
        return env_code
    try:
        with open(_SETUP_CODE_FILE) as f:
            code = f.read().strip()
            if code:
                return code
    except OSError:
        pass
    code = "-".join(secrets.token_hex(2).upper() for _ in range(3))
    os.makedirs(os.path.dirname(_SETUP_CODE_FILE), exist_ok=True)
    with open(_SETUP_CODE_FILE, "w") as f:
        f.write(code)
    try:
        os.chmod(_SETUP_CODE_FILE, 0o600)
    except OSError:
        pass
    return code


def verify_setup_code(candidate: str | None) -> bool:
    return hmac.compare_digest(setup_code().upper(), (candidate or "").strip().upper())


def discard_setup_code() -> None:
    """Le code ne sert qu'une fois : supprime des que l'installation est faite."""
    try:
        os.remove(_SETUP_CODE_FILE)
    except OSError:
        pass


def announce_setup_code() -> None:
    logger.warning(
        "Installation en attente : code d'installation a saisir sur /setup -> %s (voir aussi data/.setup_code)",
        setup_code(),
    )
