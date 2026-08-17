import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import MobileMoreSheet from './MobileMoreSheet.vue';

function render(open = true) {
  return mount(MobileMoreSheet, {
    attachTo: document.body,
    props: { open, sheetId: 'test-more-menu', title: 'Navigation' },
    slots: { default: '<a href="/profile">Profil</a>' },
  });
}

describe('MobileMoreSheet', () => {
  afterEach(() => {
    document.body.classList.remove('modal-open');
    document.body.innerHTML = '';
  });

  it('rend un dialogue nommé et verrouille le défilement de la page', () => {
    const wrapper = render();

    expect(wrapper.get('[role="dialog"]').attributes('aria-labelledby')).toBe('test-more-menu-title');
    expect(wrapper.get('#test-more-menu-title').text()).toBe('Navigation');
    expect(document.body.classList.contains('modal-open')).toBe(true);
    wrapper.unmount();
  });

  it('se ferme depuis le bouton, le fond et la touche Échap', async () => {
    const wrapper = render();

    await wrapper.get('.close-sheet-btn').trigger('click');
    await wrapper.get('.mobile-more-overlay').trigger('click');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(wrapper.emitted('close')).toHaveLength(3);
    wrapper.unmount();
  });

  it('retire le verrou lorsque la feuille est masquée', async () => {
    const wrapper = render();
    await wrapper.setProps({ open: false });

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(document.body.classList.contains('modal-open')).toBe(false);
    wrapper.unmount();
  });
});
