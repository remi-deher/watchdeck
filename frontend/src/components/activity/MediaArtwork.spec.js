import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MediaArtwork from './MediaArtwork.vue';

describe('MediaArtwork', () => {
  it('demande au serveur une image à la taille du cadre (×3), pas la capture entière', () => {
    const img = mount(MediaArtwork, { props: { src: '/api/playback/thumb?path=%2Flibrary%2Fx', size: 'large' } }).get('img');
    expect(img.attributes('src')).toBe('/api/playback/thumb?path=%2Flibrary%2Fx&width=312');
    const small = mount(MediaArtwork, { props: { src: '/api/playback/thumb?path=%2Fy', size: 'small' } }).get('img');
    expect(small.attributes('src')).toContain('width=126');
  });
});
