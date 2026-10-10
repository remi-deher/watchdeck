import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MediaStatusBadge from './MediaStatusBadge.vue';

describe('MediaStatusBadge', () => {
  it('affiche « Dans Plex » en vert pour un media disponible', () => {
    const wrapper = mount(MediaStatusBadge, { props: { item: { in_library: true } } });
    expect(wrapper.text()).toBe('Dans Plex');
    expect(wrapper.classes()).toContain('in-plex');
  });

  it('affiche « Transmise » a la couleur de l’application pour une demande envoyee a *arr', () => {
    const wrapper = mount(MediaStatusBadge, { props: { item: { request_status: 'sent_to_arr', request_id: 3 } } });
    expect(wrapper.text()).toBe('Transmise');
    expect(wrapper.classes()).toContain('sent');
  });
});

const availability = plex => ({ plex, library_id: null, episodes: { source: 'arr', state: 'unknown', available: null, aired: null, total: null }, languages: { has_vf: null, vf_granularity: null, fr_is_default: null, sub_fr_status: null, forced_fr_status: null } });

it('ne confond pas import terminé et présence Plex', () => {
  const wrapper = mount(MediaStatusBadge, { props: { item: { available: true, request_status: 'available', requested: true, availability: availability('absent') } } });
  expect(wrapper.text()).toBe('À confirmer dans Plex');
  expect(wrapper.text()).not.toBe('Dans Plex');
});
it('ne masque pas la disponibilité partielle des anciennes réponses', () => {
  const wrapper = mount(MediaStatusBadge, { props: { item: { available: true, request_status: 'partially_available' } } });
  expect(wrapper.text()).toBe('Partiellement disponible');
});
it('distingue les fichiers partiels ARR de Plex', () => {
  const state = availability('absent'); state.episodes.state = 'partial';
  const wrapper = mount(MediaStatusBadge, { props: { item: { availability: state } } });
  expect(wrapper.text()).toBe('Fichiers partiels · *ARR');
});
