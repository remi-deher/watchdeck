import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import ConfirmModal from './ConfirmModal.vue';

const items = Array.from({ length: 7 }, (_, index) => ({ key: index, label: `Compte ${index + 1}`, detail: `${index} demandes` }));
const mountModal = (props) => mount(ConfirmModal, { props: { open: true, title: 'Supprimer 7 comptes ?', confirmLabel: 'Supprimer', ...props }, attachTo: document.body });
const confirmButton = () => [...document.body.querySelectorAll('button')].find((button) => button.textContent.includes('Supprimer'));

describe('ConfirmModal', () => {
  it('nomme les cinq premiers éléments et compte les autres', () => {
    const wrapper = mountModal({ items });
    const text = document.body.textContent;
    expect(text).toContain('Compte 5');
    expect(text).not.toContain('Compte 6');
    expect(text).toContain('et 2 autres');
    wrapper.unmount();
  });

  it('garde le bouton fermé tant que le texte demandé n’est pas tapé', async () => {
    const wrapper = mountModal({ items, typeToConfirm: '7' });
    expect(confirmButton().disabled).toBe(true);
    const input = document.body.querySelector('.confirm-modal__typed input');
    input.value = '7';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    expect(confirmButton().disabled).toBe(false);
    wrapper.unmount();
  });

  it('ne demande rien de tapé sans `typeToConfirm`', () => {
    const wrapper = mountModal({});
    expect(document.body.querySelector('.confirm-modal__typed')).toBeNull();
    expect(confirmButton().disabled).toBe(false);
    wrapper.unmount();
  });
});
