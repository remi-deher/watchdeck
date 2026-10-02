import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import UiDisclosure from './UiDisclosure.vue';

function factory(props = {}) {
  return mount(UiDisclosure, {
    props: { title: 'Supervision', ...props },
    slots: { default: '<p class="payload">contenu</p>' },
  });
}

/** Etat Reka du bloc : `open` ou `closed`. */
const isOpen = (wrapper) => wrapper.get('.ui-disclosure').attributes('data-state') === 'open';

describe('UiDisclosure', () => {
  beforeEach(() => localStorage.clear());

  it('reste fermé et ne rend pas son contenu par défaut', () => {
    const wrapper = factory();
    expect(isOpen(wrapper)).toBe(false);
    expect(wrapper.find('.payload').exists()).toBe(false);
  });

  it('émet open une seule fois et rend le contenu à la première ouverture', async () => {
    const wrapper = factory();
    const trigger = wrapper.get('.ui-disclosure-trigger');

    await trigger.trigger('click'); // true
    expect(wrapper.emitted('open')).toHaveLength(1);
    expect(wrapper.find('.payload').exists()).toBe(true);

    // Refermer puis rouvrir ne doit pas relancer le chargement du parent.
    await trigger.trigger('click'); // false
    await trigger.trigger('click'); // true
    expect(wrapper.emitted('open')).toHaveLength(1);
  });

  it('persiste l’état plié/déplié sous la clé fournie', async () => {
    const wrapper = factory({ storageKey: 'test.disclosure' });
    const trigger = wrapper.get('.ui-disclosure-trigger');

    await trigger.trigger('click'); // true
    expect(localStorage.getItem('watchdeck:test.disclosure')).toBe('true');

    await trigger.trigger('click'); // false
    expect(localStorage.getItem('watchdeck:test.disclosure')).toBe('false');
  });

  it('restaure un état ouvert persisté et charge immédiatement', () => {
    localStorage.setItem('test.disclosure', '1');
    const wrapper = factory({ storageKey: 'test.disclosure' });
    expect(isOpen(wrapper)).toBe(true);
    expect(wrapper.find('.payload').exists()).toBe(true);
    expect(wrapper.emitted('open')).toHaveLength(1);
  });

  it('relit les anciennes valeurs "true"/"false" des sections pré-composant', () => {
    localStorage.setItem('test.disclosure', 'true');
    expect(isOpen(factory({ storageKey: 'test.disclosure' }))).toBe(true);

    localStorage.removeItem('watchdeck:test.disclosure');
    localStorage.setItem('test.disclosure', 'false');
    expect(isOpen(factory({ storageKey: 'test.disclosure' }))).toBe(false);
  });

  it('respecte defaultOpen seulement en l’absence de préférence enregistrée', () => {
    expect(isOpen(factory({ defaultOpen: true }))).toBe(true);

    localStorage.setItem('test.disclosure', '0');
    const stored = factory({ storageKey: 'test.disclosure', defaultOpen: true });
    expect(isOpen(stored)).toBe(false);
  });
});
