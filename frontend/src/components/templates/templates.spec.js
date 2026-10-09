import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import MonitorTemplate from './MonitorTemplate.vue';
import PageTemplate from './PageTemplate.vue';

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
});
const global = { plugins: [router] };

const item = (key, severity) => ({ key, severity, title: `Point ${key}`, detail: 'Cause', action: { label: 'Voir', to: '/x' } });

describe('MonitorTemplate', () => {
  it('deduit le verdict des points d’attention et garde l’ordre des blocs', () => {
    const wrapper = mount(MonitorTemplate, {
      props: {
        items: [item('a', 'error'), item('b', 'warn'), item('c', 'info')],
        kpis: [{ key: 'k', label: 'En cours', value: '4', status: 'Normal', tone: 'ok', to: '/q' }],
        zones: [{ label: '', items: [{ key: 'z', label: 'Traitements', to: '/q', icon: 'span', line: '4 en cours', severity: null }] }],
      },
      global,
    });
    // Erreurs et avertissements comptent ; une information ne fait pas un point à traiter.
    expect(wrapper.find('.overview-verdict h2').text()).toContain('2');
    expect(wrapper.find('.overview-verdict').classes()).toContain('is-error');
    const order = [...wrapper.find('.monitor').element.children].map((node) => [...node.classList].find((c) => c.startsWith('monitor__')));
    expect(order).toEqual(['monitor__verdict', 'monitor__kpis', 'monitor__attention', 'monitor__zones']);
  });

  it('affiche les textes de la page quand tout va bien', () => {
    const wrapper = mount(MonitorTemplate, {
      props: { items: [], labels: { okTitle: 'L’encodage tourne', okDetail: 'Aucun échec, aucun disque bloqué.' } },
      global,
    });
    expect(wrapper.find('.overview-verdict').text()).toContain('L’encodage tourne');
    expect(wrapper.find('.overview-todo').text()).toContain('Aucun échec, aucun disque bloqué.');
    expect(wrapper.find('.monitor__kpis').exists()).toBe(false);
  });

  it('place les panneaux complémentaires à côté de l’attention', () => {
    const wrapper = mount(MonitorTemplate, { props: { items: [] }, slots: { details: '<p class="extra">Services</p>' }, global });
    expect(wrapper.find('.monitor').classes()).toContain('has-details');
    expect(wrapper.find('.monitor__details .extra').exists()).toBe(true);
  });
});

describe('PageTemplate', () => {
  it('remplace le contenu par l’état non configuré, avec le lien pour configurer', () => {
    const wrapper = mount(PageTemplate, {
      props: { title: 'Encodage', state: 'unconfigured', unconfigured: { title: 'FileFlows n’est pas branché', actionTo: '/settings/services/media' } },
      slots: { default: '<p class="content">Contenu</p>' },
      global,
    });
    expect(wrapper.text()).toContain('FileFlows n’est pas branché');
    expect(wrapper.find('.content').exists()).toBe(false);
  });

  it('montre le contenu une fois prêt', () => {
    const wrapper = mount(PageTemplate, { props: { title: 'Encodage' }, slots: { default: '<p class="content">Contenu</p>' }, global });
    expect(wrapper.find('.content').exists()).toBe(true);
  });
});

describe('TrackTemplate', () => {
  const tracked = (key, state, extra = {}) => ({ key, state, title: `Fichier ${key}`, ...extra });

  it('groupe par état dans un ordre fixe : bloqués d’abord, attente en dernier', async () => {
    const { default: TrackTemplate } = await import('./TrackTemplate.vue');
    const wrapper = mount(TrackTemplate, {
      props: { items: [tracked('w', 'waiting'), tracked('r', 'running', { progress: 42 }), tracked('b', 'blocked', { cause: { headline: 'Import refusé' } })] },
      global,
    });
    const heads = wrapper.findAll('.track__group h2').map((node) => node.text());
    expect(heads).toEqual(['Demande une intervention', 'En cours', 'En attente']);
    expect(wrapper.find('.track__group.is-blocked').text()).toContain('Import refusé');
    expect(wrapper.find('.track__group.is-running').text()).toContain('42 %');
  });

  it('remonte l’action choisie avec son élément', async () => {
    const { default: TrackTemplate } = await import('./TrackTemplate.vue');
    const item = tracked('b', 'blocked', { actions: [{ key: 'retry', label: 'Relancer', tone: 'primary' }] });
    const wrapper = mount(TrackTemplate, { props: { items: [item] }, global });
    await wrapper.find('.track-card__actions button').trigger('click');
    expect(wrapper.emitted('action')[0]).toEqual([item, 'retry']);
  });

  it('dit que rien ne tourne, et garde les derniers terminés', async () => {
    const { default: TrackTemplate } = await import('./TrackTemplate.vue');
    const wrapper = mount(TrackTemplate, {
      props: { items: [], recent: [{ key: 'd', title: 'Dune', detail: 'il y a 5 min' }], historyTo: '/encoding/history', labels: { items: 'traitements' } },
      global,
    });
    expect(wrapper.text()).toContain('Rien ne tourne');
    expect(wrapper.text()).toContain('Aucun traitement en cours ni en attente.');
    expect(wrapper.find('.track__recent').text()).toContain('Dune');
    expect(wrapper.find('.track__history').attributes('href')).toBe('/encoding/history');
  });
});
