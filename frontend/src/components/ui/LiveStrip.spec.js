import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import LiveStrip from './LiveStrip.vue';

/* Verrou : une carte qui porte un media montre d'office son affiche et son fond quand ils
   existent, sans que la page ait a les recopier (le fond manquait aux cartes de l'encodage). */
const media = { id: 1, title: 'Dune', media_type: 'movie', poster_url: 'http://plex/thumb.jpg', backdrop_url: 'http://plex/art.jpg' };
const stubs = { RouterLink: { template: '<a><slot /></a>' }, MediaArtwork: { props: ['src', 'size'], template: '<img class="art" :data-src="src" :data-size="size" />' } };

describe('LiveStrip', () => {
  it('affiche le fond et l’affiche du media sans les recevoir a part', () => {
    const wrapper = mount(LiveStrip, { props: { items: [{ key: 'a', title: 'Dune', media }], title: '1 en cours', idle: { title: 'Rien' } }, global: { stubs } });
    const shown = wrapper.findAll('.art').map((img) => [img.attributes('data-size'), img.attributes('data-src')]);
    expect(shown).toContainEqual(['backdrop', 'http://plex/art.jpg']);
    expect(shown).toContainEqual(['poster', 'http://plex/thumb.jpg']);
  });

  it('garde une image fournie a part pour ce qui n’est pas un media', () => {
    const wrapper = mount(LiveStrip, { props: { items: [{ key: 'a', title: 'Client', backdrop: 'http://x/bg.jpg' }], title: '1', idle: { title: 'Rien' } }, global: { stubs } });
    expect(wrapper.find('.art').attributes('data-src')).toBe('http://x/bg.jpg');
  });
});
