import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';

import ConfirmModal from '@/components/ConfirmModal.vue';
import ModalShell from './ModalShell.vue';

// Reka rend ses surfaces par un vrai portail vers <body> : le bouchon global des
// Teleport (testSetup) les ferait disparaitre.
const reel = { global: { stubs: { teleport: false } } };

describe('ModalShell', () => {
  it('rend un voile et un dialogue accessibles, nommes par leur titre', async () => {
    const wrapper = mount(ModalShell, {
      props: { title: 'Ajouter une instance', panelClass: 'arr-instance-modal' },
      slots: { default: '<p class="body">contenu</p>', actions: '<button>Enregistrer</button>' },
      attachTo: document.body,
      ...reel,
    });
    await nextTick();
    // Reka rend le voile et le panneau cote a cote ; le voile porte les variantes du panneau.
    expect(document.querySelector('.drawer-backdrop.drawer-backdrop--arr-instance-modal')).not.toBeNull();
    const panel = document.querySelector('.modal-panel');
    expect(panel.classList).toContain('arr-instance-modal');
    expect(panel.getAttribute('role')).toBe('dialog');
    const titre = panel.querySelector('.panel-head h2');
    expect(titre.textContent).toBe('Ajouter une instance');
    expect(panel.getAttribute('aria-labelledby')).toBe(titre.id);
    expect(panel.querySelector('.body')).not.toBeNull();
    expect(panel.querySelector('.actions button').textContent).toBe('Enregistrer');
    wrapper.unmount();
  });

  it('n’affiche le sous-titre et le message d’erreur que s’ils sont fournis', async () => {
    const bare = mount(ModalShell, { props: { title: 'T' }, attachTo: document.body, ...reel });
    await nextTick();
    expect(document.querySelector('.panel-head p')).toBeNull();
    expect(document.querySelector('.actions')).toBeNull();
    bare.unmount();

    const filled = mount(ModalShell, { props: { title: 'T', subtitle: 'S', error: 'Boum' }, attachTo: document.body, ...reel });
    await nextTick();
    expect(document.querySelector('.panel-head p').textContent).toBe('S');
    expect(document.querySelector('.ui-feedback.is-error').textContent).toContain('Boum');
    filled.unmount();
  });

  it('se ferme par la croix et par Echap, mais pas pendant une operation', async () => {
    const wrapper = mount(ModalShell, { props: { title: 'T' }, attachTo: document.body, ...reel });
    await nextTick();
    document.querySelector('.panel-head button').click();
    expect(wrapper.emitted('close')).toHaveLength(1);
    document.querySelector('.modal-panel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(wrapper.emitted('close')).toHaveLength(2);
    wrapper.unmount();

    // `busy` neutralise la fermeture pour ne pas abandonner une ecriture en cours.
    const busy = mount(ModalShell, { props: { title: 'T', busy: true }, attachTo: document.body, ...reel });
    await nextTick();
    document.querySelector('.modal-panel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.querySelector('.panel-head button').click();
    await nextTick();
    expect(busy.emitted('close')).toBeUndefined();
    busy.unmount();
  });

  it('ne rend rien quand open est faux', () => {
    const wrapper = mount(ModalShell, { props: { title: 'T', open: false } });
    expect(wrapper.find('.drawer-backdrop').exists()).toBe(false);
  });
});

describe('ConfirmModal', () => {
  it('pose la question, propose Annuler puis l’action, et transmet la confirmation', async () => {
    const accepted = ref(0);
    const Harness = defineComponent({
      components: { ConfirmModal },
      setup: () => ({ accepted }),
      template: '<ConfirmModal open title="Supprimer ?" message="Définitif." confirm-label="Supprimer" danger @confirm="accepted++"/>',
    });
    const wrapper = mount(Harness, { attachTo: document.body, ...reel });
    await nextTick();
    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog.querySelector('.confirm-modal__message').textContent).toBe('Définitif.');
    const buttons = [...dialog.querySelectorAll('.actions button')];
    expect(buttons.map((button) => button.textContent.trim())).toEqual(['Annuler', 'Supprimer']);
    buttons[1].click();
    expect(accepted.value).toBe(1);
    wrapper.unmount();
  });
});
