import { describe, expect, it, vi } from 'vitest';
import { useInPlaceList } from '@/composables/useInPlaceList';

describe('download.updated in-place patching', () => {
  it('updates matching torrent status in-place when event detail is received', () => {
    const { patchItem } = useInPlaceList();
    const torrents = [
      { hash: 'abc1234567890', name: 'Movie 1', status: 'downloading', progress: 50 },
    ];

    const updated = patchItem(torrents, { hash: 'abc1234567890', progress: 75 }, { keyFields: ['hash'] });
    expect(updated).toBe(true);
    expect(torrents[0].progress).toBe(75);
    expect(torrents[0].status).toBe('downloading');
  });
});
