import { describe, expect, it } from 'vitest';
import { episodeLabel } from './episode';

describe('episodeLabel', () => {
  it('donne la saison et l’épisode', () => {
    expect(episodeLabel({ season_number: 1, episode_number: 11, parent_title: 'Saison 1' })).toBe('S1 · É11');
    expect(episodeLabel({ parent_title: 'Saison 1' }, { season: 2, episode: 3 })).toBe('S2 · É3');
    expect(episodeLabel({ episode_number: 4 })).toBe('Épisode 4');
    expect(episodeLabel({ parent_title: 'Saison 1' })).toBe('Saison 1');
    expect(episodeLabel({})).toBe('');
  });
});
