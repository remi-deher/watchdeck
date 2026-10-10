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

it('transmet le travail entier, ses images, zéro et ses actions accessibles séparément', async () => {
  const work = {key: 'encoding:1', source: 'encoding', state: 'running', label: 'En cours', stage: 'Vidéo', progress: {percent: 0, scope: 'step', label: 'Progression de l’étape'}, reason: null, stale: false};
  const wrapper = mount(LiveStrip, {props: {items: [{key: 'legacy', title: 'Dune', media, work, actions: [{key: 'pause', label: 'Pause'}]}], title: 'Encodage', idle: {title: 'Rien'}}, global: {stubs}});
  expect(wrapper.findAll('.art')).toHaveLength(2);
  expect(wrapper.find('.live-card-track i').attributes('style')).toContain('width: 0%');
  expect(wrapper.find('.live-card button').exists()).toBe(false);
  await wrapper.find('.live-actions button').trigger('click');
  expect(wrapper.emitted('action')[0][1]).toBe('pause');
  expect(wrapper.emitted('action')[0][0].work).toEqual(work);
  expect(wrapper.emitted('select')).toBeUndefined();
});
