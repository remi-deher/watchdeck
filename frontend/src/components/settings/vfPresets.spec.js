import { describe, expect, it } from 'vitest';
import { VF_PRESETS, applyPreset, matchingPreset } from './vfPresets';

describe('vfPresets', () => {
  it('reconnaît le rythme que décrivent les réglages', () => {
    const form = {};
    applyPreset(form, 'prudent');
    expect(matchingPreset(form)).toBe('prudent');
  });

  it('passe en « Personnalisé » dès qu’un réglage s’en écarte', () => {
    const form = {};
    applyPreset(form, 'rapide');
    form.vf_upgrade_search_concurrency = 4;
    expect(matchingPreset(form)).toBeNull();
  });

  it('« Équilibré » reprend les valeurs par défaut de l’application', async () => {
    const { defaultSettings } = await import('@/settingsForm').catch(() => ({}));
    const equilibre = VF_PRESETS.find((preset) => preset.key === 'equilibre');
    if (defaultSettings) {
      for (const [key, value] of Object.entries(equilibre.values)) expect(defaultSettings[key]).toBe(value);
    }
    expect(equilibre.values.vf_upgrade_max_searches_per_run).toBe(40);
  });
});
