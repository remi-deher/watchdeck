import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';

import { validationErrors } from '@/settingsForm';

import SettingsValidationSummary from './SettingsValidationSummary.vue';

describe('SettingsValidationSummary', () => {
  afterEach(() => { Object.keys(validationErrors).forEach(key => delete validationErrors[key]); });

  it('reste masqué sans erreur', () => {
    expect(mount(SettingsValidationSummary).find('.settings-validation').exists()).toBe(false);
  });

  it('liste chaque champ invalide avec son libellé lisible', async () => {
    const wrapper = mount(SettingsValidationSummary);
    validationErrors.plex_url = 'Saisissez une URL HTTP ou HTTPS valide.';
    validationErrors.champ_inconnu = 'Invalide.';
    await nextTick();

    const items = wrapper.findAll('li').map(li => li.text());
    expect(items).toEqual([
      'URL Plex : Saisissez une URL HTTP ou HTTPS valide.',
      'champ_inconnu : Invalide.',
    ]);
  });
});
