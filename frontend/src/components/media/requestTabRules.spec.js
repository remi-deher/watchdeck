import { describe, expect, it } from 'vitest';

import { autoImportFromChoice, autoImportValue, directHeadline, directSubtitle, hasFollowActions, mediaNoun, requesterOptions } from './requestTabRules';

describe('requestTabRules', () => {
  it('distingue « suivre le réglage global » de « désactivé »', () => {
    expect(autoImportValue({})).toBe('inherit');
    expect(autoImportValue({ auto_import_reconciliation: null })).toBe('inherit');
    expect(autoImportValue({ auto_import_reconciliation: true })).toBe('on');
    expect(autoImportValue({ auto_import_reconciliation: false })).toBe('off');
    expect(autoImportFromChoice('inherit')).toBeNull();
    expect(autoImportFromChoice('on')).toBe(true);
    expect(autoImportFromChoice('off')).toBe(false);
  });

  it('ne propose le groupe Suivi que s’il a une action', () => {
    expect(hasFollowActions({ status: 'available', has_vf: true })).toBe(false);
    expect(hasFollowActions({ status: 'available', has_vf: true, arr_id: 3 })).toBe(true);
    expect(hasFollowActions({ status: 'pending_approval' })).toBe(true);
  });

  it('liste les personnes à ajouter, ou dit qu’il n’y en a plus', () => {
    expect(requesterOptions([])).toEqual([{ value: '', label: 'Tous les utilisateurs sont déjà demandeurs' }]);
    expect(requesterOptions([{ plex_user_id: 'paul', custom_name: 'Paulo', display_name: 'Paul' }])[1]).toEqual({ value: 'paul', label: 'Paulo' });
  });

  it('décrit un média arrivé sans demande', () => {
    expect(mediaNoun({ media_type: 'show' })).toBe('cette série');
    expect(mediaNoun({})).toBe('ce média');
    expect(directHeadline({ arr_id: 3, media_type: 'movie' })).toBe('Ajouté directement dans Radarr');
    expect(directHeadline({})).toBe('Ajouté directement dans Plex');
    expect(directSubtitle({ has_vf: false })).toBe('VF absente');
  });
});
