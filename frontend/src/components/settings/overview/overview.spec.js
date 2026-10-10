import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OverviewKpis from '@/components/templates/monitor/MonitorKpis.vue';
import OverviewQuickActions from './OverviewQuickActions.vue';
import OverviewServices from './OverviewServices.vue';
import OverviewTasks from './OverviewTasks.vue';
import OverviewTodo from '@/components/templates/monitor/MonitorAttention.vue';
import OverviewVerdict from '@/components/templates/monitor/MonitorVerdict.vue';
import OverviewZoneMap from '@/components/templates/monitor/MonitorZones.vue';

const api = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => api(...args) }));
const addToast = vi.fn();
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ addToast }) }));

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
});
const global = { plugins: [router] };

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({});
  addToast.mockReset();
});

describe('OverviewVerdict', () => {
  const verdict = (props) => mount(OverviewVerdict, { props, global });

  it('dit que tout fonctionne quand rien n’est à traiter', () => {
    const wrapper = verdict({ urgent: 0 });
    expect(wrapper.get('h2').text()).toBe('Tout fonctionne');
    expect(wrapper.get('section').classes()).toContain('is-good');
  });

  it('compte les points, accorde le pluriel et détaille erreurs et alertes', () => {
    const one = verdict({ urgent: 1, errors: 1 });
    expect(one.get('h2').text()).toBe('1 point à traiter');
    expect(one.get('section').classes()).toContain('is-error');
    expect(one.get('p').text()).toBe('1 erreur');

    const many = verdict({ urgent: 5, errors: 1, warnings: 4 });
    expect(many.get('h2').text()).toBe('5 points à traiter');
    expect(many.get('p').text()).toBe('1 erreur, 4 à surveiller');
    // Le chiffre affiché est décoratif : les lecteurs d'écran le lisent dans le titre.
    expect(many.get('.overview-verdict__mark').attributes('aria-hidden')).toBe('true');
  });

  it('prend le ton d’avertissement sans erreur, et ne conclut rien pendant le chargement', () => {
    expect(verdict({ urgent: 2, warnings: 2 }).get('section').classes()).toContain('is-warn');
    const loading = verdict({ urgent: 0, loading: true });
    expect(loading.get('h2').text()).toBe('Vérification de l’instance…');
    expect(loading.get('section').classes()).toContain('is-idle');
  });

  it('n’a plus de bouton de relecture', () => {
    expect(verdict({ urgent: 2, errors: 1, warnings: 1 }).find('button').exists()).toBe(false);
  });
});

describe('OverviewKpis', () => {
  const kpis = [
    { key: 'approval', label: 'À approuver', value: '3', status: '3 demandes', tone: 'warn', to: '/discover/requests' },
    { key: 'notifications', label: 'Notifications · 7 j', value: '42', unit: 'envoyées', status: 'Aucun échec', tone: 'ok', to: '/notifications', spark: [0, 5, 10] },
  ];

  it('rend une tuile par chiffre, qui mène à son écran', () => {
    const wrapper = mount(OverviewKpis, { props: { kpis }, global });
    const tiles = wrapper.findAll('a');
    expect(tiles.map((tile) => tile.attributes('href'))).toEqual(['/discover/requests', '/notifications']);
    expect(wrapper.text()).toContain('42envoyées');
    expect(wrapper.findAll('.overview-pill')[0].classes()).toContain('is-warn');
  });

  it('dessine la courbe à l’échelle du jour le plus chargé, et seulement quand il y en a une', () => {
    const wrapper = mount(OverviewKpis, { props: { kpis }, global });
    const curves = wrapper.findAll('polyline');
    expect(curves).toHaveLength(1);
    // 0 en bas, 10 (le maximum) en haut ; trois points répartis sur 100.
    expect(curves[0].attributes('points')).toBe('0.0,22.0 50.0,12.0 100.0,2.0');
  });

  it('garde une courbe à plat quand rien n’a été envoyé', () => {
    const flat = [{ ...kpis[1], spark: [0, 0, 0] }];
    const wrapper = mount(OverviewKpis, { props: { kpis: flat }, global });
    expect(wrapper.get('polyline').attributes('points')).toBe('0.0,22.0 50.0,22.0 100.0,22.0');
  });
});

describe('OverviewTodo', () => {
  const icons = { 'admin-connections': { render: () => null } };
  const items = [
    { key: 'a', severity: 'error', area: 'admin-connections', title: 'Plex ne répond pas', detail: 'Injoignable', action: { label: 'Corriger', to: '/settings/services' } },
    { key: 'b', severity: 'warn', area: 'admin-requests', title: '3 demandes à approuver', detail: 'En attente', action: { label: 'Examiner', to: '/discover/requests' } },
  ];

  it('liste chaque point avec son action, la gravité lisible par les lecteurs d’écran', () => {
    const wrapper = mount(OverviewTodo, { props: { items, icons }, global });
    expect(wrapper.findAll('.overview-todo__item')).toHaveLength(2);
    expect(wrapper.text()).toContain('Erreur :');
    expect(wrapper.text()).toContain('À surveiller :');
    expect(wrapper.findAll('a').map((link) => link.attributes('href'))).toEqual(['/settings/services', '/discover/requests']);
    // Seule une erreur appelle l'action principale.
    expect(wrapper.findAll('a')[0].classes()).toContain('is-primary');
    expect(wrapper.findAll('a')[1].classes()).not.toContain('is-primary');
  });

  it('dit « rien à traiter » quand la liste est vide, et attend la fin du chargement', () => {
    expect(mount(OverviewTodo, { props: { items: [], icons }, global }).text()).toContain('Rien à traiter');
    const loading = mount(OverviewTodo, { props: { items: [], icons, loading: true }, global });
    expect(loading.text()).toContain('Vérification des services');
    expect(loading.text()).not.toContain('Rien à traiter');
  });
});

describe('OverviewTasks', () => {
  const iso = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

  it('met les échecs en tête, puis les passages les plus récents', () => {
    const tasks = [
      { job: 'old', label: 'Ancienne', state: { status: 'complete', finished_at: iso(300) } },
      { job: 'bad', label: 'Cassée', state: { status: 'failed', finished_at: iso(120) } },
      { job: 'new', label: 'Récente', state: { status: 'complete', finished_at: iso(2) } },
      { job: 'never', label: 'Jamais', state: null },
    ];
    const wrapper = mount(OverviewTasks, { props: { tasks }, global });
    expect(wrapper.findAll('.overview-tasks__name').map((cell) => cell.text())).toEqual(['Cassée', 'Récente', 'Ancienne', 'Jamais']);
    const pills = wrapper.findAll('.overview-pill').map((pill) => pill.text());
    expect(pills).toEqual(['Échec', 'OK', 'OK', 'En attente']);
  });

  it('se limite au nombre demandé', () => {
    const tasks = Array.from({ length: 8 }, (_, index) => ({ job: `t${index}`, label: `T${index}`, state: { status: 'complete', finished_at: iso(index) } }));
    expect(mount(OverviewTasks, { props: { tasks, limit: 3 }, global }).findAll('li')).toHaveLength(3);
  });
});

describe('OverviewServices', () => {
  it('liste les services avec leur état, et mène à leur écran', () => {
    const rows = [
      { key: 'plex', label: 'Plex', to: '/settings/services', tone: 'error', state: 'En erreur' },
      { key: 'seer', label: 'Seer', to: '/settings/services/integrations', tone: 'off', state: 'Désactivé' },
    ];
    const wrapper = mount(OverviewServices, { props: { rows }, global });
    expect(wrapper.findAll('.overview-service').map((link) => link.attributes('href'))).toEqual(['/settings/services', '/settings/services/integrations']);
    expect(wrapper.text()).toContain('En erreur');
    expect(wrapper.get('h2').text()).toBe('Santé des services');
  });
});

describe('OverviewZoneMap', () => {
  const groups = [
    { label: 'Services', items: [{ key: 'admin-connections', label: 'Connexions', to: '/settings/services', icon: { render: () => null }, line: 'Plex en erreur', severity: 'error' }] },
    { label: 'Accès', items: [{ key: 'admin-users', label: 'Utilisateurs', to: '/users', icon: { render: () => null }, line: '', severity: null }] },
  ];

  it('groupe les zones comme la barre latérale, avec leur ligne d’état', () => {
    const wrapper = mount(OverviewZoneMap, { props: { groups }, global });
    expect(wrapper.findAll('h2').map((heading) => heading.text())).toEqual(['Services', 'Accès']);
    expect(wrapper.findAll('.zone').map((zone) => zone.attributes('href'))).toEqual(['/settings/services', '/users']);
    expect(wrapper.text()).toContain('Plex en erreur');
  });

  it('marque la gravité par une pastille et un libellé, jamais par la couleur seule', () => {
    const wrapper = mount(OverviewZoneMap, { props: { groups }, global });
    const [broken, calm] = wrapper.findAll('.zone');
    expect(broken.find('.zone__dot').classes()).toContain('is-error');
    expect(broken.text()).toContain('Erreur');
    expect(calm.find('.zone__dot').exists()).toBe(false);
  });
});

describe('OverviewQuickActions', () => {
  const maintenance = { 'warm-images': { status: 'done', finished_at: new Date(Date.now() - 3 * 3600_000).toISOString() } };

  it('rappelle le dernier passage de chaque action', () => {
    const wrapper = mount(OverviewQuickActions, { props: { maintenance }, global });
    const texts = wrapper.findAll('.overview-actions__text small').map((cell) => cell.text());
    expect(texts[0]).toBe('Dernier passage : il y a 3 h');
    expect(texts[1]).toBe('Aucun passage récent');
  });

  it('lance l’action, prévient avec un lien vers la progression, et demande une relecture', async () => {
    const wrapper = mount(OverviewQuickActions, { props: { maintenance: null }, global });
    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();

    expect(api).toHaveBeenCalledWith('/api/maintenance/run/warm-images', { method: 'POST' });
    const toast = addToast.mock.calls[0][0];
    expect(toast).toMatchObject({ type: 'success', title: 'Précharger les images : lancé' });
    expect(toast.action.label).toBe('Suivre');
    expect(wrapper.emitted('started')).toHaveLength(1);
  });

  it('dit pourquoi une action n’a pas pu partir, sans la signaler comme lancée', async () => {
    api.mockRejectedValue(new Error('Action désactivée'));
    const wrapper = mount(OverviewQuickActions, { props: { maintenance: null }, global });
    await wrapper.findAll('button')[1].trigger('click');
    await flushPromises();

    expect(addToast.mock.calls[0][0]).toMatchObject({ type: 'error' });
    expect(wrapper.emitted('started')).toBeUndefined();
  });

  it('n’autorise qu’une action à la fois', async () => {
    let finish;
    api.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const wrapper = mount(OverviewQuickActions, { props: { maintenance: null }, global });
    await wrapper.findAll('button')[0].trigger('click');

    expect(wrapper.findAll('button').every((button) => button.attributes('disabled') !== undefined)).toBe(true);
    finish({});
    await flushPromises();
    expect(wrapper.findAll('button').some((button) => button.attributes('disabled') !== undefined)).toBe(false);
  });
});


it('les blocs de supervision lisent les objets métier entiers', () => {
  const health = mount(OverviewServices, { props: { rows: [{ key: 'smtp', label: 'E-mail', to: '/settings',
    service: { state: 'ok', health: { key: 'smtp', state: 'configured', label: 'Configuré', reason: null } },
  }] }, global });
  expect(health.text()).toContain('Configuré');
  expect(health.text()).not.toContain('Opérationnel');
  const task = mount(OverviewTasks, { props: { tasks: [{ job: 'watchlist', label: 'Watchlist',
    state: { status: 'complete', finished_at: '2026-10-10T00:00:00Z' },
    work: { key: 'task:watchlist', source: 'task', state: 'unknown', label: 'État inconnu', stage: null,
      progress: { percent: null, scope: 'execution', label: 'Exécution' }, reason: null, stale: false },
  }] }, global });
  expect(task.text()).toContain('État inconnu');
  expect(task.text()).not.toContain('OK');
});
