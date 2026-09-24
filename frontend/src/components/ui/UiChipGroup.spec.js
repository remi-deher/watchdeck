import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UiChipGroup from './UiChipGroup.vue';

const options = [
  { value: '', label: 'Tous' },
  { value: 'movie', label: 'Films', count: 3 },
  { value: 'show', label: 'Séries' },
];

describe('UiChipGroup', () => {
  it("annonce la pastille choisie, y compris « Tous » a valeur vide", () => {
    const w = mount(UiChipGroup, { props: { modelValue: '', options, label: 'Type' } });
    expect(w.find('[role="group"]').attributes('aria-label')).toBe('Type');
    const chips = w.findAll('button');
    expect(chips[0].attributes('aria-pressed')).toBe('true');
    expect(chips[0].classes()).toContain('active');
    expect(chips[1].attributes('aria-pressed')).toBe('false');
    expect(chips[1].find('.count').text()).toBe('3');
  });

  it("emet la valeur choisie, et ne decoche pas la pastille active", async () => {
    const w = mount(UiChipGroup, { props: { modelValue: 'movie', options, label: 'Type' } });
    await w.findAll('button')[2].trigger('click');
    expect(w.emitted('update:modelValue').at(-1)).toEqual(['show']);
    await w.setProps({ modelValue: 'show' });
    await w.findAll('button')[2].trigger('click');
    expect(w.emitted('update:modelValue')).toHaveLength(1);
  });

  it('en choix multiple, ajoute et retire des valeurs', async () => {
    const w = mount(UiChipGroup, { props: { modelValue: ['movie'], options, label: 'Type', multiple: true } });
    await w.findAll('button')[2].trigger('click');
    expect(w.emitted('update:modelValue').at(-1)[0].sort()).toEqual(['movie', 'show']);
    await w.setProps({ modelValue: ['movie', 'show'] });
    await w.findAll('button')[1].trigger('click');
    expect(w.emitted('update:modelValue').at(-1)).toEqual([['show']]);
  });

  it('en mode exclusion, un appui inclut, le suivant exclut, le troisieme libere', async () => {
    const opts = [{ value: 'films', label: 'Films' }, { value: 'series', label: 'Séries' }];
    const w = mount(UiChipGroup, { props: { modelValue: [], options: opts, label: 'Catégorie', exclusion: true } });
    const chip = () => w.findAll('button')[0];

    await chip().trigger('click');
    expect(w.emitted('update:modelValue').at(-1)).toEqual([['films']]);
    await w.setProps({ modelValue: ['films'] });
    expect(chip().classes()).toContain('active');

    await chip().trigger('click');
    expect(w.emitted('update:modelValue').at(-1)).toEqual([['!films']]);
    await w.setProps({ modelValue: ['!films'] });
    expect(chip().classes()).toContain('excluded');
    expect(chip().attributes('aria-label')).toBe('Films, exclu');

    await chip().trigger('click');
    expect(w.emitted('update:modelValue').at(-1)).toEqual([[]]);
  });

  it('en mode exclusion, les autres pastilles restent intactes', async () => {
    const opts = [{ value: 'films', label: 'Films' }, { value: 'series', label: 'Séries' }];
    const w = mount(UiChipGroup, { props: { modelValue: ['!films'], options: opts, label: 'Catégorie', exclusion: true } });
    await w.findAll('button')[1].trigger('click');
    expect(w.emitted('update:modelValue').at(-1)).toEqual([['!films', 'series']]);
  });
});

