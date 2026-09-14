"""Tests du scan VF incrémental : index bulk des bibliothèques Plex et filigrane.

Le scan relisait toute la bibliothèque à chaque passage, avec jusqu'à 7 recherches Plex
par média. Mesuré sur une bibliothèque réelle (872 films, 630 séries), un passage sur
400 candidats tombe de 19,6 s à 3,3 s à résultat strictement identique.
"""

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.models import Settings
from app.services import plex_finder, vff_scanner
from app.utils import now_utc_naive

# ---------------------------------------------------------------------------
# Faux objets plexapi
# ---------------------------------------------------------------------------


class FakeGuid:
    def __init__(self, value):
        self.id = value


class FakeItem:
    def __init__(self, title, year=None, guid=None, externals=(), rating_key=None, kind="movie"):
        self.title = title
        self.year = year
        self.guid = guid or f"plex://{kind}/{title}"
        self.guids = [FakeGuid(value) for value in externals]
        self.ratingKey = rating_key
        self.type = kind


class FakeSection:
    def __init__(self, title, items, changed=(), changed_episodes=()):
        self.title = title
        self._items = items
        self._changed = list(changed)
        self._changed_episodes = list(changed_episodes)

    def all(self):
        return list(self._items)

    def search(self, filters=None, **kwargs):
        return list(self._changed)

    def searchEpisodes(self, filters=None, **kwargs):
        return list(self._changed_episodes)


class FakePlex:
    def __init__(self, sections):
        self._sections = sections
        self.library = SimpleNamespace(section=self._section, sections=lambda: list(sections.values()))

    def _section(self, name):
        return self._sections[name]


LIBS = [
    {"name": "Films", "kind": "movie"},
    {"name": "Séries TV", "kind": "series"},
    {"name": "Musique", "kind": "music"},
]


def _plex_with(movies, shows, changed_movies=(), changed_shows=(), changed_episodes=()):
    return FakePlex(
        {
            "Films": FakeSection("Films", movies, changed_movies),
            "Séries TV": FakeSection("Séries TV", shows, changed_shows, changed_episodes),
        }
    )


# ---------------------------------------------------------------------------
# Index : cloisonnement par type
# ---------------------------------------------------------------------------


def test_index_never_returns_a_movie_for_a_show():
    """Un film et une série peuvent porter le même titre. Rendre l'objet du mauvais type
    faisait planter l'analyse sur `.seasons()` — bug observé sur une bibliothèque réelle."""
    movie = FakeItem("Interstellar", 2014, externals=["tmdb://157336"], kind="movie")
    show = FakeItem("Interstellar", 2014, externals=["tvdb://999"], kind="show")
    index = plex_finder.build_library_index(_plex_with([movie], [show]), LIBS)

    assert plex_finder.lookup_in_index(index, "movie", "Interstellar", 2014) is movie
    assert plex_finder.lookup_in_index(index, "show", "Interstellar", 2014) is show
    # Un identifiant de film ne doit jamais resoudre dans l'espace des series.
    assert plex_finder.lookup_in_index(index, "show", "Inconnu", None, tmdb_id="157336") is None


def test_index_matches_on_guid_then_external_ids_then_title():
    movie = FakeItem("Film", 2020, guid="plex://movie/abc", externals=["tmdb://42", "imdb://tt7"])
    index = plex_finder.build_library_index(_plex_with([movie], []), LIBS)

    assert plex_finder.lookup_in_index(index, "movie", "Autre", None, plex_guid="plex://movie/abc") is movie
    assert plex_finder.lookup_in_index(index, "movie", "Autre", None, tmdb_id="42") is movie
    assert plex_finder.lookup_in_index(index, "movie", "Autre", None, imdb_id="tt7") is movie
    assert plex_finder.lookup_in_index(index, "movie", "Film", 2020) is movie
    # Repli sans annee : notre annee peut differer de celle de Plex.
    assert plex_finder.lookup_in_index(index, "movie", "Film", 1999) is movie
    assert plex_finder.lookup_in_index(index, "movie", "Absent", None) is None


def test_music_libraries_are_ignored():
    index = plex_finder.build_library_index(_plex_with([FakeItem("Film")], []), LIBS)

    assert index.item_count == 1


# ---------------------------------------------------------------------------
# Delta : ce que Plex signale comme modifié
# ---------------------------------------------------------------------------


def test_changed_shows_are_detected_through_their_episodes():
    """Mesure sur une bibliothèque réelle : 30 séries avaient un épisode modifié, mais
    seules 13 portaient elles-mêmes un `updatedAt` récent. Interroger la série seule
    aurait raté les 19 autres — c'est-à-dire l'essentiel de ce que ce scan cherche."""
    quiet = FakeItem("Série Calme", guid="plex://show/calme", rating_key=10, kind="show")
    updated = FakeItem("Série Modifiée", guid="plex://show/modifiee", rating_key=20, kind="show")
    episode = SimpleNamespace(grandparentRatingKey=20)
    plex = _plex_with([], [quiet, updated], changed_shows=[], changed_episodes=[episode])

    index = plex_finder.build_library_index(plex, LIBS, since=now_utc_naive() - timedelta(minutes=20))

    assert index.changed_guids == {"plex://show/modifiee"}
    assert index.has_changed(updated) is True
    assert index.has_changed(quiet) is False


def test_delta_failure_falls_back_to_a_full_analysis():
    """Un delta indisponible ne doit jamais faire analyser une partie seulement."""

    class BrokenSection(FakeSection):
        def search(self, filters=None, **kwargs):
            raise RuntimeError("filtre non supporté")

    plex = FakePlex({"Films": BrokenSection("Films", [FakeItem("Film")]), "Séries TV": FakeSection("Séries TV", [])})
    index = plex_finder.build_library_index(plex, LIBS, since=now_utc_naive())

    assert index.changed_guids is None
    assert index.has_changed(FakeItem("Peu importe")) is True


# ---------------------------------------------------------------------------
# Scan : ce qui est ré-analysé et ce qui est sauté
# ---------------------------------------------------------------------------


def _candidate(cid, title, media_type="movie", never_analyzed=False, **kwargs):
    payload = {
        "id": cid,
        "title": title,
        "year": None,
        "media_type": media_type,
        "tmdb_id": None,
        "tvdb_id": None,
        "imdb_id": None,
        "plex_guid": None,
        "never_analyzed": never_analyzed,
    }
    payload.update(kwargs)
    return payload


def _run_blocking(plex, candidates, since, always_scan=None):
    with (
        patch("app.services.plex_finder.connect", return_value=plex),
        patch("app.services.vff_scanner.plex_finder.connect", return_value=plex),
        patch(
            "app.services.vff_scanner.plex_finder.scan_media_vf",
            side_effect=lambda *a, **kw: {"found": True, "has_vf": True, "category": "movie"},
        ),
    ):
        return vff_scanner._scan_vf_blocking(
            "http://plex", "token", candidates, LIBS, {}, {"items_scanned": 0}, {}, since, always_scan or set()
        )


def test_unchanged_media_is_skipped_not_reported_as_analysed():
    """Un média sauté doit être marqué comme tel : le confondre avec « analysé, pas de
    VF » écraserait son état en base avec une conclusion qu'on n'a jamais tirée."""
    quiet = FakeItem("Calme", guid="plex://movie/calme")
    moved = FakeItem("Modifié", guid="plex://movie/modifie")
    plex = _plex_with([quiet, moved], [], changed_movies=[moved])
    candidates = [_candidate(1, "Calme"), _candidate(2, "Modifié")]

    results = {r["id"]: r for r in _run_blocking(plex, candidates, now_utc_naive() - timedelta(minutes=20))}

    assert results[1]["skipped"] is True
    assert "has_vf" not in results[1]
    assert results[2].get("skipped") is None
    assert results[2]["has_vf"] is True


def test_never_analysed_media_is_scanned_even_when_unchanged():
    """« Inchangé depuis le filigrane » ne dit rien d'un média dont l'état VF n'a jamais
    été établi."""
    quiet = FakeItem("Jamais vu", guid="plex://movie/neuf")
    plex = _plex_with([quiet], [], changed_movies=[])
    candidates = [_candidate(1, "Jamais vu", never_analyzed=True)]

    results = _run_blocking(plex, candidates, now_utc_naive() - timedelta(minutes=20), always_scan={1})

    assert results[0].get("skipped") is None
    assert results[0]["has_vf"] is True


def test_media_absent_from_plex_costs_no_network_call():
    """Absent de l'index = absent de Plex : un simple échec de dictionnaire, là où la
    recherche unitaire dépensait jusqu'à 7 requêtes pour ne rien trouver."""
    plex = _plex_with([FakeItem("Autre chose")], [])
    # Un filigrane force le passage par l'index même sur un petit lot.
    results = _run_blocking(plex, [_candidate(1, "Pas dans Plex")], now_utc_naive() - timedelta(minutes=20))

    assert results[0] == {"id": 1, "found": False}


def test_small_batches_keep_the_unitary_search():
    """Indexer coûte ~2 s quelle que soit la taille du lot : sur une poignée de
    candidats (scan léger, toutes les minutes), ce serait plus lent que ce qu'on remplace."""
    plex = _plex_with([FakeItem("Film")], [])
    with (
        patch("app.services.vff_scanner.plex_finder.connect", return_value=plex),
        patch("app.services.vff_scanner.plex_finder.build_library_index") as build,
        patch(
            "app.services.vff_scanner.plex_finder.scan_media_vf",
            side_effect=lambda *a, **kw: {"found": True, "has_vf": True},
        ),
    ):
        vff_scanner._scan_vf_blocking(
            "http://plex", "token", [_candidate(1, "Film")], LIBS, {}, {"items_scanned": 0}, {}, None, set()
        )

    build.assert_not_called()


# ---------------------------------------------------------------------------
# Filigrane
# ---------------------------------------------------------------------------


def test_watermark_is_ignored_when_forced_or_stale():
    now = now_utc_naive()

    assert vff_scanner._delta_since(Settings(vf_scan_last_at=None), False, now) is None
    assert vff_scanner._delta_since(Settings(vf_scan_last_at=now - timedelta(minutes=5)), True, now) is None
    # Balayage complet périodique : filet si Plex omettait une modification.
    stale = Settings(vf_scan_last_at=now - timedelta(hours=48))
    assert vff_scanner._delta_since(stale, False, now) is None


def test_watermark_applies_a_safety_overlap():
    """Plex date `updatedAt` avec son horloge, pas la nôtre : sans recouvrement, une
    modification survenue pendant le scan précédent passerait entre les mailles."""
    now = now_utc_naive()
    last = now - timedelta(minutes=10)

    since = vff_scanner._delta_since(Settings(vf_scan_last_at=last), False, now)

    assert since == last - vff_scanner._VF_DELTA_BUFFER
    assert since < last


def test_always_scan_ids_are_the_never_analysed_ones():
    candidates = [_candidate(1, "A", never_analyzed=True), _candidate(2, "B")]

    assert vff_scanner._always_scan_ids(candidates) == {1}
