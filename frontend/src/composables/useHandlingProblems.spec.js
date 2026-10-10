import { afterEach, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { api } from '@/api';
import { toasts } from '@/composables/useToast';
import { useHandlingProblems } from './useHandlingProblems';

vi.mock('@/api', () => ({ api: vi.fn() }));
vi.mock('vue-router', async importOriginal => ({ ...await importOriginal(), useRoute: () => ({ fullPath: '/issues' }) }));
const problem = { key: 'report:3', kind: 'audio', label: 'Audio à vérifier', source: 'report', state: 'open', urgency: 'medium',
  consequence: 'Cause à vérifier', fixable: false, proposal: null,
  actions: [{ key: 'retry', label: 'Relancer' }, { key: 'closed', label: 'Clore' }] };
const issue = { id: 3, title: 'Film', status: 'open', problem, media: null };
let host;
let client;
afterEach(() => { host?.unmount(); client?.clear(); toasts.value = []; vi.clearAllMocks(); });
async function setup() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let data;
  host = mount(defineComponent({ setup() { data = useHandlingProblems(); return () => h('div'); } }), {
    global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
  });
  await vi.waitFor(() => expect(data.items.value).toHaveLength(1));
  return data;
}

it('un refus de relance reste une erreur sans clôture ni annonce de réussite', async () => {
  api.mockImplementation(url => Promise.resolve(url.endsWith('/retry') ? { success: false }
    : { items: [issue], types: ['audio'], type_labels: { audio: 'Audio' } }));
  const data = await setup();
  await data.action(data.items.value[0], 'retry');
  expect(data.error.value).toContain('acceptée');
  expect(data.items.value).toHaveLength(1);
  expect(toasts.value).toHaveLength(0);
  expect(api.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
});

it('clore puis annuler relit le contrat complet et restaure le statut précédent', async () => {
  let status = 'open';
  api.mockImplementation((url, options) => {
    if (options?.method === 'PATCH') { status = JSON.parse(options.body).status; return Promise.resolve({ ...issue, status }); }
    return Promise.resolve({ items: status === 'open' ? [issue] : [], types: ['audio'], type_labels: { audio: 'Audio' } });
  });
  const data = await setup();
  client.setQueryData(['media', 'library', 9], { issues: [issue] });
  client.setQueryData(['admin', 'overview'], { issues: { open: 1 } });
  await data.action(data.items.value[0], 'closed');
  expect(client.getQueryState(['media', 'library', 9]).isInvalidated).toBe(true);
  expect(client.getQueryState(['admin', 'overview']).isInvalidated).toBe(true);
  expect(data.items.value).toHaveLength(0);
  expect(toasts.value[0].action.label).toBe('Annuler');
  await toasts.value[0].action.run();
  expect(data.items.value[0].handling).toEqual(problem);
  expect(status).toBe('open');
});
