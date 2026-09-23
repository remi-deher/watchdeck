import { describe, expect, it } from 'vitest';

import {
  audioRowClass, audioStatusLabel, canFixStreams, forcedRowClass, forcedStatusLabel,
  formatBackoff, formatRunDuration, releaseButtonLabel, runStatusLabel, statusLabel,
  subtitleRowClass, subtitleStatusLabel, targetLabel,
} from './vfUpgradeLabels';

const NOW = Date.parse('2026-09-23T12:00:00Z');

describe('libellés des suggestions', () => {
  it('traduit les statuts connus et laisse passer les autres', () => {
    expect(statusLabel('awaiting_verification')).toBe('Validation Plex');
    expect(statusLabel('inconnu')).toBe('inconnu');
  });

  it('nomme la cible selon sa portée', () => {
    expect(targetLabel({ scope: 'movie' })).toBe('Film');
    expect(targetLabel({ scope: 'season' })).toBe('Saison entière');
    expect(targetLabel({ scope: 'show' })).toBe('Série complète');
    expect(targetLabel({ scope: 'episode', episode_number: 3 })).toBe('Épisode 03');
  });

  it('propose de rechercher tant qu’aucune release n’existe', () => {
    expect(releaseButtonLabel({ status: 'waiting_release', release_count: 4 })).toBe('Rechercher VF');
    expect(releaseButtonLabel({ status: 'pending', release_count: 1 })).toBe('1 release');
    expect(releaseButtonLabel({ status: 'pending', release_count: 3 })).toBe('3 releases');
    expect(releaseButtonLabel({ status: 'pending' })).toBe('1 release');
  });

  it('décrit l’attente entre deux recherches infructueuses', () => {
    expect(formatBackoff(null)).toBe('');
    expect(formatBackoff({ misses: 2 })).toBe('2 recherche(s) sans résultat');
    expect(formatBackoff({ misses: 2, next_check_at: '2026-09-23T11:00:00Z' }, NOW)).toBe('2 échec(s) — nouvelle tentative au prochain cycle');
    expect(formatBackoff({ misses: 3, next_check_at: '2026-09-23T12:20:00Z' }, NOW)).toBe('3 échec(s) — prochaine tentative dans < 1h');
    expect(formatBackoff({ misses: 3, next_check_at: '2026-09-23T17:00:00Z' }, NOW)).toBe('3 échec(s) — prochaine tentative dans ~5h');
  });
});

describe('cycles de scan', () => {
  it('distingue un cycle dégradé d’un échec', () => {
    expect(runStatusLabel('running')).toBe('En cours');
    expect(runStatusLabel('success')).toBe('Terminé');
    expect(runStatusLabel('degraded')).toBe('Indexeurs injoignables');
    expect(runStatusLabel('failed')).toBe('Échec');
  });

  it('formate la durée, en cours comme terminée', () => {
    expect(formatRunDuration(null)).toBe('—');
    expect(formatRunDuration('2026-09-23T11:59:15Z', '2026-09-23T12:00:00Z')).toBe('45s');
    expect(formatRunDuration('2026-09-23T11:57:55Z', null, NOW)).toBe('2m05s');
  });
});

describe('diagnostic de l’audit', () => {
  it('qualifie l’audio FR', () => {
    expect(audioStatusLabel({ has_vf: false })).toBe('Absente (VO)');
    expect(audioStatusLabel({ has_vf: true, fr_is_default: true })).toBe('Présente (par défaut)');
    expect(audioStatusLabel({ has_vf: true, fr_is_default: false })).toBe('Piste secondaire');
    expect(audioRowClass({ has_vf: true, fr_is_default: false })).toBe('is-warning');
    expect(audioRowClass({ has_vf: false })).toBe('is-muted');
  });

  it('qualifie les sous-titres complets et forcés', () => {
    expect(subtitleStatusLabel('not_default')).toBe('Présents (inactifs)');
    expect(subtitleStatusLabel(undefined)).toBe('Non analysé');
    expect(subtitleRowClass({ sub_fr_status: 'absent' })).toBe('is-danger');
    expect(subtitleRowClass({ sub_fr_status: 'forced_default' })).toBe('is-ok');
    expect(forcedStatusLabel('not_default')).toBe('Présents mais inactifs');
    expect(forcedStatusLabel(null)).toBe('Aucun');
    expect(forcedRowClass({ forced_fr_status: 'not_default' })).toBe('is-warning');
  });

  it('ne propose l’alignement qu’à un média qui en a besoin', () => {
    expect(canFixStreams(null)).toBe(false);
    expect(canFixStreams({ has_vf: false, issues: [] })).toBe(false);
    expect(canFixStreams({ has_vf: true, issues: [] })).toBe(true);
    expect(canFixStreams({ has_vf: false, issues: ['sub_fr_not_default'] })).toBe(true);
    expect(canFixStreams({ has_vf: false, issues: ['partial_vf'] })).toBe(false);
  });
});
