import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MediaArtwork from './MediaArtwork.vue';

describe('MediaArtwork', () => {
  it('charge immédiatement le visuel principal et laisse les autres en lazy', () => {
    const main = mount(MediaArtwork, { props: { src: '/poster.jpg', priority: true } }).get('img');
    expect(main.attributes('loading')).toBe('eager');
    expect(main.attributes('fetchpriority')).toBe('high');
    const secondary = mount(MediaArtwork, { props: { src: '/poster.jpg' } }).get('img');
    expect(secondary.attributes('loading')).toBe('lazy');
  });

  it('remplace une largeur existante sans perdre le serveur Plex', () => {
    const img = mount(MediaArtwork, { props: { src: '/api/playback/thumb?path=x&width=1800&server=2', size: 'large' } }).get('img');
    const url = new URL(img.attributes('src'), 'http://localhost');
    expect(url.searchParams.getAll('width')).toEqual(['312']);
    expect(url.searchParams.get('server')).toBe('2');
  });

  it('demande au serveur une image à la taille du cadre (×3), pas la capture entière', () => {
    const img = mount(MediaArtwork, { props: { src: '/api/playback/thumb?path=%2Flibrary%2Fx', size: 'large' } }).get('img');
    expect(img.attributes('src')).toBe('/api/playback/thumb?path=%2Flibrary%2Fx&width=312');
    const small = mount(MediaArtwork, { props: { src: '/api/playback/thumb?path=%2Fy', size: 'small' } }).get('img');
    expect(small.attributes('src')).toContain('width=126');
  });
});
