import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { form } from '@/settingsForm';
import TautulliConnectionCard from './TautulliConnectionCard.vue';

describe('TautulliConnectionCard', () => {
  beforeEach(() => { form.tautulli_enabled = true; });

  it('présente Tautulli comme une source historique manuelle', () => {
    const wrapper = mount(TautulliConnectionCard);
    expect(wrapper.text()).toContain('Import historique Tautulli');
    expect(wrapper.text()).toContain('Aucun import automatique');
    expect(wrapper.text()).not.toContain('Activité Plex en direct');
    expect(wrapper.text()).not.toContain('Anonymiser les adresses IP');
  });
});
