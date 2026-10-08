/* Rythmes prêts à l'emploi des améliorations VF : un choix règle d'un coup la cadence des
 * recherches, la confiance exigée et le repos entre deux recherches d'un même média.
 * « Équilibré » reprend les valeurs par défaut de l'application. */

export type VfPresetKey = 'prudent' | 'equilibre' | 'rapide';

export interface VfPreset {
  key: VfPresetKey;
  label: string;
  description: string;
  values: Record<string, number | boolean>;
}

export const VF_PRESETS: VfPreset[] = [
  {
    key: 'prudent',
    label: 'Prudent',
    description: 'Peu de recherches, confiance élevée : ménage les indexeurs.',
    values: { vf_upgrade_max_searches_per_run: 15, vf_upgrade_search_concurrency: 1, vf_upgrade_min_confidence: 80, vf_upgrade_episodic_fallback: false, vf_upgrade_cooldown_hours: 48 },
  },
  {
    key: 'equilibre',
    label: 'Équilibré',
    description: 'Le réglage conseillé.',
    values: { vf_upgrade_max_searches_per_run: 40, vf_upgrade_search_concurrency: 3, vf_upgrade_min_confidence: 65, vf_upgrade_episodic_fallback: true, vf_upgrade_cooldown_hours: 24 },
  },
  {
    key: 'rapide',
    label: 'Rapide',
    description: 'Plus de recherches par passage : sollicite davantage les indexeurs.',
    values: { vf_upgrade_max_searches_per_run: 80, vf_upgrade_search_concurrency: 6, vf_upgrade_min_confidence: 55, vf_upgrade_episodic_fallback: true, vf_upgrade_cooldown_hours: 12 },
  },
];

/** Le rythme que décrivent les réglages actuels, ou `null` (« Personnalisé »). */
export function matchingPreset(form: Record<string, any>): VfPresetKey | null {
  const found = VF_PRESETS.find((preset) => Object.entries(preset.values).every(([key, value]) => form[key] === value));
  return found ? found.key : null;
}

export function applyPreset(form: Record<string, any>, key: VfPresetKey): void {
  const preset = VF_PRESETS.find((entry) => entry.key === key);
  if (preset) Object.assign(form, preset.values);
}
