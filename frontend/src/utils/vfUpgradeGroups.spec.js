import { describe, expect, it } from 'vitest';

import { filterVfUpgradeItems, groupVfUpgradeItems } from './vfUpgradeGroups';

const item = (id, season, episode, overrides = {}) => ({
  id,
  source_type: 'library_item',
  source_id: 12,
  scope: episode == null ? 'season' : 'episode',
  season_number: season,
  episode_number: episode,
  status: 'pending',
  release_count: 1,
  releases: [{ title: `Serie.S${season}.E${episode ?? 'pack'}.MULTI` }],
  media: { title: 'Ma série', media_type: 'show' },
  ...overrides,
});

describe('regroupement des améliorations VF', () => {
  it('regroupe une série, trie ses saisons et place le pack avant les épisodes', () => {
    const groups = groupVfUpgradeItems([
      item(3, 2, 4),
      item(1, 1, 3),
      item(2, 1, null),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].seasons.map(season => season.label)).toEqual(['Saison 1', 'Saison 2']);
    expect(groups[0].seasons[0].items.map(entry => entry.id)).toEqual([2, 1]);
    expect(groups[0].releaseCount).toBe(3);
  });

  it('conserve des cartes séparées pour deux médias différents', () => {
    const groups = groupVfUpgradeItems([
      item(1, 1, null),
      item(2, 1, null, { source_id: 99, media: { title: 'Autre série', media_type: 'show' } }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it('distingue une serie sans saison precise (scope show) d\'un film', () => {
    const showWaiting = item(1, null, null, {
      scope: 'show',
      status: 'waiting_release',
      media: { title: 'Moi, quand je me réincarne en Slime', media_type: 'show' },
    });
    const movie = item(2, null, null, {
      scope: 'movie',
      source_id: 55,
      media: { title: 'Un film', media_type: 'movie' },
    });

    const [showGroup, movieGroup] = groupVfUpgradeItems([showWaiting, movie]);

    expect(showGroup.seasons).toHaveLength(1);
    expect(showGroup.seasons[0].key).toBe('show');
    expect(showGroup.seasons[0].label).toBe('Série');

    expect(movieGroup.seasons).toHaveLength(1);
    expect(movieGroup.seasons[0].key).toBe('movie');
    expect(movieGroup.seasons[0].label).toBe('Film');
  });

  it('filtre les cibles avant le regroupement par état ou titre de release', () => {
    const values = [
      item(1, 1, 1, { status: 'verified' }),
      item(2, 1, 2, { status: 'downloading', releases: [{ title: 'Release.Cible.VFF' }] }),
    ];

    expect(filterVfUpgradeItems(values, '', 'downloading').map(entry => entry.id)).toEqual([2]);
    expect(filterVfUpgradeItems(values, 'cible', '').map(entry => entry.id)).toEqual([2]);
  });

  it('le filtre "ignored" ne retient que les cibles marquees is_ignored', () => {
    const values = [
      item(1, 1, 1, { status: 'dismissed' }),
      item(2, 1, 2, { status: 'dismissed', is_ignored: true }),
      item(3, 1, 3, { status: 'pending' }),
    ];

    expect(filterVfUpgradeItems(values, '', 'ignored').map(entry => entry.id)).toEqual([2]);
  });

  it('le filtre "history" exclut les cibles ignorees via le bouton serie', () => {
    const values = [
      item(1, 1, 1, { status: 'dismissed' }),
      item(2, 1, 2, { status: 'dismissed', is_ignored: true }),
      item(3, 1, 3, { status: 'verified' }),
    ];

    expect(filterVfUpgradeItems(values, '', 'history').map(entry => entry.id)).toEqual([1, 3]);
  });
});
