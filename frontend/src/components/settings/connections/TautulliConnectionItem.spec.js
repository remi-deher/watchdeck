import { mount } from '@vue/test-utils';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { createQueryClient } from '@/queryClient';
import { form } from '@/settingsForm';
import TautulliConnectionItem from './TautulliConnectionItem.vue';

describe('TautulliConnectionItem', () => {
  let wrapper;
  beforeEach(() => { form.tautulli_enabled = true; });
  afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

  it('tient sur une ligne avec son état, sans afficher le formulaire', () => {
    wrapper = mount(TautulliConnectionItem, {
      attachTo: document.body,
      global: { plugins: [[VueQueryPlugin, { queryClient: createQueryClient() }]] },
    });
    expect(wrapper.text()).toContain('Import historique Tautulli');
    expect(wrapper.text()).toContain('Activé');
    expect(document.body.textContent).not.toContain('Aucun import automatique');
  });

  it('présente Tautulli comme une source historique manuelle dans son volet', async () => {
    wrapper = mount(TautulliConnectionItem, {
      attachTo: document.body,
      global: { plugins: [[VueQueryPlugin, { queryClient: createQueryClient() }]] },
    });
    await wrapper.find('button.settings-item-main').trigger('click');
    await nextTick();
    await nextTick();
    const text = document.body.textContent;
    expect(text).toContain('Aucun import automatique');
    expect(text).not.toContain('Activité Plex en direct');
    expect(text).not.toContain('Anonymiser les adresses IP');
  });
});
