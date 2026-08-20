import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SettingsRow from './SettingsRow.vue';

describe('SettingsRow', () => {
  it('affiche le libellé et la description', () => {
    const wrapper = mount(SettingsRow, {
      props: { label: 'Analyse active', description: 'Détecte la piste VF.' },
    });

    expect(wrapper.text()).toContain('Analyse active');
    expect(wrapper.text()).toContain('Détecte la piste VF.');
  });

  it('rend le contrôle fourni dans le slot par défaut', () => {
    const wrapper = mount(SettingsRow, {
      props: { label: 'Activer' },
      slots: { default: '<input type="checkbox">' },
    });

    expect(wrapper.get('.settings-row-control input[type="checkbox"]').exists()).toBe(true);
  });

  it('grise la ligne quand le réglage dépend d’un autre, désactivé', () => {
    const wrapper = mount(SettingsRow, { props: { label: 'Délai', disabled: true } });

    // La ligne reste lisible : on signale l'inertie sans masquer l'information.
    expect(wrapper.classes()).toContain('disabled');
    expect(wrapper.text()).toContain('Délai');
  });

  it('bascule le contrôle sous le libellé en mode block', () => {
    const wrapper = mount(SettingsRow, { props: { label: 'Bibliothèques', block: true } });

    expect(wrapper.classes()).toContain('block');
  });

  it('rend un vrai <label> cliquable seulement si un champ est ciblé', () => {
    const plain = mount(SettingsRow, { props: { label: 'Sans cible' } });
    expect(plain.find('label.settings-row-title').exists()).toBe(false);

    const linked = mount(SettingsRow, { props: { label: 'Avec cible', labelFor: 'champ-1' } });
    expect(linked.get('label.settings-row-title').attributes('for')).toBe('champ-1');
  });
});
