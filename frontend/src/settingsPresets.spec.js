import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { INTERVAL_PRESETS, presetsFor } from './settingsPresets';
import { form } from './settingsForm';
import IntervalPresetInput from './components/settings/IntervalPresetInput.vue';

describe('valeurs proposées pour les intervalles', () => {
  it('donne la même liste à tous les écrans qui règlent le même champ', () => {
    // La fréquence de ré-analyse VF se règle depuis « Plex & Bibliothèque » et depuis
    // « Planification », et trois tâches partagent la colonne. Indexer par champ rend la
    // divergence impossible : c'est littéralement le même objet.
    expect(presetsFor('vff_recheck_interval_minutes')).toBe(INTERVAL_PRESETS.vff_recheck_interval_minutes);
    expect(presetsFor('poll_interval_seconds')).toBe(INTERVAL_PRESETS.poll_interval_seconds);
  });

  it('ne propose rien pour un champ sans intervalle', () => {
    expect(presetsFor('digest_hour')).toBeNull();
    expect(presetsFor(null)).toBeNull();
  });

  it('propose des valeurs pour chaque cadence devenue réglable', () => {
    for (const field of [
      'library_analytics_interval_minutes',
      'arr_queue_interval_seconds',
      'torrent_status_interval_seconds',
      'new_vff_interval_seconds',
      'seer_sync_interval_minutes',
    ]) {
      expect(presetsFor(field)?.length).toBeGreaterThan(1);
    }
  });

  it('n’expose que des valeurs strictement positives et sans doublon', () => {
    for (const [field, presets] of Object.entries(INTERVAL_PRESETS)) {
      const values = presets.map((preset) => preset.value);
      expect(values.every((value) => value > 0), field).toBe(true);
      expect(new Set(values).size, field).toBe(values.length);
    }
  });
});

describe('IntervalPresetInput — valeur modifiée depuis un autre écran', () => {
  const presets = [
    { label: '1 minute', value: 60 },
    { label: '5 minutes', value: 300 },
  ];

  it('suit une valeur de la liste choisie ailleurs, au lieu de rester en « Personnalisé »', async () => {
    // Monté sur une valeur hors liste, donc en saisie libre.
    const wrapper = mount(IntervalPresetInput, { props: { modelValue: 137, presets } });
    expect(wrapper.find('input[type="number"]').exists()).toBe(true);

    // La même colonne est réglée depuis un autre écran sur une valeur de la liste.
    await wrapper.setProps({ modelValue: 300 });

    expect(wrapper.find('input[type="number"]').exists()).toBe(false);
    expect(wrapper.find('select').element.value).toBe('300');
  });

  it('passe en saisie libre quand la valeur choisie ailleurs sort de la liste', async () => {
    const wrapper = mount(IntervalPresetInput, { props: { modelValue: 60, presets } });
    expect(wrapper.find('select').element.value).toBe('60');

    await wrapper.setProps({ modelValue: 137 });

    expect(wrapper.find('select').element.value).toBe('custom');
    expect(wrapper.find('input[type="number"]').exists()).toBe(true);
  });

  it('respecte une saisie libre demandée explicitement', async () => {
    const wrapper = mount(IntervalPresetInput, { props: { modelValue: 60, presets } });

    await wrapper.find('select').setValue('custom');

    expect(wrapper.find('input[type="number"]').exists()).toBe(true);
    // Aucune valeur n'est émise tant que l'utilisateur n'a rien saisi.
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});


describe('un même réglage vu depuis deux écrans', () => {
  it('reste synchronisé, parce que les deux contrôles écrivent dans le même champ', async () => {
    // « Nouvelle analyse » (Plex & Bibliothèque) et « Scan VF complet » (Planification)
    // règlent tous deux vff_recheck_interval_minutes. Le formulaire étant un objet
    // réactif partagé par toute l'application, la valeur ne peut pas diverger — encore
    // faut-il que les deux écrans proposent les mêmes valeurs, ce que garantit
    // l'indexation par champ.
    const presets = presetsFor('vff_recheck_interval_minutes');
    form.vff_recheck_interval_minutes = 60;

    const bibliotheque = mount(IntervalPresetInput, {
      props: {
        modelValue: form.vff_recheck_interval_minutes,
        presets,
        'onUpdate:modelValue': (value) => { form.vff_recheck_interval_minutes = value; },
      },
    });
    const planification = mount(IntervalPresetInput, {
      props: {
        modelValue: form.vff_recheck_interval_minutes,
        presets,
        'onUpdate:modelValue': (value) => { form.vff_recheck_interval_minutes = value; },
      },
    });

    // Réglage modifié depuis l'écran Bibliothèque.
    await bibliotheque.find('select').setValue('180');
    expect(form.vff_recheck_interval_minutes).toBe(180);

    // L'autre écran, réaffiché avec la valeur partagée, montre la même chose.
    await planification.setProps({ modelValue: form.vff_recheck_interval_minutes });
    expect(planification.find('select').element.value).toBe('180');
    expect(bibliotheque.find('select').element.value).toBe(planification.find('select').element.value);
  });
});
