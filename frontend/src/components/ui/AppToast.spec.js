import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import AppToast from './AppToast.vue';
import { useToast } from '@/composables/useToast';

let wrapper;
afterEach(() => wrapper?.unmount());

describe('AppToast', () => {
  it('renders an action and runs it once before dismissing the toast', async () => {
    wrapper = mount(AppToast, { global: { plugins: [PrimeVue, ToastService] } });
    const run = vi.fn();
    useToast().addToast({ title: 'Demande retirée', message: 'Vous pouvez revenir en arrière.', duration: 0, action: { label: 'Annuler', run } });
    await nextTick();

    const action = wrapper.get('.app-toast-action');
    expect(action.text()).toBe('Annuler');
    await action.trigger('click');
    await nextTick();

    expect(run).toHaveBeenCalledOnce();
    expect(wrapper.find('.app-toast-action').exists()).toBe(false);
  });
});
