import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import UiDisclosure from './UiDisclosure.vue';

function factory(props = {}) {
  return mount(UiDisclosure, {
    props: { title: 'Supervision', ...props },
    slots: { default: '<p class="payload">contenu</p>' },
  });
}

describe('UiDisclosure', () => {
  beforeEach(() => localStorage.clear());

  it('reste fermé et ne rend pas son contenu par défaut', () => {
    const wrapper = factory();
    expect(wrapper.get('details').element.open).toBe(false);
    expect(wrapper.find('.payload').exists()).toBe(false);
  });

  it('émet open une seule fois et rend le contenu à la première ouverture', async () => {
    const wrapper = factory();
    const details = wrapper.get('details');

    details.element.open = true;
    await details.trigger('toggle');
    expect(wrapper.emitted('open')).toHaveLength(1);
    expect(wrapper.find('.payload').exists()).toBe(true);

    // Refermer puis rouvrir ne doit pas relancer le chargement du parent.
    details.element.open = false;
    await details.trigger('toggle');
    details.element.open = true;
    await details.trigger('toggle');
    expect(wrapper.emitted('open')).toHaveLength(1);
  });

  it('persiste l’état plié/déplié sous la clé fournie', async () => {
    const wrapper = factory({ storageKey: 'test.disclosure' });
    const details = wrapper.get('details');

    details.element.open = true;
    await details.trigger('toggle');
    expect(localStorage.getItem('test.disclosure')).toBe('1');

    details.element.open = false;
    await details.trigger('toggle');
    expect(localStorage.getItem('test.disclosure')).toBe('0');
  });

  it('restaure un état ouvert persisté et charge immédiatement', () => {
    localStorage.setItem('test.disclosure', '1');
    const wrapper = factory({ storageKey: 'test.disclosure' });
    expect(wrapper.get('details').element.open).toBe(true);
    expect(wrapper.find('.payload').exists()).toBe(true);
    expect(wrapper.emitted('open')).toHaveLength(1);
  });

  it('relit les anciennes valeurs "true"/"false" des sections pré-composant', () => {
    localStorage.setItem('test.disclosure', 'true');
    expect(factory({ storageKey: 'test.disclosure' }).get('details').element.open).toBe(true);

    localStorage.setItem('test.disclosure', 'false');
    expect(factory({ storageKey: 'test.disclosure' }).get('details').element.open).toBe(false);
  });

  it('respecte defaultOpen seulement en l’absence de préférence enregistrée', () => {
    expect(factory({ defaultOpen: true }).get('details').element.open).toBe(true);

    localStorage.setItem('test.disclosure', '0');
    const stored = factory({ storageKey: 'test.disclosure', defaultOpen: true });
    expect(stored.get('details').element.open).toBe(false);
  });
});
