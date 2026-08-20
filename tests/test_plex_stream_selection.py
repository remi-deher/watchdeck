"""Logique de selection des pistes audio et sous-titres (alignement Plex).

Module couvert a 34% alors qu'il s'agit de la fonctionnalite la plus recente --
statistiquement la plus fragile. Ce sont aussi les decisions les plus visibles pour
l'utilisateur final : se tromper de piste ne provoque aucune erreur, ca lance
simplement le film dans la mauvaise langue, ou avec des sous-titres pour
malentendants alors que l'audio est deja en francais.

Les fonctions testees ici sont pures : elles decident a partir de la liste des pistes,
sans appel reseau. C'est la partie du module ou un test apporte le plus, et celle ou
une regression serait la plus difficile a reperer autrement.
"""

import pytest

from app.services.plex_stream_aligner import (
    choose_best_audio_stream,
    choose_best_subtitle_stream,
    find_matching_audio_stream,
    find_matching_subtitle_stream,
    is_commentary_or_ad,
    is_forced_subtitle,
    is_sdh_subtitle,
)


class Stream:
    """Double minimal d'une piste plexapi : seuls les attributs lus par le module."""

    def __init__(
        self,
        *,
        id=None,
        title=None,
        displayTitle=None,
        languageCode=None,
        language=None,
        codec=None,
        channels=None,
        forced=None,
        selected=None,
    ):
        self.id = id
        self.title = title
        self.displayTitle = displayTitle
        self.languageCode = languageCode
        self.language = language
        self.codec = codec
        self.channels = channels
        self.forced = forced
        self.selected = selected


def _fr(**kwargs) -> Stream:
    kwargs.setdefault("languageCode", "fra")
    return Stream(**kwargs)


def _vo(**kwargs) -> Stream:
    kwargs.setdefault("languageCode", "eng")
    return Stream(**kwargs)


# --- Reconnaissance des pistes particulieres ---------------------------------


@pytest.mark.parametrize(
    "title",
    [
        "Commentary",
        "Commentaire du réalisateur",
        "Audio Description",
        "Audiodescription",
        "VF-AD",
        "Français (Malvoyants)",
        "Director's commentary",
    ],
)
def test_commentary_and_audio_description_are_recognised(title):
    assert is_commentary_or_ad(Stream(title=title)) is True


@pytest.mark.parametrize("title", ["Français 5.1", "VFF TrueFrench", "English", "", None])
def test_regular_audio_tracks_are_not_mistaken_for_commentary(title):
    assert is_commentary_or_ad(Stream(title=title)) is False


@pytest.mark.parametrize(
    "title",
    ["SDH", "Français (SME)", "Sourds et malentendants", "French CC", "Hearing impaired"],
)
def test_sdh_subtitles_are_recognised(title):
    assert is_sdh_subtitle(Stream(title=title)) is True


@pytest.mark.parametrize("title", ["Français", "Français Forcé", "English Full", None])
def test_regular_subtitles_are_not_mistaken_for_sdh(title):
    assert is_sdh_subtitle(Stream(title=title)) is False


def test_forced_subtitle_detected_from_the_container_flag():
    assert is_forced_subtitle(Stream(forced=True)) is True


@pytest.mark.parametrize("title", ["Français Forcé", "Forced", "FR forces"])
def test_forced_subtitle_detected_from_the_title(title):
    """Le flag MKV est souvent absent : la mention dans le titre fait alors foi."""
    assert is_forced_subtitle(Stream(title=title)) is True


def test_regular_subtitle_is_not_forced():
    assert is_forced_subtitle(Stream(title="Français Complet")) is False


# --- Choix de la piste audio -------------------------------------------------


def test_no_audio_stream_yields_no_choice():
    assert choose_best_audio_stream([]) == (None, False)


def test_commentary_is_never_chosen_even_when_french():
    """Le piege classique : une piste de commentaire est bien en francais, mais la
    selectionner donnerait un film commente de bout en bout."""
    commentary = _fr(title="Commentaire audio")
    real = _fr(title="Français 5.1", channels=6)

    chosen, is_french = choose_best_audio_stream([commentary, real])

    assert chosen is real
    assert is_french is True


def test_vff_is_preferred_over_a_plain_french_track():
    plain = _fr(title="Français", channels=6)
    vff = _fr(title="VFF TrueFrench", channels=2)

    chosen, _ = choose_best_audio_stream([plain, vff])

    assert chosen is vff, "VFF doit primer, meme avec moins de canaux"


def test_more_channels_win_between_equivalent_french_tracks():
    stereo = _fr(title="Français", channels=2)
    surround = _fr(title="Français", channels=6)

    chosen, _ = choose_best_audio_stream([stereo, surround])

    assert chosen is surround


def test_quebec_french_ranks_below_european_french():
    vfq = _fr(title="VFQ", channels=6)
    vff = _fr(title="VFF", channels=6)

    chosen, _ = choose_best_audio_stream([vfq, vff])

    assert chosen is vff


def test_without_french_the_already_selected_track_is_kept():
    """Sans piste francaise, on ne doit pas bousculer le choix de l'utilisateur."""
    english = _vo(title="English")
    japanese = Stream(languageCode="jpn", title="Japanese", selected=True)

    chosen, is_french = choose_best_audio_stream([english, japanese])

    assert chosen is japanese
    assert is_french is False


def test_without_french_and_without_selection_the_first_track_is_used():
    first = _vo(title="English")
    second = Stream(languageCode="jpn", title="Japanese")

    chosen, is_french = choose_best_audio_stream([first, second])

    assert chosen is first
    assert is_french is False


def test_a_lone_french_commentary_does_not_count_as_french_audio():
    """Si la seule piste francaise est un commentaire, le media n'est pas VF."""
    chosen, is_french = choose_best_audio_stream([_vo(title="English", selected=True), _fr(title="Commentary")])

    assert is_french is False


# --- Choix des sous-titres ---------------------------------------------------


def test_french_audio_selects_forced_subtitles():
    """Audio FR : seuls les passages en langue etrangere doivent etre sous-titres."""
    forced = _fr(title="Français Forcé", codec="srt")
    full = _fr(title="Français Complet", codec="srt")

    chosen, apply = choose_best_subtitle_stream([full, forced], is_french_audio=True)

    assert chosen is forced
    assert apply is True


def test_forced_subtitles_prefer_srt_over_image_formats():
    """Un sous-titre image (PGS) force le transcodage video sur beaucoup de televiseurs."""
    pgs = _fr(title="Français Forcé", codec="pgs")
    srt = _fr(title="Français Forcé", codec="srt")

    chosen, _ = choose_best_subtitle_stream([pgs, srt], is_french_audio=True)

    assert chosen is srt


def test_french_audio_without_forced_subtitles_disables_them():
    """Laisser des sous-titres complets sur une piste deja francaise serait genant."""
    chosen, apply = choose_best_subtitle_stream([_fr(title="Français Complet", codec="srt")], is_french_audio=True)

    assert chosen is None
    assert apply is True, "la desactivation doit bien etre appliquee, pas ignoree"


def test_original_audio_selects_full_french_subtitles():
    forced = _fr(title="Français Forcé", codec="srt")
    full = _fr(title="Français Complet", codec="srt")

    chosen, apply = choose_best_subtitle_stream([forced, full], is_french_audio=False)

    assert chosen is full
    assert apply is True


def test_original_audio_prefers_standard_srt_over_sdh():
    sdh = _fr(title="Français SDH", codec="srt")
    standard = _fr(title="Français", codec="srt")

    chosen, _ = choose_best_subtitle_stream([sdh, standard], is_french_audio=False)

    assert chosen is standard


def test_original_audio_falls_back_to_sdh_when_it_is_the_only_option():
    sdh = _fr(title="Français SDH", codec="srt")

    chosen, apply = choose_best_subtitle_stream([sdh], is_french_audio=False)

    assert chosen is sdh
    assert apply is True


def test_a_lone_french_subtitle_flagged_forced_is_still_used():
    """Cas frequent de mauvais muxage : l'unique piste francaise est taguee 'forced'
    a tort. La refuser laisserait le spectateur sans aucun sous-titre."""
    lone = _fr(title="Français", forced=True, codec="srt")

    chosen, apply = choose_best_subtitle_stream([lone], is_french_audio=False)

    assert chosen is lone
    assert apply is True


def test_nothing_is_touched_when_no_french_subtitle_matches():
    """En cas de doute, la regle est de ne rien modifier."""
    current = _vo(title="English")

    chosen, apply = choose_best_subtitle_stream([current], is_french_audio=False, current_selected_sub=current)

    assert chosen is current
    assert apply is False, "should_apply=False signifie : ne rien changer"


def test_no_subtitle_stream_yields_no_choice():
    assert choose_best_subtitle_stream([], is_french_audio=True) == (None, False)


# --- Reappariement d'une piste sur un autre fichier --------------------------


def test_audio_is_matched_by_exact_id_first():
    target = _fr(id=42, title="Français")
    other = _fr(id=7, title="Français")

    assert find_matching_audio_stream([other, target], target_id=42) is target


def test_audio_falls_back_to_language_when_the_id_is_absent():
    """Les identifiants de piste changent d'un episode a l'autre : la langue prend
    le relais, sinon l'alignement par lot ne fonctionnerait que sur le premier."""
    english = _vo(title="English")
    french = _fr(title="Français")

    assert find_matching_audio_stream([english, french], target_id=999, target_language="fra") is french


def test_audio_falls_back_to_the_title_then_to_the_first_stream():
    first = Stream(languageCode="jpn", title="Japanese")
    tagged = Stream(languageCode="und", title="Version Française")

    assert find_matching_audio_stream([first, tagged], target_language="française") is tagged
    assert find_matching_audio_stream([first, tagged], target_language="klingon") is first


def test_subtitle_target_zero_means_disabled():
    """0 est une valeur significative : « aucun sous-titre », a distinguer de
    « aucune correspondance trouvee »."""
    assert find_matching_subtitle_stream([_fr(id=1)], target_id=0) is None


def test_subtitle_matching_respects_the_forced_preference():
    full = _fr(id=1, title="Français Complet")
    forced = _fr(id=2, title="Français Forcé")

    assert find_matching_subtitle_stream([full, forced], target_language="fra", target_forced=True) is forced
    assert find_matching_subtitle_stream([full, forced], target_language="fra", target_forced=False) is full


def test_subtitle_matching_returns_nothing_when_no_language_matches():
    assert find_matching_subtitle_stream([_vo(id=1, title="English")], target_language="fra") is None
