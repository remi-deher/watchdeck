import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import TrackTemplate from './templates/TrackTemplate.vue';
import StorageCurrentMedia from './storage/StorageCurrentMedia.vue';
import DownloadQueueGroups from './downloads/DownloadQueueGroups.vue';

const media = {id: 1, title: 'Dune', media_type: 'movie', poster_url: '/poster.jpg', backdrop_url: '/backdrop.jpg'};
const work = {key: 'encoding:1', source: 'encoding', state: 'running', label: 'En cours', stage: 'Vidéo', progress: {percent: 0, scope: 'step', label: 'Progression de l’étape'}, reason: null, stale: false};
function render(component, props) {
  const router = createRouter({history: createMemoryHistory(), routes: [{path: '/:pathMatch(.*)*', component: {template: '<div />'}}]});
  return mount(component, {props, global: {plugins: [router], stubs: {MediaArtwork: {props: ['src'], template: '<img class="art" :src="src" />'}}}});
}

describe('Travaux en cours dans les blocs communs', () => {
  it('TrackTemplate utilise le travail et conserve les actions du bandeau', async () => {
    const wrapper = render(TrackTemplate, {items: [{key: 'old', title: 'Dune', state: 'waiting', media, work, actions: [{key: 'pause', label: 'Pause'}]}]});
    expect(wrapper.findAll('.art')).toHaveLength(2);
    expect(wrapper.find('.live-card-track i').attributes('style')).toContain('width: 0%');
    await wrapper.find('.live-actions button').trigger('click');
    expect(wrapper.emitted('action')[0]).toMatchObject([{work}, 'pause']);
  });
  it('un verrou de disque reste en attente et ne devient pas un problème', () => {
    const wrapper = render(TrackTemplate, {items: [{key: 'old', title: 'Dune', state: 'running', work: {...work, state: 'waiting', reason: 'Verrou du disque'}}]});
    expect(wrapper.find('.track-queue').exists()).toBe(true);
    expect(wrapper.find('.live-strip').exists()).toBe(false);
    expect(wrapper.text()).toContain('Verrou du disque');
  });
  it('la finalisation Plex montre les images et garde la copie à 100 % en cours', () => {
    const wrapper = render(StorageCurrentMedia, {job: {id: 1, desired_state: 'run', work: {...work, source: 'transfer', stage: 'Finalisation Plex', progress: {percent: 100, scope: 'copy', label: 'Copie uniquement'}}, items: [{title: 'Dune', status: 'plex_pending', media}]}, status: value => value});
    expect(wrapper.findAll('.art')).toHaveLength(2);
    expect(wrapper.text()).toContain('Finalisation Plex');
    expect(wrapper.text()).toContain('Copie uniquement');
    wrapper.unmount();
  });
  it('la file de téléchargement transmet le travail entier et les commandes', async () => {
    const row = {title: 'Dune', library_id: 1, instance_id: 2, queue_id: 3, media, work: {...work, source: 'download'}};
    const wrapper = render(DownloadQueueGroups, {groups: [{key: 'active', title: 'En téléchargement', description: '', items: [row]}], history: [], showRecent: false, loading: false, actingKeys: new Set()});
    expect(wrapper.findAll('.art')).toHaveLength(2);
    const buttons = wrapper.findAll('.live-actions button');
    await buttons[1].trigger('click');
    expect(wrapper.emitted('action')[0]).toEqual([row, false, false]);
  });
});
