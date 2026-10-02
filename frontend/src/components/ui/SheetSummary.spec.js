import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SheetSummary from './SheetSummary.vue';

describe('SheetSummary', () => {
  it('limite le nombre de lignes demandé', () => {
    const wrapper = mount(SheetSummary, { props: { text: 'Un résumé.', lines: 4 } });
    expect(wrapper.get('.sheet-summary__text').attributes('style')).toContain('--summary-lines: 4');
  });

  it('ne propose « Lire la suite » que si le texte déborde', async () => {
    const wrapper = mount(SheetSummary, { props: { text: 'Court.' }, attachTo: document.body });
    expect(wrapper.find('.sheet-summary__toggle').exists()).toBe(false);

    // jsdom ne mesure rien : on simule un texte plus haut que sa boite.
    const text = wrapper.get('.sheet-summary__text').element;
    Object.defineProperty(text, 'scrollHeight', { value: 120, configurable: true });
    Object.defineProperty(text, 'clientHeight', { value: 72, configurable: true });
    await wrapper.setProps({ text: 'Un résumé bien plus long.' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const toggle = wrapper.get('.sheet-summary__toggle');
    expect(toggle.text()).toBe('Lire la suite');
    await toggle.trigger('click');
    expect(wrapper.get('.sheet-summary__text').classes()).toContain('open');
    expect(wrapper.get('.sheet-summary__toggle').text()).toBe('Réduire');
    wrapper.unmount();
  });
});
