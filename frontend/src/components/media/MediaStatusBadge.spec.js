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
