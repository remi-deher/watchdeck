import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import HistoryTable from './HistoryTable.vue';

describe('HistoryTable', () => {
  it('affiche une grande affiche, l’adresse IP et son lieu sur des lignes séparées', () => {
    const wrapper = mount(HistoryTable, { props: { items: [{
      source: 'tautulli',
      session_id: '42',
      title: 'Film',
      user_name: 'Rémi',
      player: 'Apple TV',
      address: '82.64.10.20',
      geo_status: 'resolved',
      geo_city: 'Paris',
      geo_region: 'Île-de-France',
      geo_country_code: 'FR',
      watched_ms: 3_600_000,
      started_at: '2026-08-03T20:00:00',
    }] } });

    expect(wrapper.get('.media-artwork').classes()).toContain('history');
    expect(wrapper.get('.history-client').text()).toContain('82.64.10.20');
    expect(wrapper.get('.history-place').text()).toBe('Paris, Île-de-France, FR');
  });

  it('affiche simplement local pour une adresse privée', () => {
    const wrapper = mount(HistoryTable, { props: { items: [{
      source: 'plex',
      session_id: 'local',
      title: 'Film local',
      address: '192.168.1.25',
      geo_status: 'local',
    }] } });

    expect(wrapper.get('.history-place').text()).toBe('local');
  });
  it('réunit les lectures par journée avec un en-tête collant', () => {
    // Un historique se lit par date : sans repère, la liste est un mur de lignes.
    const wrapper = mount(HistoryTable, {
      props: {
        items: [
          { id: 1, title: 'Film A', user_name: 'Lisa', started_at: '2026-08-03T20:00:00', watched_ms: 60_000 },
          { id: 2, title: 'Film B', user_name: 'Lisa', started_at: '2026-08-03T22:00:00', watched_ms: 60_000 },
          { id: 3, title: 'Film C', user_name: 'Lisa', started_at: '2026-08-02T20:00:00', watched_ms: 60_000 },
        ],
      },
    });

    const days = wrapper.findAll('.history-day');
    expect(days).toHaveLength(2);
    expect(days[0].text()).toContain('3 août 2026');
    expect(days[0].text()).toContain('2 lectures');
  });

  it('reste à plat quand le tri mélange les dates', () => {
    // Trier par durée casse l'ordre chronologique : un en-tête de jour ne voudrait
    // plus rien dire.
    const wrapper = mount(HistoryTable, {
      props: {
        groupByDay: false,
        items: [{ id: 1, title: 'Film A', started_at: '2026-08-03T20:00:00' }],
      },
    });

    expect(wrapper.findAll('.history-day')).toHaveLength(0);
    expect(wrapper.findAll('.history-table button')).toHaveLength(1);
  });

  it('demande la page suivante quand la sentinelle devient visible', async () => {
    // Le chargement au défilement remplace le clic sur « Afficher 100 de plus ».
    const observers = [];
    class FakeObserver {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(element) { this.element = element; }
      disconnect() { this.disconnected = true; }
      trigger(isIntersecting = true) { this.callback([{ isIntersecting, target: this.element }]); }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);

    const wrapper = mount(HistoryTable, {
      props: { items: [{ id: 1, title: 'Film A', started_at: '2026-08-03T20:00:00' }], hasMore: true },
    });
    await wrapper.vm.$nextTick();

    observers.at(-1).trigger();
    expect(wrapper.emitted('load-more')).toHaveLength(1);

    // Une page peut arriver alors que la sentinelle est encore visible : redemander la
    // même page la dupliquerait.
    await wrapper.setProps({ loadingMore: true });
    observers.at(-1).trigger();
    expect(wrapper.emitted('load-more')).toHaveLength(1);

    vi.unstubAllGlobals();
  });

  it('ne guette rien quand tout est déjà chargé', async () => {
    const observers = [];
    class FakeObserver {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);

    mount(HistoryTable, { props: { items: [{ id: 1, title: 'A' }], hasMore: false } });

    expect(observers).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
