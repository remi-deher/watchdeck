"""Fusion multi-sources de l'historique de lecture.

Aucune source n'écrase l'autre : chacune apporte ce qu'elle sait, et ne remplit que ce
qui manque. Plex fournit les lectures, Tracearr et Tautulli les décisions, la capture
directe le détail du flux vivant. Le résultat est une ligne unique par lecture réelle,
plus riche qu'aucune source prise isolément.

Trois règles portent tout le fichier, et chacune répond à un piège concret.

1. « Manquant » se décide champ par champ, pas par ``is None``.
   ``playback_method = "unknown"`` n'est pas une valeur vide : c'est précisément le trou
   qu'on veut combler. ``bandwidth_kbps = 0`` non plus. Un test global sur ``None``
   serait passé à côté de l'essentiel de ce que l'enrichissement vise.

2. Les conflits se tranchent par précédence, jamais par ordre d'arrivée.
   « Ne pas écraser » revient sinon à « le premier import gagne », et l'ordre des tâches
   déciderait des statistiques. La précédence est explicite et journalisée quand deux
   sources se contredisent sur une valeur déjà renseignée.

3. La provenance est mémorisée.
   Sans elle, la règle n'est qu'une convention tacite et un import ultérieur doit
   deviner ce qu'il a le droit d'améliorer.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Iterable, Optional

from sqlalchemy import or_
from sqlalchemy.future import select

from ..models import PlaybackSession

logger = logging.getLogger(__name__)

# Précédence des sources, de la plus fiable à la moins fiable.
#
# `plex` est notre capture directe : elle observe la session vivante, au moment où elle
# se produit, et c'est la seule à voir le flux tel qu'il est réellement servi.
# `tracearr` vient ensuite -- même observation directe, instance à jour, et le contrat
# d'API le plus riche des trois. `tautulli` suit. `plex_history` ferme la marche : Plex
# ne persiste aucune décision de lecture, cette source n'apporte que de la couverture.
SOURCE_PRECEDENCE: tuple[str, ...] = ("plex", "tracearr", "tautulli", "plex_history")

#: Sources qui ne portent aucune mesure de durée : elles ne doivent jamais renseigner
#: `watched_ms`, sous peine de faire passer une absence de mesure pour un zéro.
COVERAGE_ONLY_SOURCES = frozenset({"plex_history"})

#: Champs dont la valeur décrit la lecture entière et non un segment.
#:
#: Tracearr expose son historique au grain « lecture » : une reprise regroupe plusieurs
#: sessions en une chaîne, et `duration_ms` y est la somme de tous ses segments. Nous
#: stockons au grain « session ». Recopier le total d'une chaîne sur une seule de nos
#: sessions gonflerait son temps regardé d'autant de segments qu'elle en compte -- cinq
#: lectures de Companion valent neuf sessions chez nous et cinq chaînes chez Tracearr.
CHAIN_LEVEL_FIELDS = frozenset({"watched_ms", "progress_ms", "progress_percent", "duration_ms"})

#: Champs qu'une autre source peut remplir s'ils manquent, mais dont l'écart ne constitue
#: jamais un désaccord.
#:
#: Chaque source a son propre identifiant de session -- ils sont *censés* différer -- et
#: chacune horodate avec sa propre horloge, à la seconde près : c'est précisément ce que
#: la tolérance de rapprochement absorbe. Les signaler noierait les vrais écarts de mesure
#: sous du bruit : sur un import de 390 lectures, ils représentaient à eux seuls les trois
#: quarts des 583 « désaccords » remontés.
NON_COMPARABLE_FIELDS = frozenset({"source", "source_session_id", "started_at", "last_seen_at", "ended_at"})


def _equivalent(left: Any, right: Any) -> bool:
    """Égalité au sens du fond, pas de la forme.

    Deux sources décrivent le même flux avec des conventions différentes : `hevc` contre
    `HEVC`, `windows` contre `Windows`, `1080` contre `1080p`. Les compter comme des
    désaccords reviendrait à signaler une divergence là où il n'y a qu'une casse.
    """
    if left == right:
        return True
    if isinstance(left, str) and isinstance(right, str):
        a, b = left.strip().lower(), right.strip().lower()
        if a == b:
            return True
        # « 1080 » et « 1080p » désignent la même définition.
        return a.rstrip("p") == b.rstrip("p") and a.rstrip("p").isdigit()
    return False


def source_rank(source: str | None) -> int:
    """Rang de précédence ; une source inconnue passe après toutes les autres."""
    try:
        return SOURCE_PRECEDENCE.index(str(source or ""))
    except ValueError:
        return len(SOURCE_PRECEDENCE)


def _is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def _is_missing_playback_method(value: Any) -> bool:
    """« unknown » est un aveu d'ignorance, pas une décision de lecture."""
    return _is_blank(value) or str(value).strip().lower() == "unknown"


def _is_missing_positive(value: Any) -> bool:
    """Débit, taille, durée : zéro signifie « non communiqué » dans toutes nos sources."""
    return value is None or value == 0


#: Prédicat de « valeur manquante » par champ. Le défaut (`_is_blank`) couvre les champs
#: textuels ; seuls les champs où le vide s'exprime autrement sont listés ici.
MISSING_PREDICATES = {
    "playback_method": _is_missing_playback_method,
    "bandwidth_kbps": _is_missing_positive,
    "media_size_bytes": _is_missing_positive,
    "duration_ms": _is_missing_positive,
    "watched_ms": _is_missing_positive,
    "progress_ms": _is_missing_positive,
    "progress_percent": _is_missing_positive,
    "group_count": lambda value: value is None or value <= 1,
    "year": _is_missing_positive,
}


def is_missing(field_name: str, value: Any) -> bool:
    return MISSING_PREDICATES.get(field_name, _is_blank)(value)


@dataclass
class MergeOutcome:
    """Ce qu'une fusion a réellement changé, pour le compte rendu d'import."""

    created: int = 0
    enriched: int = 0
    unchanged: int = 0
    conflicts: list[str] = field(default_factory=list)
    days: set = field(default_factory=set)

    def merge(self, other: "MergeOutcome") -> None:
        self.created += other.created
        self.enriched += other.enriched
        self.unchanged += other.unchanged
        self.conflicts.extend(other.conflicts)
        self.days |= other.days


def _provenance(session: PlaybackSession) -> dict[str, str]:
    try:
        loaded = json.loads(session.enrichment_sources or "{}")
    except (TypeError, ValueError):
        return {}
    return loaded if isinstance(loaded, dict) else {}


def _store_provenance(session: PlaybackSession, provenance: dict[str, str]) -> None:
    session.enrichment_sources = json.dumps(provenance, sort_keys=True) if provenance else None


def apply_enrichment(
    session: PlaybackSession,
    values: dict[str, Any],
    source: str,
    *,
    outcome: MergeOutcome | None = None,
    segment_count: int = 1,
) -> bool:
    """Complète `session` avec `values` sans jamais écraser une valeur déjà connue.

    Renvoie True si au moins un champ a été renseigné. Une valeur entrante vide n'écrit
    rien : une source qui ignore un champ ne doit pas effacer ce qu'une autre a su.

    `segment_count` décrit combien de sessions l'enregistrement entrant agrège. Au-delà
    de un, ses durées portent sur la chaîne entière et ne peuvent pas être attribuées à
    la session qu'on enrichit ; seules les caractéristiques du flux -- décisions, codecs,
    appareil, débit -- restent valables, parce qu'elles ne varient pas d'un segment à
    l'autre d'une même lecture.
    """
    provenance = _provenance(session)
    changed = False
    for name, incoming in values.items():
        if not hasattr(session, name):
            continue
        if is_missing(name, incoming):
            continue
        if name == "watched_ms" and source in COVERAGE_ONLY_SOURCES:
            # Cette source ne mesure pas les durées : la laisser écrire ferait passer
            # une absence de mesure pour une lecture de zéro seconde.
            continue
        if segment_count > 1 and name in CHAIN_LEVEL_FIELDS:
            continue

        current = getattr(session, name)
        if is_missing(name, current):
            setattr(session, name, incoming)
            provenance[name] = source
            changed = True
            continue

        # La valeur est déjà connue. On ne l'écrase pas, mais un désaccord entre deux
        # sources est une information : il révèle une source qui dérive, et le taire
        # reviendrait à choisir silencieusement la première arrivée.
        if name in NON_COMPARABLE_FIELDS or _equivalent(current, incoming):
            continue
        if outcome is not None:
            holder = provenance.get(name, "?")
            if source_rank(source) < source_rank(holder):
                outcome.conflicts.append(
                    f"{name}: {source}={incoming!r} plus fiable que {holder}={current!r}, valeur conservée"
                )
            else:
                outcome.conflicts.append(f"{name}: {source}={incoming!r} contredit {holder}={current!r}")

    if changed:
        _store_provenance(session, provenance)
    return changed


@dataclass
class MatchKey:
    """Identité d'une lecture, telle que les trois sources permettent de la reconnaître.

    Deux ancres temporelles, parce que les sources ne datent pas la même chose.
    Tracearr et Tautulli datent le **début** de la lecture. L'historique Plex, lui, ne
    connaît que `viewedAt` : l'instant où le média a été marqué comme vu, c'est-à-dire la
    **fin**. Mesuré sur 48 lectures rapprochées de cette instance, l'écart médian entre
    `viewedAt` et notre `started_at` atteint 21 minutes (jusqu'à 2 h 14), et seules 11
    sur 48 tombaient dans une fenêtre de cinq minutes ; face à `ended_at`, la médiane
    tombe à 8 secondes et 46 sur 48 rentrent dans la fenêtre. Ancrer l'historique Plex
    sur le début aurait donc dupliqué trois lectures sur quatre.
    """

    user_name: Optional[str]
    rating_key: Optional[str]
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    title: Optional[str] = None
    segment_count: int = 1
    #: Identifiant de la lecture chez la source qui l'apporte. Rend un ré-import
    #: idempotent : la ligne déjà créée est retrouvée directement, sans passer par le
    #: rapprochement temporel.
    source_id: Optional[str] = None


def _normalized(value: Any) -> str:
    return str(value or "").strip().lower()


async def find_existing_session(
    db,
    key: MatchKey,
    *,
    tolerance: timedelta = timedelta(minutes=2),
    source: str | None = None,
) -> PlaybackSession | None:
    """Retrouve la lecture déjà connue qui correspond à `key`, quelle que soit sa source.

    Deux critères, dans cet ordre.

    **Le chevauchement d'abord.** Quand les deux côtés connaissent le début *et* la fin,
    la même lecture vue par deux sources occupe forcément le même intervalle. C'est le
    seul critère qui distingue deux lectures successives d'un même média par la même
    personne -- le cas qui piège toute règle de proximité. Mesuré sur un import réel :
    une lecture de 11:33 à 13:05 et une autre de 13:05 à 13:08 ont des *fins* distantes
    de trois minutes ; la proximité les fusionnait, le chevauchement les sépare.

    **La proximité d'ancre ensuite**, et seulement quand un côté n'a pas d'intervalle.
    C'est le cas de l'historique Plex, qui ne connaît que `viewedAt`. La tolérance
    n'absorbe alors qu'une dérive d'horloge entre sources -- mesurée à quelques secondes
    entre Tracearr et nous -- et non un écart de contenu ; deux minutes suffisent
    largement, là où cinq collaient deux lectures voisines l'une à l'autre.

    Le `rating_key` est la clé forte. Le titre ne sert que de repli, pour les sources qui
    ne le fournissent pas, et n'est jamais utilisé seul sans fenêtre temporelle.

    `source` restreint la recherche aux lignes venues d'**ailleurs**. Le rapprochement
    n'a de sens qu'entre sources différentes : à l'intérieur d'une même source,
    l'identifiant de lecture fait foi, et deux lectures qu'elle distingue sont
    réellement distinctes. Sans cette restriction, un import de Tracearr fusionnait ses
    propres lectures dès qu'elles se chevauchaient -- même film, même personne, deux
    appareils --, ce qui revenait à contredire la source qu'on importe. Une ligne déjà
    créée par la même source est en revanche retrouvée par son identifiant, ce qui rend
    les imports répétés idempotents.
    """
    if source and key.source_id:
        same_source = (
            await db.execute(
                select(PlaybackSession).filter(
                    PlaybackSession.source == source,
                    PlaybackSession.source_session_id == key.source_id,
                )
            )
        ).scalars().first()
        if same_source is not None:
            return same_source

    moments = [moment for moment in (key.started_at, key.ended_at) if moment]
    if not moments:
        return None
    low, high = min(moments) - tolerance, max(moments) + tolerance

    # Pré-filtre large : toute ligne dont le début ou la fin tombe dans la fenêtre, plus
    # celles qui l'enjambent entièrement. Le tri fin se fait ensuite en Python, où le
    # chevauchement s'exprime sans acrobatie SQL.
    span = or_(
        (PlaybackSession.started_at >= low) & (PlaybackSession.started_at <= high),
        (PlaybackSession.ended_at >= low) & (PlaybackSession.ended_at <= high),
        (PlaybackSession.started_at <= low) & (PlaybackSession.ended_at >= high),
    )
    if key.rating_key:
        identity = PlaybackSession.rating_key == str(key.rating_key)
    elif key.title:
        identity = or_(PlaybackSession.title == key.title, PlaybackSession.grandparent_title == key.title)
    else:
        return None

    filters = [span, identity]
    if source:
        filters.append(PlaybackSession.source != source)
    candidates = (await db.execute(select(PlaybackSession).filter(*filters))).scalars().all()
    if not candidates:
        return None

    user = _normalized(key.user_name)
    if user:
        matching_user = [row for row in candidates if _normalized(row.user_name) == user]
        if not matching_user:
            # Même média, même instant, mais une autre personne : ce sont deux lectures
            # simultanées distinctes, pas la même vue par deux sources.
            return None
        candidates = matching_user

    def _overlap(row: PlaybackSession) -> float:
        """Secondes communes aux deux intervalles ; négatif s'ils sont disjoints."""
        if not (key.started_at and key.ended_at and row.started_at and row.ended_at):
            return float("nan")
        latest_start = max(key.started_at, row.started_at)
        earliest_end = min(key.ended_at, row.ended_at)
        return (earliest_end - latest_start).total_seconds()

    def _anchor_gap(row: PlaybackSession) -> float:
        gaps = []
        if key.started_at and row.started_at:
            gaps.append(abs((row.started_at - key.started_at).total_seconds()))
        if key.ended_at and row.ended_at:
            gaps.append(abs((row.ended_at - key.ended_at).total_seconds()))
        return min(gaps) if gaps else float("inf")

    overlapping = [(row, _overlap(row)) for row in candidates]
    comparable = [(row, value) for row, value in overlapping if value == value]  # écarte les NaN
    if comparable:
        # Les deux côtés ont un intervalle : seul un vrai chevauchement fait foi.
        positive = [(row, value) for row, value in comparable if value > 0]
        if not positive:
            return None
        return max(positive, key=lambda pair: pair[1])[0]

    # Un côté n'a pas d'intervalle : on retombe sur la proximité d'ancre, bornée.
    within = [row for row in candidates if _anchor_gap(row) <= tolerance.total_seconds()]
    if not within:
        return None
    return min(within, key=_anchor_gap)


async def merge_playback_records(
    db,
    records: Iterable[tuple[MatchKey, dict[str, Any]]],
    source: str,
    *,
    tolerance: timedelta = timedelta(minutes=2),
    create_missing: bool = True,
) -> MergeOutcome:
    """Fusionne un lot d'enregistrements importés dans les lectures déjà connues.

    `records` associe une identité à l'ensemble des champs que la source sait remplir.
    Les lignes créées le sont avec `source` pour origine ; celles qui existent déjà sont
    enrichies sans perdre ce qu'elles portaient.
    """
    outcome = MergeOutcome()
    for key, values in records:
        existing = await find_existing_session(db, key, tolerance=tolerance, source=source)
        if existing is not None:
            if apply_enrichment(existing, values, source, outcome=outcome, segment_count=key.segment_count):
                outcome.enriched += 1
                outcome.days.add(existing.started_at.date())
            else:
                outcome.unchanged += 1
            continue

        if not create_missing:
            outcome.unchanged += 1
            continue

        # Une chaîne qu'aucune source locale n'a vue devient une ligne unique portant son
        # nombre de segments : c'est déjà la sémantique de `group_count` chez nous.
        created = PlaybackSession(source=source, **{name: value for name, value in values.items() if value is not None})
        if key.segment_count > 1:
            created.group_count = key.segment_count
        # La provenance d'une ligne neuve est intégralement celle de sa source.
        _store_provenance(created, {name: source for name, value in values.items() if not is_missing(name, value)})
        if source in COVERAGE_ONLY_SOURCES:
            created.watched_ms = None
        db.add(created)
        outcome.created += 1
        if created.started_at:
            outcome.days.add(created.started_at.date())

    if outcome.conflicts:
        logger.info(
            "Import %s : %d désaccord(s) de valeur, valeur existante conservée (%s)",
            source,
            len(outcome.conflicts),
            "; ".join(outcome.conflicts[:5]),
        )
    return outcome
