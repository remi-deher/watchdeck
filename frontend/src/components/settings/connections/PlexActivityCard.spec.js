import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { form } from '@/settingsForm';
import PlexActivityCard from './PlexActivityCard.vue';

function toggle(wrapper, label) {
  return wrapper.findAll('.collection-toggle').find(item => item.text().includes(label));
}

describe('PlexActivityCard', () => {
  beforeEach(() => {
    form.live_activity_enabled = false;
    form.activity_anonymize_ips = false;
  });

  it('indique que la collecte en direct dépend directement de Plex', async () => {
    const wrapper = mount(PlexActivityCard);
    expect(wrapper.text()).toContain('ne dépend pas de Tautulli');
    expect(toggle(wrapper, 'Activité Plex en direct').get('.collection-state').text()).toBe('Désactivée');
    await toggle(wrapper, 'Activité Plex en direct').get('input').setValue(true);
    expect(toggle(wrapper, 'Activité Plex en direct').text()).toContain('Watchdeck collecte directement');
  });

  it('regroupe la confidentialité et la conservation de l’historique Plex', () => {
    const wrapper = mount(PlexActivityCard);
    expect(wrapper.text()).toContain('Historique à conserver');
    expect(wrapper.text()).toContain('Anonymiser les adresses IP');
    expect(wrapper.text()).toContain('Recalculer les lieux');
  });
});
