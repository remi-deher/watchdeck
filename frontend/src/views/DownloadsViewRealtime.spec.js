import { describe, expect, it } from 'vitest';
import { patchedList } from '@/composables/useRealtimeQuery';

describe('download.updated : mise a jour d’un torrent', () => {
  it('reporte l’evenement sur le torrent correspondant, sans muter la liste d’origine', () => {
    const torrents = Object.freeze([
      Object.freeze({ hash: 'abc1234567890', name: 'Movie 1', status: 'downloading', progress: 50 }),
    ]);

    const { list, patched } = patchedList(torrents, { hash: 'abc1234567890', progress: 75 }, { keyFields: ['hash'] });
    expect(patched).toBe(true);
    expect(list[0]).toMatchObject({ progress: 75, status: 'downloading' });
    expect(torrents[0].progress).toBe(50);
  });
});
