import { describe, expect, it } from 'vitest';
import { foldPlaybackRuns, historyCsv, playbackLocation } from './playbackRuns';

const base = { user_name: 'Rémi', player: 'Edge' };

describe('foldPlaybackRuns', () => {
  it('replie les reprises d’un même épisode, pas deux épisodes qui se suivent', () => {
    const items = [
      { ...base, id: 3, rating_key: '106', title: 'La Mort', grandparent_title: 'South Park', season_number: 1, episode_number: 6 },
      { ...base, id: 2, rating_key: '105', title: 'Un éléphant', grandparent_title: 'South Park', season_number: 1, episode_number: 5 },
      { ...base, id: 1, rating_key: '105', title: 'Un éléphant', grandparent_title: 'South Park', season_number: 1, episode_number: 5 },
      { ...base, id: 5, title: 'É2', grandparent_title: 'Série', season_number: 1, episode_number: 2 },
      { ...base, id: 4, title: 'É1', grandparent_title: 'Série', season_number: 1, episode_number: 1 },
    ];
    const runs = foldPlaybackRuns(items);
    expect(runs.map((run) => run.count)).toEqual([1, 2, 1, 1]);
    expect(runs[1].items.map((item) => item.id)).toEqual([2, 1]);
  });

  it('cumule les durées et marque « mixed » des reprises aux modes différents', () => {
    const runs = foldPlaybackRuns([
      { ...base, id: 1, rating_key: '9', title: 'É1', playback_method: 'direct_play', watched_ms: 1000 },
      { ...base, id: 2, rating_key: '9', title: 'É1', playback_method: 'transcode', watched_ms: 2000 },
      { ...base, id: 3, title: 'Film', playback_method: 'transcode', watched_ms: 500 },
    ]);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ count: 2, watchedMs: 3000, method: 'mixed' });
    expect(runs[1].method).toBe('transcode');
  });

  it('ne replie pas deux personnes ni deux appareils', () => {
    const runs = foldPlaybackRuns([
      { id: 1, rating_key: '9', title: 'A', user_name: 'Lisa', player: 'TV' },
      { id: 2, rating_key: '9', title: 'A', user_name: 'Rémi', player: 'TV' },
      { id: 3, rating_key: '9', title: 'A', user_name: 'Rémi', player: 'Mobile' },
    ]);
    expect(runs).toHaveLength(3);
  });
});

describe('historique', () => {
  it('dit le lieu d’une lecture', () => {
    expect(playbackLocation({ geo_status: 'local' })).toBe('local');
    expect(playbackLocation({ geo_status: 'anonymized' })).toBe('Lieu masqué');
    expect(playbackLocation({ geo_city: 'Paris', geo_region: 'Île-de-France', geo_country_code: 'FR' })).toBe('Paris, Île-de-France, FR');
    expect(playbackLocation({})).toBe('Lieu indisponible');
  });

  it('exporte une ligne par reprise, entre guillemets', () => {
    const csv = historyCsv(foldPlaybackRuns([{ id: 1, title: 'Film "A"', user_name: 'Lisa', player: 'TV', watched_ms: 61_000, started_at: '2026-08-03T20:00:00' }]));
    const [header, line] = csv.split('\r\n');
    expect(header).toContain('"Titre"');
    expect(line).toContain('"Film ""A"""');
    expect(line).toContain('"61"');
  });
});
