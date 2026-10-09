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
