import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { form } from '@/settingsForm';
import PlexActivitySection from './PlexActivitySection.vue';

function row(wrapper, label) {
  return wrapper.findAll('.settings-row').find(item => item.text().includes(label));
}

describe('PlexActivitySection', () => {
  beforeEach(() => {
    form.live_activity_enabled = false;
    form.activity_anonymize_ips = false;
  });

  it('indique que la collecte en direct dépend directement de Plex', async () => {
    const wrapper = mount(PlexActivitySection);
    expect(wrapper.text()).toContain('ne dépend pas de Tautulli');
    expect(row(wrapper, 'Activité Plex en direct').text()).toContain('Aucune lecture en cours');
    await row(wrapper, 'Activité Plex en direct').get('[role="switch"]').trigger('click');
    expect(row(wrapper, 'Activité Plex en direct').text()).toContain('Watchdeck collecte directement');
  });

  it('regroupe la confidentialité et la conservation de l’historique Plex', () => {
    const wrapper = mount(PlexActivitySection);
    expect(wrapper.text()).toContain('Historique à conserver');
    expect(wrapper.text()).toContain('Anonymiser les adresses IP');
    expect(wrapper.text()).toContain('Recalculer les lieux');
  });
});
