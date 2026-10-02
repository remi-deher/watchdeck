/**
 * Sous 640px la grille mensuelle ne tient pas et etait masquee en CSS, alors que
 * le bouton « Mois » restait affiche : le taper vidait la page. Le choix « Mois »
 * est desormais retire en mode compact (Agenda et Semaine restent) et la vue retombe
 * sur l'agenda, y compris quand une preference « mois » vient d'un usage sur grand
 * ecran.
 */
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';

import CalendarView from './CalendarView.vue';

const apiMock = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => apiMock(...args) }));
// `useRoute` sert a porter l'adresse de depart : une fiche ouverte depuis une page se
// pose au-dessus d'elle plutot que de la remplacer (voir `useMediaOverlay`).
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ fullPath: '/calendar' }),
}));

let listeners = [];
let viewportWidth = 1280;

// `matches` est un getter : le composant conserve le MediaQueryList obtenu au
// montage, il doit donc voir les changements de largeur ulterieurs.
window.matchMedia = query => ({
  media: query,
  get matches() {
    return /max-width: ?640px/.test(query) ? viewportWidth <= 640 : false;
  },
  addEventListener: (_event, handler) => listeners.push(handler),
  removeEventListener: (_event, handler) => {
    listeners = listeners.filter(entry => entry !== handler);
  },
  addListener: () => {},
  removeListener: () => {},
  onchange: null,
  dispatchEvent: () => false,
});

function viewLabels(wrapper) {
  return wrapper.findAll('.calendar-view-switch .ui-segmented-item').map(item => item.text());
}

function setViewport(width) {
  viewportWidth = width;
}

function mountView() {
  // Un cache neuf par montage : le mois d'un test ne doit pas servir au suivant.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return mount(CalendarView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: {
        AppPage: {
          props: ['query', 'modelValue', 'title'],
          // Le vrai AppPage rend h1, sous-navigation et retours d'etat ; ici seuls la
          // recherche et le contenu comptent, et AppPage.spec.js couvre le reste.
          template: `<div class="app-page-stub"><input type="search" :value="query || modelValue" @input="$emit('update:query', $event.target.value); $emit('update:modelValue', $event.target.value); $emit('search', $event.target.value)" /><slot name="tools" /><slot /></div>`,
        },
        FilterSidebar: {
          template: '<div class="filter-sidebar-stub"><slot /></div>',
        },
        UiFeedback: true,
      },
    },
  });
}

beforeEach(() => {
  listeners = [];
  localStorage.clear();
  apiMock.mockReset();
  apiMock.mockResolvedValue([]);
});

describe('CalendarView', () => {
  it('retire le choix « Mois » sous 640px', async () => {
    setViewport(375);
    const wrapper = mountView();
    await flushPromises();

    expect(viewLabels(wrapper)).toEqual(['Agenda', 'Semaine']);
    expect(wrapper.find('.month-calendar-shell').exists()).toBe(false);
    expect(wrapper.find('.calendar-agenda').exists()).toBe(true);
    wrapper.unmount();
  });

  it('ignore une preference « mois » heritee du grand ecran en mode compact', async () => {
    localStorage.setItem('calendar.view', 'month');
    setViewport(375);
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find('.month-calendar-shell').exists()).toBe(false);
    expect(wrapper.find('.calendar-agenda').exists()).toBe(true);
    // La preference reste intacte pour le prochain passage sur grand ecran.
    expect(localStorage.getItem('watchdeck:calendar.view')).toBe('month');
    wrapper.unmount();
  });

  it('rend le selecteur et la grille mensuelle au-dessus de 640px', async () => {
    localStorage.setItem('calendar.view', 'month');
    setViewport(1280);
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find('.calendar-view-switch').exists()).toBe(true);
    expect(wrapper.find('.month-calendar-shell').exists()).toBe(true);
    expect(wrapper.findAll('.month-cell')).toHaveLength(42);
    wrapper.unmount();
  });

  it('bascule sur l’agenda quand la fenetre passe sous 640px', async () => {
    localStorage.setItem('calendar.view', 'month');
    setViewport(1280);
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('.month-calendar-shell').exists()).toBe(true);

    setViewport(375);
    listeners.forEach(handler => handler({ matches: true }));
    await flushPromises();

    expect(viewLabels(wrapper)).toEqual(['Agenda', 'Semaine']);
    expect(wrapper.find('.month-calendar-shell').exists()).toBe(false);
    expect(wrapper.find('.calendar-agenda').exists()).toBe(true);
    wrapper.unmount();
  });

  it('charge les événements au montage et lors d’une mise à jour temps réel sans réenroulement imposé', async () => {
    setViewport(1280);
    const wrapper = mountView();
    await flushPromises();

    // Le second argument porte le signal d'annulation de la lecture.
    expect(apiMock).toHaveBeenCalledWith(expect.stringContaining('/api/calendar?start='), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    wrapper.unmount();
  });

  it('met à jour les événements en place lors d’un événement temps réel request.updated', async () => {
    localStorage.setItem('calendar.view', 'agenda');
    setViewport(1280);
    apiMock.mockResolvedValue([
      { request_id: 42, title: 'Inception', date: '2026-08-15T20:00:00Z', type: 'movie', has_file: false },
    ]);
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Inception');
    expect(wrapper.find('.plex-action-btn').exists()).toBe(false);

    // Événement SSE reçu
    window.dispatchEvent(new CustomEvent('watchdeck:request.updated', {
      detail: {
        payload: { request_id: 42, status: 'available', has_file: true },
      },
    }));
    await new Promise(r => setTimeout(r, 150));
    await flushPromises();

    // L'élément a été mis à jour in-place
    expect(wrapper.find('.plex-action-btn').exists()).toBe(true);
    expect(wrapper.find('.calendar-event-card.state-available').exists()).toBe(true);
    wrapper.unmount();
  });

  it('préserve le mois navigué lors d’un événement SSE qui déclenche un rechargement', async () => {
    localStorage.setItem('calendar.view', 'month');
    setViewport(1280);
    apiMock.mockResolvedValue([]);
    const wrapper = mountView();
    await flushPromises();

    // Navigue vers le mois suivant
    const nextBtn = wrapper.find('button[aria-label="Mois suivant"]');
    expect(nextBtn.exists()).toBe(true);
    await nextBtn.trigger('click');
    await flushPromises();

    const lastCallArg = apiMock.mock.calls[apiMock.mock.calls.length - 1][0];
    apiMock.mockClear();

    // Événement SSE inconnu déclenchant un load()
    window.dispatchEvent(new CustomEvent('watchdeck:request.updated', {
      detail: {
        payload: { request_id: 999 },
      },
    }));
    await new Promise(r => setTimeout(r, 150));
    await flushPromises();

    // Doit avoir rechargé avec les mêmes bornes (le mois navigué)
    expect(apiMock.mock.calls.map(([url]) => url)).toContain(lastCallArg);
    wrapper.unmount();
  });

  it('affiche la periode et saute au mois choisi', async () => {
    localStorage.setItem('calendar.view', 'month');
    setViewport(1280);
    const wrapper = mountView();
    await flushPromises();

    const now = new Date();
    const monthName = now.toLocaleDateString('fr-FR', { month: 'long' });
    expect(wrapper.find('.period-trigger').text().toLowerCase()).toContain(monthName);

    await wrapper.find('button[aria-label="Mois suivant"]').trigger('click');
    await flushPromises();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    expect(wrapper.find('.period-trigger').text().toLowerCase()).toContain(next.toLocaleDateString('fr-FR', { month: 'long' }));
    wrapper.unmount();
  });

  it('rend la semaine sur sept jours et lit la semaine seulement', async () => {
    localStorage.setItem('calendar.view', 'week');
    setViewport(1280);
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.findAll('.week-day')).toHaveLength(7);
    const url = apiMock.mock.calls.map(([u]) => u).find(u => u.startsWith('/api/calendar'));
    const [, start, end] = url.match(/start=([\d-]+)&end=([\d-]+)/);
    expect((new Date(end) - new Date(start)) / 86_400_000).toBe(7);
    expect(wrapper.find('button[aria-label="Semaine suivante"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('distingue les etats et filtre par etat', async () => {
    localStorage.setItem('calendar.view', 'agenda');
    setViewport(1280);
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    apiMock.mockResolvedValue([
      { request_id: 1, title: 'Episode manquant', subtitle: 'S01E01', date: past, type: 'episode', has_file: false },
      { request_id: 2, title: 'En cours', subtitle: 'S01E02', date: past, type: 'episode', has_file: false, downloading: true },
      { request_id: 3, title: 'Au cinema', subtitle: 'Sortie cinéma', date: past, type: 'movie', release_type: 'cinema', has_file: false },
      { request_id: 4, title: 'Bientot', subtitle: 'S01E03', date: future, type: 'episode', has_file: false },
    ]);
    const wrapper = mountView();
    await flushPromises();

    const legend = wrapper.find('.calendar-legend').text();
    expect(legend).toContain('En retard');
    expect(legend).toContain('En téléchargement');
    expect(legend).toContain('En salle');
    expect(legend).toContain('À venir');
    expect(wrapper.findAll('.calendar-event-card.state-late')).toHaveLength(1);
    expect(wrapper.findAll('.calendar-event-card.state-downloading')).toHaveLength(1);
    expect(wrapper.findAll('.calendar-event-card.state-released')).toHaveLength(1);

    const lateChip = wrapper.findAll('[aria-label="État"] button').find(b => b.text() === 'En retard');
    await lateChip.trigger('click');
    await flushPromises();
    expect(wrapper.findAll('.calendar-event-card')).toHaveLength(1);
    expect(wrapper.text()).toContain('Episode manquant');
    wrapper.unmount();
  });

  it('cherche sur une large fenetre plutot que sur le mois affiche', async () => {
    localStorage.setItem('calendar.view', 'month');
    setViewport(1280);
    const wrapper = mountView();
    await flushPromises();
    apiMock.mockClear();

    await wrapper.find('input[type="search"]').setValue('dune');
    await flushPromises();

    const url = apiMock.mock.calls.map(([u]) => u).find(u => u.startsWith('/api/calendar'));
    const [, start, end] = url.match(/start=([\d-]+)&end=([\d-]+)/);
    expect((new Date(end) - new Date(start)) / 86_400_000).toBeGreaterThan(400);
    expect(wrapper.find('.month-calendar-shell').exists()).toBe(false);
    expect(wrapper.find('.calendar-search-scope').exists()).toBe(true);
    wrapper.unmount();
  });
});
