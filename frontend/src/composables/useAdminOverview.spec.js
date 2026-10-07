import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, ref } from 'vue';
import { useAdminOverview } from './useAdminOverview';

const api = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => api(...args) }));
vi.mock('@/events', () => ({ useRealtime: vi.fn() }));

const mounted = [];

function mountWith(enabled = true) {
  const flag = ref(enabled);
  let exposed;
  const Probe = defineComponent({
    setup() {
      exposed = useAdminOverview(flag);
      return () => null;
    },
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = mount(Probe, { global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
  mounted.push(wrapper);
  return { wrapper, flag, queryClient, get state() { return exposed; } };
}

// Une réponse par défaut : sans elle, un appel résiduel d'un test précédent remonterait en
// rejet non géré dans le test en cours.
beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue(null);
});
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()));

describe('useAdminOverview', () => {
  it('lit l’aperçu une fois et le met à disposition', async () => {
    api.mockResolvedValue({ requests: { pending_approval: 3, failed: 0 } });
    const probe = mountWith();
    await flushPromises();

    expect(api).toHaveBeenCalledWith('/api/admin/overview');
    expect(probe.state.overview.value).toEqual({ requests: { pending_approval: 3, failed: 0 } });
    expect(probe.state.loading.value).toBe(false);
  });

  it('ne charge rien pour qui n’est pas administrateur', async () => {
    mountWith(false);
    await flushPromises();
    expect(api).not.toHaveBeenCalled();
  });

  it('traite une réponse qui n’est pas un objet comme une absence de données', async () => {
    api.mockResolvedValue([]);
    const probe = mountWith();
    await flushPromises();
    expect(probe.state.overview.value).toBeNull();
  });

  it('relit à la demande, sans attendre le délai de péremption', async () => {
    api.mockResolvedValue({ conflicts: { count: 1 } });
    const probe = mountWith();
    await flushPromises();

    api.mockResolvedValue({ conflicts: { count: 0 } });
    await probe.state.refresh();
    await flushPromises();

    expect(api).toHaveBeenCalledTimes(2);
    expect(probe.state.overview.value).toEqual({ conflicts: { count: 0 } });
  });

  it('garde sans donnée l’aperçu qu’un serveur plus ancien ne sait pas servir', async () => {
    api.mockImplementation(() => Promise.reject(new Error('404')));
    const probe = mountWith();
    await flushPromises();
    expect(probe.state.overview.value).toBeNull();
  });
});
