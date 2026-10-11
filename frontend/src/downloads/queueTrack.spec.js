import { describe, expect, it } from 'vitest';
import { episodeLabel, historyToEvent, queueActions, queueRowToTrack, trackState } from './queueTrack';

const arr = (extra = {}) => ({ instance_id: 1, queue_id: 7, instance: 'Sonarr', arr_type: 'sonarr', title: 'Bravo.S01E02.1080p', series_title: 'Bravo', request_id: 3, progress: 40, status: 'downloading', ...extra });

describe('queueTrack', () => {
  it('lit l’état d’une ligne dans les mots du gabarit Suivre', () => {
    expect(trackState(arr())).toBe('running');
    expect(trackState(arr({ status: 'paused' }))).toBe('paused');
    expect(trackState(arr({ status: 'queued' }))).toBe('waiting');
    expect(trackState(arr({ status: 'warning', error: 'Import impossible' }))).toBe('blocked');
    // Aucune demande ni bibliothèque ne la réclame : à associer, donc à traiter.
    expect(trackState(arr({ request_id: null, library_id: null }))).toBe('blocked');
  });

  it('nomme l’épisode, le demandeur et le client sur une seule ligne', () => {
    const item = queueRowToTrack(arr({ season_number: 1, episode_number: 2, origin_label: 'Demandé par Alice' }));
    expect(episodeLabel({ season_number: 1, episode_number: 2 })).toBe('S01E02');
    expect(item.title).toBe('Bravo');
    expect(item.subtitle).toBe('S01E02 · Demandé par Alice · Sonarr');
    expect(item.eta).toBeUndefined();
    expect(queueRowToTrack(arr({ timeleft: '00:12:00' })).eta).toBe('00:12:00');
  });

  it('donne la cause et l’action qui débloque à ce qui est bloqué', () => {
    const row = arr({ request_id: null, library_id: null, progress: 100 });
    const item = queueRowToTrack(row);
    expect(item.state).toBe('blocked');
    expect(item.cause?.headline).toContain('Aucun média');
    expect(item.progress).toBeNull();
    expect(item.actions.map((action) => action.key)).toEqual(['manual', 'retry', 'remove']);
    expect(item.actions[0]).toMatchObject({ label: 'Associer', tone: 'primary' });
    expect(item.actions[2].tone).toBe('danger');
  });

  it('ne propose ni retrait ni relance sur un téléchargement direct', () => {
    expect(queueActions({ title: 'Direct', progress: 10 })).toEqual([]);
  });

  it('passe le média entier plutôt que son affiche', () => {
    const media = { id: 9, poster: '/p.jpg' };
    const item = queueRowToTrack(arr({ media, poster_url: '/autre.jpg' }));
    expect(item.media).toBe(media);
    expect(item.poster).toBeNull();
    expect(queueRowToTrack(arr({ poster_url: '/autre.jpg' })).poster).toBe('/autre.jpg');
  });

  it('range un téléchargement terminé dans la chronologie', () => {
    const event = historyToEvent({ id: 5, title: 'Dune', year: 2021, completed_at: '2026-10-01T10:00:00', processing_mode: 'manual', instance_name: 'Radarr' });
    expect(event).toMatchObject({ key: '5', outcome: 'success', title: 'Dune (2021)', detail: 'Import manuel', context: 'Radarr' });
  });
});
