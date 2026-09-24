import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppToast from './AppToast.vue';
import { toasts, useToast } from '@/composables/useToast';

let wrapper;
afterEach(() => { wrapper?.unmount(); toasts.value = []; });

describe('AppToast', () => {
  it("affiche l'action d'une notification et l'execute une fois avant de la retirer", async () => {
    // Chaque notification Reka se teleporte dans sa zone : un vrai Teleport, pas le bouchon.
    wrapper = mount(AppToast, { attachTo: document.body, global: { stubs: { teleport: false } } });
    const run = vi.fn();
    useToast().addToast({ title: 'Demande retirée', message: 'Vous pouvez revenir en arrière.', duration: 0, action: { label: 'Annuler', run } });
    await nextTick();

    const action = document.querySelector('.app-toast-action');
    expect(action.textContent.trim()).toBe('Annuler');
    expect(document.body.textContent).toContain('Demande retirée');
    action.click();
    await nextTick();

    expect(run).toHaveBeenCalledOnce();
    expect(toasts.value).toEqual([]);
  });
});
