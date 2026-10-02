import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import FilterGroup from './FilterGroup.vue';
import UiCombobox from './UiCombobox.vue';

const options = [
  { value: 1, label: 'Alice' },
  { value: 2, label: 'Bruno' },
  { value: 3, label: 'Chloé' },
];

describe('UiCombobox', () => {
  it('resume le choix dans le champ, sans rien a effacer quand il est vide', () => {
    const w = mount(UiCombobox, { props: { modelValue: '', options, label: 'Utilisateur', placeholder: 'Tous les utilisateurs' } });
    const input = w.find('input');
    expect(input.attributes('aria-label')).toBe('Utilisateur');
    expect(input.attributes('placeholder')).toBe('Tous les utilisateurs');
    expect(w.find('.ui-combobox__clear').exists()).toBe(false);
  });

  it('affiche la valeur choisie, ou le nombre en choix multiple', async () => {
    const w = mount(UiCombobox, { props: { modelValue: 2, options, label: 'Utilisateur' } });
    expect(w.find('input').attributes('placeholder')).toBe('Bruno');
    await w.setProps({ multiple: true, modelValue: [1, 3] });
    expect(w.find('input').attributes('placeholder')).toBe('2 sélectionnés');
  });

  it('efface le choix : chaine vide, ou liste vide en choix multiple', async () => {
    const w = mount(UiCombobox, { props: { modelValue: 2, options, label: 'Utilisateur' } });
    await w.find('.ui-combobox__clear').trigger('click');
    expect(w.emitted('update:modelValue').at(-1)).toEqual(['']);
    await w.setProps({ multiple: true, modelValue: [1] });
    await w.find('.ui-combobox__clear').trigger('click');
    expect(w.emitted('update:modelValue').at(-1)).toEqual([[]]);
  });
});

describe('FilterGroup', () => {
  it('se replie et resume alors ce qu il retient', async () => {
    const w = mount(FilterGroup, { props: { label: 'Genre', value: 'Action' }, slots: { default: '<button>Action</button>' } });
    const header = w.find('.filter-group-header');
    expect(header.attributes('aria-expanded')).toBe('true');
    expect(w.find('.filter-group-value').exists()).toBe(false);
    await header.trigger('click');
    expect(header.attributes('aria-expanded')).toBe('false');
    expect(w.find('.filter-group-value').text()).toBe('Action');
    // Replie, le contenu reste monte mais cache : il sort du parcours clavier.
    expect(w.find('.filter-group-reveal').attributes('hidden')).toBeDefined();
  });
});
