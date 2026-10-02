import { describe, expect, it } from 'vitest';
import { playbackStartsFromEvent, playbackTitle } from './playbackToast';

describe('playback toast helpers', () => {
  it('formate un épisode avec sa série', () => {
    expect(playbackTitle({ grandparent_title: 'Foundation', title: 'Création et destruction' }))
      .toBe('Foundation · Création et destruction');
  });

  it('extrait uniquement les nouvelles lectures du payload SSE', () => {
    const started = [{ session_id: 'one', user_name: 'Rémi', title: 'Dune' }];
    expect(playbackStartsFromEvent({ detail: { payload: { active: 2, started } } })).toEqual(started);
    expect(playbackStartsFromEvent({ detail: { payload: { active: 2 } } })).toEqual([]);
  });
  it('ajoute saison et épisode quand Plex les donne', () => {
    expect(playbackTitle({ grandparent_title: 'Samurai Champloo', title: 'Les flibustiers', season_number: 1, episode_number: 11 }))
      .toBe('Samurai Champloo · S1 · É11 · Les flibustiers');
  });
});
