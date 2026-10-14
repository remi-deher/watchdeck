import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vueRouter from 'vue-router';
import { toasts } from '@/composables/useToast';
import StorageView from './StorageView.vue';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/api', () => ({ api: request }));
vi.mock('@/components/storage/previewJob', () => ({ calculatePreview: (body) => request('/api/storage/preview', { method: 'POST', body: JSON.stringify(body) }) }));
vi.mock('@/events', () => ({ useRealtime: vi.fn() }));
/* La vue est dans l'adresse (?vue=) : une adresse réactive remplace le routeur, pour que changer de vue soit synchrone. */
vi.mock('vue-router', async (importOriginal) => {
  const { reactive } = await import('vue');
  const route = reactive({ path: '/storage', query: {} });
  return {
    ...(await importOriginal()),
    useRoute: () => route,
    useRouter: () => ({ replace: (to) => { route.query = to.query || {}; }, push: (to) => { route.query = to.query || {}; } }),
    onBeforeRouteLeave: () => {},
    onBeforeRouteUpdate: () => {},
    __route: route,
  };
});
const route = vueRouter.__route;

const roots = [
  { arr_instance_id: 1, name: 'Radarr', arr_type: 'radarr', arr_roots: ['/data/FILMS', '/usb/FILMS'], plex_roots: [{ section_id: '1', library: 'Films', path: '/media/FILMS' }, { section_id: '1', library: 'Films', path: '/usb/MEDIA/FILMS' }] },
  { arr_instance_id: 2, name: 'Sonarr', arr_type: 'sonarr', arr_roots: ['/data/SERIES'], plex_roots: [{ section_id: '2', library: 'Séries', path: '/media/SERIES' }] },
];
const instances = [{ id: 1, name: 'Radarr', arr_type: 'radarr', enabled: true }, { id: 2, name: 'Sonarr', arr_type: 'sonarr', enabled: true }];
const locationRow = { id: 7, name: 'DATA 1', mount_path: '', reserve_bytes: 0, enabled: true, total_bytes: 10e9, free_bytes: 5e9, mappings: [{ arr_instance_id: 1, arr_root: '/data/FILMS', plex_root: '/media/FILMS', plex_section_id: '1' }] };

let data;
const defaults = () => ({ locations: [], transfers: [], accesses: [], connections: [], inventory: [] });
const handler = async (path, opts) => {
  if (path === '/api/storage/roots') return roots;
  if (path === '/api/storage/instances') return instances;
  if (path === '/api/storage/locations' && !opts) return data.locations;
  if (path === '/api/storage/transfers' && !opts) return data.transfers;
  if (path === '/api/storage/accesses') return data.accesses;
  if (path === '/api/storage/connections') return data.connections;
  if (path === '/api/storage/protected-titles') return [];
  if (path.startsWith('/api/storage/inventory')) return data.inventory;
  return {};
};

const body = () => document.body;
const buttons = () => [...document.querySelectorAll('button')];
const press = async (label) => { buttons().find((b) => b.textContent.trim() === label).click(); await flushPromises(); };
const has = (label) => buttons().some((b) => b.textContent.trim() === label);
/* La fiche d'une tâche s'ouvre par l'adresse (?tache=). */
const openTask = async (id, vue = 'transfers') => { route.query = { vue, tache: String(id) }; await flushPromises(); };
const goTo = async (vue) => { route.query = { vue }; await flushPromises(); };

let wrapper;
async function factory(vue = 'transfers') {
  route.query = { vue };
  wrapper = mount(StorageView, {
    attachTo: document.body,
    global: {
      stubs: {
        ConfirmModal: { props: ['open', 'title', 'message', 'confirmLabel'], emits: ['cancel', 'confirm'], template: '<div v-if="open" role="alertdialog" class="confirm"><p>{{ message }}</p><button @click="$emit(\'cancel\')">Annuler</button><button @click="$emit(\'confirm\')">{{ confirmLabel }}</button></div>' },
        UiMenu: { template: '<div><slot name="trigger"/><slot/></div>' },
        UiMenuItem: { emits: ['select'], template: '<button @click="$emit(\'select\', $event)"><slot/></button>' },
        RouterLink: { props: ['to'], template: '<a><slot/></a>' },
        PageTemplate: { props: ['tabs'], template: '<main><slot name="quick-action"/><slot name="filters"/><slot/></main>' },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe('Stockage et transferts', () => {
  beforeEach(() => { data = defaults(); localStorage.clear(); toasts.value = []; request.mockReset(); request.mockImplementation(handler); });
  afterEach(() => { wrapper?.unmount(); wrapper = null; document.body.innerHTML = ''; });

  it('liste les stockages avec leur capacité mesurée', async () => {
    data.locations = [locationRow];
    await factory('settings');
    expect(body().textContent).toContain('5 Go libres');
    expect(body().textContent).toContain('1 dossier(s) associé(s)');
  });

  it('propose les pages liées aux stockages sans les poser dans un tableau', async () => {
    data.locations = [locationRow];
    await factory('settings');
    expect(has('Ajouter un stockage')).toBe(true);
    await goTo('settings');
  });

  it('ouvre « Nouveau transfert » comme une définition du gabarit Créer', async () => {
    data.locations = [locationRow];
    await factory();
    await press('Nouveau transfert');
    expect(document.querySelector('.create-modal')).not.toBeNull();
    expect(body().textContent).toContain('Libérer une quantité d’espace');
    expect(request.mock.calls.some(([path]) => path === '/api/storage/preview')).toBe(false);
  });

  it('ouvre « Ajouter un stockage » et charge les dossiers découverts à l’étape des dossiers', async () => {
    await factory('settings');
    await press('Ajouter un stockage');
    expect(document.querySelector('.create-modal')).not.toBeNull();
    expect(body().textContent).toContain('Nom');
  });

  it('affiche les correspondances par instance et enregistre le choix modifié', async () => {
    data.locations = [locationRow];
    await factory('settings');
    await press('Correspondances Arr ↔ Plex');
    expect(request.mock.calls.some(([path]) => path === '/api/storage/roots')).toBe(true);
    expect(body().textContent).toContain('Radarr · Films');
    expect(body().textContent).toContain('Sonarr · Séries');
    expect(body().textContent).toContain('/usb/FILMS');
  });

  it('liste les connexions et propose de confirmer un serveur SSH inconnu', async () => {
    data.connections = [{ id: 3, name: 'NAS', method: 'ssh', trusted: false, connection: { host: 'nas' } }];
    data.locations = [locationRow];
    await factory('settings');
    await press('Gérer les connexions');
    expect(body().textContent).toContain('NAS');
    expect(body().textContent).toContain('Identité à confirmer');
    expect(has('Ajouter une connexion')).toBe(true);
  });

  it('consulte l’inventaire en tableau et ouvre la fiche d’une observation', async () => {
    data.locations = [locationRow];
    data.inventory = [{ id: 5, source: 'plex', present: true, observed_at: '2026-10-04T10:00:00', data: { title: 'Alien', files: [{ path: '/m/alien.mkv', size_bytes: 2e9, present: true }] } }];
    await factory('settings');
    await press('Consulter l’inventaire');
    expect(body().textContent).toContain('Alien');
    await press('Détails');
    expect(body().textContent).toContain('Inventaire');
    expect(has('Actualiser la fiche Plex')).toBe(true);
  });

  it('modifie un brouillon sans le reprendre aveuglément', async () => {
    data.transfers = [{ id: 11, status: 'draft', desired_state: 'pause', params: { transfer_mode: 'arr', arr_instance_id: 1, source_root: '/data/FILMS', destination_root: '/usb/FILMS', mode: 'release_space', goal_gb: 20 }, items: [] }];
    await factory();
    await openTask(11);
    expect(body().textContent).toContain('Tâche enregistrée, aucun transfert lancé');
    expect(has('Reprendre')).toBe(false);
    await press('Modifier');
    expect(document.querySelector('.create-modal')).not.toBeNull();
    expect(request.mock.calls.some(([path]) => path === '/api/storage/preview')).toBe(false);
  });

  it('confirme la suppression d’un brouillon avant de la demander', async () => {
    data.transfers = [{ id: 11, status: 'draft', desired_state: 'pause', params: { name: 'Ma tâche', transfer_mode: 'arr', arr_instance_id: 1 }, items: [] }];
    await factory();
    await openTask(11);
    await press('Supprimer le brouillon');
    expect(document.querySelector('[role="alertdialog"]').textContent).toContain('Aucun fichier média');
    await press('Annuler');
    expect(request.mock.calls.some(([, opts]) => opts?.method === 'DELETE')).toBe(false);
  });

  it('confirme l’annulation durable avant de supprimer une tâche en pause', async () => {
    data.transfers = [{ id: 18, status: 'paused', desired_state: 'pause', params: { transfer_mode: 'rsync_ssh' }, items: [] }];
    request.mockImplementation(async (path, opts) => (path === '/api/storage/transfers/18' && opts?.method === 'DELETE' ? { deletion_pending: true } : handler(path, opts)));
    await factory();
    await openTask(18);
    await press('Supprimer la tâche');
    expect(body().textContent).toContain('ses fichiers temporaires nettoyés');
    expect(request.mock.calls.some(([, opts]) => opts?.method === 'DELETE')).toBe(false);
    await press('Annuler et supprimer');
    expect(request).toHaveBeenCalledWith('/api/storage/transfers/18', { method: 'DELETE' });
    expect(toasts.value.some((t) => t.title.includes('annulation et nettoyage en cours'))).toBe(true);
  });

  it('propose de réessayer les titres bloqués d’une tâche', async () => {
    data.transfers = [{ id: 9, status: 'paused', desired_state: 'pause', params: { transfer_mode: 'arr' }, items: [{ id: 1, title: 'À corriger', status: 'blocked', reason: 'Fichier introuvable', size_bytes: 1e9 }, { id: 2, title: 'Fini', status: 'completed', size_bytes: 1e9 }] }];
    await factory();
    await openTask(9);
    expect(body().textContent).toContain('1 titre(s) à traiter');
    await press('Réessayer les titres en erreur');
    expect(request).toHaveBeenCalledWith('/api/storage/transfers/9/command', expect.objectContaining({ body: JSON.stringify({ action: 'retry' }) }));
  });

  it('garde les tâches terminées dans l’historique', async () => {
    data.transfers = [
      { id: 1, status: 'paused', params: { transfer_mode: 'arr' }, items: [] },
      { id: 2, status: 'completed', params: { transfer_mode: 'arr', name: 'Finie' }, updated_at: '2026-10-04T10:00:00', items: [] },
    ];
    await factory();
    expect(body().textContent).toContain('Tâche #1');
    expect(document.querySelectorAll('.understand-row')).toHaveLength(0);
    await goTo('history');
    expect(document.querySelectorAll('.understand-row')).toHaveLength(1);
    expect(body().textContent).not.toContain('Tâche #1');
  });

  it('reprend une tâche terminée directement à l’aperçu, sans créer de tâche', async () => {
    data.transfers = [{ id: 17, status: 'cancelled', desired_state: 'cancel', updated_at: '2026-10-04T10:00:00', params: { name: 'Nommée', mode: 'release_space', goal_gb: 20, arr_instance_id: 1, source_roots: ['/data/FILMS'], destination_root: '/usb/FILMS', transfer_mode: 'arr' }, items: [] }];
    request.mockImplementation(async (path, opts) => (path === '/api/storage/preview' ? { source: { id: 1, free_bytes: 100e9 }, destination: { id: 2, free_bytes: 200e9 }, items: [{ key: '1:7', title: 'Film', size_bytes: 20e9, snapshot: {} }], excluded: [], goal_covered: true } : handler(path, opts)));
    await factory('history');
    document.querySelector('.understand-row').click();
    await flushPromises();
    await press('Relancer');
    const preview = request.mock.calls.find(([path]) => path === '/api/storage/preview');
    expect(preview).toBeDefined();
    expect(JSON.parse(preview[1].body)).toMatchObject({ task_id: 17, name: 'Nommée' });
    expect(request.mock.calls.some(([path, opts]) => path === '/api/storage/transfers' && opts?.method === 'POST')).toBe(false);
    expect(document.querySelector('.create-modal')).not.toBeNull();
  });
});
