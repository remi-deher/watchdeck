"""Test-only helpers for code paths migrated to SQLAlchemy AsyncSession."""

import os
from collections.abc import Callable
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base


class _AwaitableValue:
    def __init__(self, value: Any = None):
        self.value = value

    def __await__(self):
        async def _resolve():
            return self.value

        return _resolve().__await__()


class TestSession:
    """Expose a synchronous SQLite session through the AsyncSession protocol.

    FastAPI's TestClient runs the application in another event loop while many
    historical tests prepare and inspect data synchronously. This adapter keeps
    that setup ergonomic without restoring synchronous database APIs in app code.
    """

    __test__ = False

    def __init__(self, session: Session, dispose: Callable[[], None] | None = None):
        self.sync_session = session
        self._dispose = dispose

    def __getattr__(self, name: str):
        return getattr(self.sync_session, name)

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    def execute(self, *args, **kwargs):
        return _AwaitableValue(self.sync_session.execute(*args, **kwargs))

    def get(self, *args, **kwargs):
        return _AwaitableValue(self.sync_session.get(*args, **kwargs))

    def begin_nested(self):
        return _AsyncTransactionContext(self.sync_session.begin_nested())

    def commit(self):
        self.sync_session.commit()
        return _AwaitableValue()

    def rollback(self):
        self.sync_session.rollback()
        return _AwaitableValue()

    def flush(self):
        self.sync_session.flush()
        return _AwaitableValue()

    def refresh(self, instance, *args, **kwargs):
        self.sync_session.refresh(instance, *args, **kwargs)
        return _AwaitableValue()

    def delete(self, instance):
        self.sync_session.delete(instance)
        return _AwaitableValue()

    def _force_close(self) -> None:
        """Fermeture reelle, insensible au remplacement de close() par un test.

        Certains tests substituent `db.close = AsyncMock()` pour empecher le code
        applicatif de fermer la session en cours d'exercice (voir test_webhook.py).
        Le nettoyage de fin de test doit passer par ici, sinon il appelle le mock,
        qui renvoie une coroutine jamais attendue -- et la session reste ouverte.
        """
        _open_sessions.discard(self)
        self.sync_session.close()
        if self._dispose:
            self._dispose()
            self._dispose = None

    def close(self):
        self._force_close()
        return _AwaitableValue()


class AsyncSessionContext:
    """Async context manager returning a test session without owning it."""

    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class _AsyncTransactionContext:
    def __init__(self, transaction):
        self.transaction = transaction

    async def __aenter__(self):
        return self.transaction.__enter__()

    async def __aexit__(self, exc_type, exc, traceback):
        return self.transaction.__exit__(exc_type, exc, traceback)


# Sessions ouvertes par le test courant. De nombreux tests appellent directement
# make_test_session() sans jamais fermer (34 fichiers) : sous SQLite en memoire la
# fuite etait sans consequence (base distincte, liberee par le GC -- c'est l'origine
# des ResourceWarning "unclosed database"), mais sous PostgreSQL chaque session fuitee
# immobilise une connexion avec une transaction ouverte, qui bloque les tests suivants
# des qu'ils touchent les memes lignes. Le fixture autouse `_close_leaked_sessions`
# (voir conftest.py) vide ce registre apres chaque test.
_open_sessions: set["TestSession"] = set()


def close_leaked_sessions() -> int:
    """Ferme les sessions qu'un test a ouvertes sans les liberer. Retourne le nombre."""
    leaked = list(_open_sessions)
    for session in leaked:
        try:
            session._force_close()
        except Exception:  # noqa: BLE001 - un test en echec peut laisser une session cassee
            _open_sessions.discard(session)
    _open_sessions.clear()
    return len(leaked)


# Moteur PostgreSQL partage par toute la session de tests : le creer par test
# couterait une reconnexion + un CREATE TABLE complet a chaque fois (1200+ tests).
_pg_engine = None
# Connexion/transaction du test en cours (voir make_test_session).
_pg_connection = None
_pg_transaction = None


def _postgres_engine(url: str):
    """Moteur PostgreSQL unique, schema cree au premier appel."""
    global _pg_engine
    if _pg_engine is None:
        _pg_engine = create_engine(url, pool_pre_ping=True)
        Base.metadata.create_all(_pg_engine)
    return _pg_engine


def make_test_session() -> TestSession:
    """Session de test isolee.

    Sur PostgreSQL (TEST_DATABASE_URL defini, cas de la CI) l'isolation se fait par
    transaction externe annulee en fin de test : `join_transaction_mode="create_savepoint"`
    transforme les commit() des tests en liberations de point de sauvegarde, si bien que
    le rollback final rend la base vierge sans avoir a recreer le schema.

    Sans TEST_DATABASE_URL on retombe sur SQLite en memoire : `pytest` reste utilisable
    en local sans avoir a lancer un PostgreSQL. Attention cependant, c'est un filet de
    confort et non l'equivalent de la CI -- SQLite ne reproduit ni les contraintes de
    longueur, ni le typage strict, ni le modele de verrouillage de PostgreSQL, qui est
    ce que la production utilise reellement.
    """
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        session = sessionmaker(bind=engine, expire_on_commit=False)()
        test_session = TestSession(session, engine.dispose)
        _open_sessions.add(test_session)
        return test_session

    # Toutes les sessions d'un meme test partagent UNE connexion et UNE transaction.
    #
    # Indispensable : plusieurs tests appellent make_test_session() a repetition, et
    # des lignes sont des singletons (Settings.id a default=1). Avec une connexion par
    # session, la deuxieme insertion du meme id attendait indefiniment le verrou detenu
    # par la premiere transaction -- restee ouverte puisqu'on ne valide jamais. Sous
    # SQLite le probleme n'existait pas : chaque session avait sa propre base en memoire.
    global _pg_connection, _pg_transaction
    engine = _postgres_engine(url)
    if _pg_connection is None:
        _pg_connection = engine.connect()
        _pg_transaction = _pg_connection.begin()
    session = Session(
        bind=_pg_connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    test_session = TestSession(session, None)
    _open_sessions.add(test_session)
    return test_session


def reset_postgres_state() -> None:
    """Annule la transaction du test courant : la base redevient vierge sans DROP."""
    global _pg_connection, _pg_transaction
    if _pg_connection is None:
        return
    try:
        if _pg_transaction is not None and _pg_transaction.is_active:
            _pg_transaction.rollback()
    finally:
        _pg_connection.close()
        _pg_connection = None
        _pg_transaction = None
