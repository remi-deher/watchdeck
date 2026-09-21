/* L'annulation d'une demande enchaine deux surfaces : le choix du motif, puis la
   confirmation. C'est cet enchainement qui cassait en production -- la premiere
   consommait son entree d'historique en se fermant, et le `popstate` qui en resultait
   tombait sur la seconde, qui le lisait comme un appui sur « retour » et repondait
   « non » a sa propre question. La demande n'etait jamais envoyee, et la boite restait
   affichee sans plus repondre a rien. On monte donc les vrais composants. */
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import ConfirmModal from '@/components/ConfirmModal.vue';
import ReasonPickerModal from '@/components/requests/ReasonPickerModal.vue';
import { useConfirm } from './useConfirm';
import { useRequestActions } from './useRequestActions';

vi.mock('@/api', () => ({ api: vi.fn(async () => ({ items: [] })) }));

function findButton(wrapper, label) {
  return wrapper
    .findAll('button')
    .find((button) => button.text().trim() === label);
}

describe('withdrawRequest', () => {
  it('envoie bien la demande apres le motif et la confirmation', async () => {
    const { api } = await import('@/api');
    const detail = ref({ id: 7 });
    const Harness = defineComponent({
      setup() {
        const { dialog, askConfirm, resolveConfirm } = useConfirm();
        const withdrawTarget = ref(null);
        let resolveReason = null;
        const actions = useRequestActions({
          detail,
          newRequesterId: ref(''),
          askConfirm,
          reload: async () => {},
          busy: ref(false),
          error: ref(''),
          askReason: (row) => {
            withdrawTarget.value = row;
            return new Promise((resolve) => { resolveReason = resolve; });
          },
        });
        function settleReason(value) {
          withdrawTarget.value = null;
          resolveReason?.(value);
          resolveReason = null;
        }
        return () =>
          h('div', [
            h('button', { onClick: () => actions.withdrawRequest({ id: 7, source: 'rss' }) }, 'Ouvrir'),
            h(ReasonPickerModal, {
              open: !!withdrawTarget.value,
              event: 'cancelled',
              onCancel: () => settleReason(null),
              onConfirm: settleReason,
            }),
            h(ConfirmModal, {
              ...dialog.value,
              onCancel: () => resolveConfirm(false),
              onConfirm: () => resolveConfirm(true),
            }),
          ]);
      },
    });

    const wrapper = mount(Harness, { attachTo: document.body });
    await findButton(wrapper, 'Ouvrir').trigger('click');
    await nextTick();

    // Le motif, puis la confirmation.
    await findButton(wrapper, 'Annuler la demande').trigger('click');
    await nextTick();
    await nextTick();
    // Le `popstate` du recul provoque par la fermeture du motif arrive ici.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    const confirmer = findButton(wrapper, 'Annuler la demande');
    expect(confirmer, 'la confirmation doit rester ouverte').toBeTruthy();
    await confirmer.trigger('click');
    await nextTick();
    await nextTick();

    const appels = api.mock.calls.map(([path]) => path);
    expect(appels).toContain('/api/requests/7/withdraw');
    wrapper.unmount();
  });
});
