"""Tests unitaires pour app/routers/arr_releases_api.py."""

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import ArrInstance, Base, LibraryItem
from app.routers.arr_releases_api import arr_root_folder
from tests.async_support import TestSession


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = TestSession(Session())
    yield session
    session.close()


def _radarr_instance(db, **kwargs):
    defaults = dict(
        name="Radarr", arr_type="radarr", url="http://radarr.local", api_key="key", enabled=True, is_default=True
    )
    defaults.update(kwargs)
    inst = ArrInstance(**defaults)
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return inst


def _sonarr_instance(db, **kwargs):
    defaults = dict(
        name="Sonarr", arr_type="sonarr", url="http://sonarr.local", api_key="key", enabled=True, is_default=True
    )
    defaults.update(kwargs)
    inst = ArrInstance(**defaults)
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return inst


def _movie_item(db, **kwargs) -> LibraryItem:
    defaults = dict(title="Some Movie", media_type="movie", arr_id=99, has_vf=False)
    defaults.update(kwargs)
    item = LibraryItem(**defaults)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def _show_item(db, **kwargs) -> LibraryItem:
    defaults = dict(title="Some Show", media_type="show", arr_id=42, has_vf=False)
    defaults.update(kwargs)
    item = LibraryItem(**defaults)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@pytest.mark.asyncio
async def test_arr_root_folder_movie(db):
    _radarr_instance(db)
    item = _movie_item(db)

    with patch(
        "app.routers.arr_releases_api.radarr.get_movie_by_id",
        new=AsyncMock(return_value={"id": 99, "rootFolderPath": "/movies"}),
    ):
        result = await arr_root_folder(media_type="movie", source_type="library_item", source_id=item.id, db=db)

    assert result == {"root_folder_path": "/movies"}


@pytest.mark.asyncio
async def test_arr_root_folder_show(db):
    _sonarr_instance(db)
    item = _show_item(db)

    with patch(
        "app.routers.arr_releases_api.sonarr.get_series_by_id",
        new=AsyncMock(return_value={"id": 42, "rootFolderPath": "/tv"}),
    ):
        result = await arr_root_folder(media_type="show", source_type="library_item", source_id=item.id, db=db)

    assert result == {"root_folder_path": "/tv"}


@pytest.mark.asyncio
async def test_arr_root_folder_none_when_media_missing_upstream(db):
    """Media supprime cote *arr (get_..._by_id -> None) : pas d'erreur, juste vide."""
    _radarr_instance(db)
    item = _movie_item(db)

    with patch(
        "app.routers.arr_releases_api.radarr.get_movie_by_id",
        new=AsyncMock(return_value=None),
    ):
        result = await arr_root_folder(media_type="movie", source_type="library_item", source_id=item.id, db=db)

    assert result == {"root_folder_path": None}
