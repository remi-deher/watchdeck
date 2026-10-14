import { mount } from '@vue/test-utils';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { afterEach, describe, expect, it } from 'vitest';
import { createQueryClient } from '@/queryClient';
import TautulliConnectionItem from './TautulliConnectionItem.vue';

describe('TautulliConnectionItem', () => {
  let wrapper;
  afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

  it('présente Tautulli comme une source historique manuelle, dans sa section', () => {
    wrapper = mount(TautulliConnectionItem, {
      attachTo: document.body,
      global: { plugins: [[VueQueryPlugin, { queryClient: createQueryClient() }]] },
    });
    const text = wrapper.text();
    expect(text).toContain('Activer Tautulli');
    expect(text).toContain('Aucun import automatique');
    expect(text).not.toContain('Activité Plex en direct');
    expect(text).not.toContain('Anonymiser les adresses IP');
  });
});
