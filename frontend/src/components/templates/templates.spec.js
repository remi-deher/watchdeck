import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import MonitorTemplate from './MonitorTemplate.vue';
import PageTemplate from './PageTemplate.vue';
import BrowseTemplate from './BrowseTemplate.vue';
import ConfigureTemplate from './ConfigureTemplate.vue';
import DetailTemplate from './DetailTemplate.vue';
import ConfigureTest from './configure/ConfigureTest.vue';
import ExploreTemplate from './ExploreTemplate.vue';
import HandleTemplate from './HandleTemplate.vue';
import ResourceList from './configure/ResourceList.vue';
import TrackTemplate from './TrackTemplate.vue';
import UnderstandTemplate from './UnderstandTemplate.vue';

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

  it('se tait quand tout va bien : pas de verdict, le message de la page dans l’attention', () => {
    const wrapper = mount(MonitorTemplate, {
      props: { items: [], labels: { okTitle: 'L’encodage tourne', okDetail: 'Aucun échec, aucun disque bloqué.' } },
      global,
    });
    expect(wrapper.find('.overview-verdict').exists()).toBe(false);
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
    const wrapper = mount(TrackTemplate, {
      props: { items: [tracked('w', 'waiting'), tracked('r', 'running', { progress: 42 }), tracked('b', 'blocked', { cause: { headline: 'Import refusé' } })] },
      global,
    });
    const heads = wrapper.findAll('.track__group h2').map((node) => node.text());
    expect(heads).toEqual(['Demande une intervention', '1 en cours', 'En attente']);
    expect(wrapper.find('.track__group.is-blocked').text()).toContain('Import refusé');
    // En cours : le bandeau commun, progression en barre.
    expect(wrapper.find('.track__group.is-running .live-card-track i').attributes('style')).toContain('width: 42%');
  });

  it('remonte l’action choisie avec son élément', async () => {
    const item = tracked('b', 'blocked', { actions: [{ key: 'retry', label: 'Relancer', tone: 'primary' }] });
    const wrapper = mount(TrackTemplate, { props: { items: [item] }, global });
    await wrapper.find('.track-card__actions button').trigger('click');
    expect(wrapper.emitted('action')[0]).toEqual([item, 'retry']);
  });

  it('dit que rien ne tourne, et garde les derniers terminés', async () => {
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

describe('TrackTemplate · attente', () => {
  it('liste l’attente en lignes numérotées, repliées au-delà de la limite', async () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ key: `w${i}`, state: 'waiting', title: `Fichier ${i}` }));
    const wrapper = mount(TrackTemplate, { props: { items, queueLimit: 3 }, global });
    expect(wrapper.findAll('.track-queue__row')).toHaveLength(3);
    expect(wrapper.find('.track-queue__rank').text()).toBe('1');
    await wrapper.find('.track-queue__more button').trigger('click');
    expect(wrapper.findAll('.track-queue__row')).toHaveLength(8);
  });
});

describe('HandleTemplate', () => {
  const row = (key, issue, urgency, extra = {}) => ({ key, issue, urgency, title: `Film ${key}`, problem: 'Aucune piste française', ...extra });
  const issues = [
    { key: 'vf', label: 'VF manquante', count: 2, fixable: 1, bulk: { key: 'fix-all', label: 'Corriger les 1' } },
    { key: 'subs', label: 'Sous-titres absents', count: 1 },
  ];

  it('trie par urgence, filtre par type et propose l’action groupée du type', async () => {
    const wrapper = mount(HandleTemplate, {
      props: { issues, items: [row('a', 'vf', 'low'), row('b', 'subs', 'medium'), row('c', 'vf', 'high')] },
      global,
    });
    expect(wrapper.findAll('.handle-row__title').map((n) => n.text())).toEqual(['Film c', 'Film b', 'Film a']);
    expect(wrapper.findAll('.handle-issue__fix').map((n) => n.text())).toEqual(['1 corrigeable', 'À décider']);
    await wrapper.findAll('.handle-issue')[0].trigger('click');
    expect(wrapper.findAll('.handle-row__title').map((n) => n.text())).toEqual(['Film c', 'Film a']);
    await wrapper.find('.handle__bulk button').trigger('click');
    expect(wrapper.emitted('bulk')[0]).toEqual(['fix-all', 'vf']);
  });

  it('montre l’affiche seulement quand l’élément en a une', async () => {
    const wrapper = mount(HandleTemplate, {
      props: { items: [row('a', 'vf', 'high', { poster: 'https://img/a.jpg' }), row('b', 'vf', 'high')] },
      global,
    });
    expect(wrapper.findAll('.handle-row__poster')).toHaveLength(1);
  });

  it('agit sur la sélection, et oublie un élément traité', async () => {
    const items = [row('a', 'vf', 'high'), row('b', 'vf', 'high')];
    const wrapper = mount(HandleTemplate, { props: { items, selectionActions: [{ key: 'ignore', label: 'Ignorer' }] }, global });
    await wrapper.findAll('.handle-row [role="checkbox"], .handle-row input[type="checkbox"]')[0].trigger('click');
    await wrapper.find('.bulk-bar button').trigger('click');
    expect(wrapper.emitted('selection')[0]).toEqual(['ignore', ['a']]);
    await wrapper.setProps({ items: [items[1]] });
    expect(wrapper.find('.bulk-bar').exists()).toBe(false);
  });

  it('dit qu’il n’y a rien à traiter', async () => {
    expect(mount(HandleTemplate, { props: { items: [] }, global }).text()).toContain('Rien à traiter');
  });
});

describe('ExploreTemplate', () => {
  const films = [{ id: 1, title: 'Dune' }, { id: 2, title: 'Tenet' }];
  const item = '<template #item="{ item }"><article class="card">{{ item.title }}</article></template>';

  it('rend chaque élément par la carte de la page, et compte les résultats', async () => {
    const wrapper = mount(ExploreTemplate, { props: { items: films, total: 37, unit: ['film', 'films'] }, slots: { item }, global });
    expect(wrapper.findAll('.card').map((n) => n.text())).toEqual(['Dune', 'Tenet']);
    expect(wrapper.find('.explore__count').text()).toBe('37 films');
  });

  it('montre les filtres actifs en pastilles retirables, et « Tout effacer » à partir de deux', async () => {
    let removed = '';
    const chips = [{ key: 'vf', label: 'Sans VF', onRemove: () => { removed = 'vf'; } }, { key: '4k', label: '4K', onRemove: () => {} }];
    const wrapper = mount(ExploreTemplate, { props: { items: films, chips, unit: ['film', 'films'] }, slots: { item }, global });
    expect(wrapper.find('.explore__count').text()).toBe('2 films correspondent');
    await wrapper.findAll('.filter-chip')[0].trigger('click');
    expect(removed).toBe('vf');
    await wrapper.find('.explore__clear').trigger('click');
    expect(wrapper.emitted('reset')).toHaveLength(1);
  });

  it('distingue l’absence de résultat filtré du catalogue vide', async () => {
    const chips = [{ key: 'vf', label: 'Sans VF', onRemove: () => {} }];
    expect(mount(ExploreTemplate, { props: { items: [], chips }, global }).text()).toContain('Aucun élément ne correspond aux filtres actifs.');
    expect(mount(ExploreTemplate, { props: { items: [], emptyTitle: 'Bibliothèque vide' }, global }).text()).toContain('Bibliothèque vide');
  });
});

describe('UnderstandTemplate', () => {
  const now = new Date();
  const at = (daysAgo, hour) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
  const events = [
    { key: 'a', at: at(1, 9), outcome: 'success', title: 'Tenet' },
    { key: 'b', at: at(0, 4), outcome: 'failed', title: 'Anaconda', detail: 'Contrôle de durée audio' },
    { key: 'c', at: at(0, 3), outcome: 'success', title: 'Dune' },
  ];

  it('groupe par jour, du plus récent au plus ancien', async () => {
    const wrapper = mount(UnderstandTemplate, { props: { events }, global });
    expect(wrapper.findAll('.understand__day h2').map((n) => n.text())).toEqual(['Aujourd’hui', 'Hier']);
    expect(wrapper.findAll('.understand-row strong').map((n) => n.text())).toEqual(['Anaconda', 'Dune', 'Tenet']);
  });

  it('ouvre le détail sans action dans la liste, au plus une dans le détail', async () => {
    const wrapper = mount(UnderstandTemplate, { props: { events }, global });
    await wrapper.find('.understand-row').trigger('click');
    expect(wrapper.emitted('open')[0][0].key).toBe('b');
    await wrapper.setProps({
      openKey: 'b',
      detail: { title: 'Anaconda', outcome: 'failed', cause: 'Durée audio différente', steps: [{ label: 'Audio', outcome: 'success' }, { label: 'Assemblage', outcome: 'failed' }], action: { key: 'retry', label: 'Relancer' } },
    });
    expect(wrapper.find('.understand-detail').text()).toContain('Durée audio différente');
    expect(wrapper.findAll('.understand__list button.ui-button, .understand__list .ui-button')).toHaveLength(0);
    await wrapper.find('.understand-detail__links button').trigger('click');
    expect(wrapper.emitted('action')[0]).toEqual(['retry']);
  });

  it('montre le bilan seulement si la page le fournit', async () => {
    expect(mount(UnderstandTemplate, { props: { events }, global }).find('.understand__summary').exists()).toBe(false);
    const withSummary = mount(UnderstandTemplate, { props: { events, summary: [{ key: 'ok', label: 'traités', value: '142' }] }, global });
    expect(withSummary.find('.understand__summary').text()).toContain('142 traités');
  });
});

describe('ConfigureTemplate', () => {
  const sections = [
    { key: 'conn', title: 'Connexion' },
    { key: 'plex', title: 'Pendant une lecture Plex', dirty: true },
    { key: 'libs', title: 'Bibliothèques' },
  ];

  it('rend les sections par intention, signale les modifiées et propose un enregistrement global', async () => {
    const wrapper = mount(ConfigureTemplate, {
      props: { sections, dirty: true },
      slots: { 'section-plex': '<p class="plex-body">Pause</p>' },
      global,
    });
    expect(wrapper.findAll('.configure__toc-link').map((n) => n.text())).toEqual(['Connexion', 'Pendant une lecture Plexmodifié', 'Bibliothèques']);
    expect(wrapper.find('#configure-plex .plex-body').exists()).toBe(true);
    expect(wrapper.find('#configure-plex').classes()).toContain('is-dirty');
    const buttons = wrapper.findAll('.form-save-bar button');
    expect(buttons.map((b) => b.text())).toEqual(['Annuler', 'Enregistrer']);
    await buttons[1].trigger('click');
    await buttons[0].trigger('click');
    expect(wrapper.emitted('save')).toHaveLength(1);
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });

  it('cache la barre tant que rien n’est modifié', async () => {
    expect(mount(ConfigureTemplate, { props: { sections }, global }).find('.form-save-bar').exists()).toBe(false);
  });
});

describe('Blocs Configurer', () => {
  it('le test de connexion dit le résultat, et quand il est périmé', async () => {
    const ok = mount(ConfigureTest, { props: { result: { ok: true, message: 'Connecté · 4 runners' } } });
    expect(ok.text()).toContain('Connecté · 4 runners');
    const stale = mount(ConfigureTest, { props: { result: { ok: true, message: 'Connecté' }, stale: true } });
    expect(stale.text()).toContain('testez à nouveau');
  });

  it('la liste de ressources dit l’état, et remonte activer, tester, modifier', async () => {
    const usb4 = { key: 'u4', label: 'Films — USB 4', enabled: true, testable: true, state: { tone: 'error', text: 'Dossier Plex introuvable' } };
    const wrapper = mount(ResourceList, { props: { resources: [usb4, { key: 's', label: 'Séries', enabled: false }], addLabel: 'Ajouter' } });
    expect(wrapper.findAll('.resource__state').map((n) => n.text())).toEqual(['Dossier Plex introuvable', 'Désactivée']);
    const buttons = wrapper.findAll('.resource')[0].findAll('button.ui-button, .ui-button');
    await buttons.find((b) => b.text() === 'Tester').trigger('click');
    expect(wrapper.emitted('test')[0][0].key).toBe('u4');
  });
});

describe('DetailTemplate', () => {
  const actions = [
    { key: 'play', label: 'Lire dans Plex' },
    { key: 'relaunch', label: 'Relancer l’encodage' },
    { key: 'search', label: 'Chercher une VF' },
    { key: 'delete', label: 'Supprimer', danger: true },
  ];

  it('met l’action principale en avant, deux secondaires au plus, le reste dans le menu', () => {
    const wrapper = mount(DetailTemplate, { props: { title: 'Anaconda', actions }, global });
    const buttons = wrapper.findAll('.detail__actions > .ui-button');
    expect(buttons.slice(0, 3).map((b) => b.text())).toEqual(['Lire dans Plex', 'Relancer l’encodage', 'Chercher une VF']);
    expect(buttons[0].classes().join(' ')).toContain('primary');
    expect(wrapper.text()).not.toContain('Supprimer');
  });

  it('montre une seule alerte, dont le lien peut ouvrir l’onglet concerné', async () => {
    const wrapper = mount(DetailTemplate, {
      props: { title: 'Anaconda', alert: { tone: 'danger', message: 'Le dernier encodage a échoué', link: { label: 'Voir', tab: 'encoding' } }, tabs: [{ key: 'summary', label: 'Résumé' }, { key: 'encoding', label: 'Encodage' }] },
      global,
    });
    expect(wrapper.findAll('.detail__alert')).toHaveLength(1);
    await wrapper.find('.detail__alert-link').trigger('click');
    expect(wrapper.emitted('update:tab')[0]).toEqual(['encoding']);
  });

  it('rend l’onglet actif et les faits', () => {
    const wrapper = mount(DetailTemplate, {
      props: { title: 'Anaconda', tabs: [{ key: 'summary', label: 'Résumé' }, { key: 'files', label: 'Fichiers' }], tab: 'files', facts: [{ label: 'Taille', value: '8,2 Go' }] },
      slots: { 'tab-summary': '<p class="s">Résumé</p>', 'tab-files': '<p class="f">Pistes</p>' },
      global,
    });
    expect(wrapper.find('.f').exists()).toBe(true);
    expect(wrapper.find('.s').exists()).toBe(false);
    expect(wrapper.find('.detail__facts').text()).toContain('8,2 Go');
  });
});

describe('UiTabs', () => {
  it('est un tablist relié à son panneau, et remonte l’onglet choisi', async () => {
    const { default: UiTabs } = await import('@/components/ui/UiTabs.vue');
    const items = [{ key: 'sum', label: 'Résumé' }, { key: 'files', label: 'Fichiers', count: 3 }];
    const wrapper = mount(UiTabs, {
      props: { modelValue: 'sum', items, ariaLabel: 'Sections' },
      slots: { default: '<template #default="{ tab }"><p class="panel">{{ tab }}</p></template>' },
      attachTo: document.body,
    });
    expect(wrapper.find('[role="tablist"]').exists()).toBe(true);
    expect(wrapper.find('.panel').text()).toBe('sum');
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs[0].attributes('aria-selected')).toBe('true');
    await tabs[1].trigger('mousedown', { button: 0 });
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['files']);
    wrapper.unmount();
  });
});

describe('PageTemplate · recherche et filtres', () => {
  it('branche la feuille des filtres commune quand la page fournit des filtres', () => {
    const wrapper = mount(PageTemplate, {
      props: { title: 'Bibliothèque', search: { placeholder: 'Filtrer…' }, filterCount: 2 },
      slots: { filters: '<p class="group">Version</p>', default: '<p>Contenu</p>' },
      global,
    });
    expect(wrapper.findComponent({ name: 'FilterSidebar' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'FilterSidebar' }).props('activeCount')).toBe(2);
  });

  it('sans filtres ni recherche, garde la recherche globale', () => {
    const wrapper = mount(PageTemplate, { props: { title: 'Encodage' }, slots: { default: '<p>Contenu</p>' }, global });
    expect(wrapper.findComponent({ name: 'FilterSidebar' }).exists()).toBe(false);
  });
});

describe('BrowseTemplate', () => {
  const rows = [
    { kind: 'posters', key: 'recent', title: 'Derniers ajouts', items: [{ id: 1, title: 'Dune' }], moreTo: '/library?sort=added_desc' },
    { kind: 'section', key: 'sources' },
    { kind: 'collapsible', key: 'genres', title: 'Explorer par genre' },
  ];

  it('rend les rails avec la carte de la page, et le titre mène à la liste complète', () => {
    const wrapper = mount(BrowseTemplate, {
      props: { rows },
      slots: { item: '<template #item="{ item }"><article class="card">{{ item.title }}</article></template>', 'row-sources': '<p class="logos">Netflix</p>' },
      global,
    });
    expect(wrapper.find('.card').text()).toBe('Dune');
    expect(wrapper.find('a.rail-title').attributes('href')).toBe('/library?sort=added_desc');
    expect(wrapper.find('.logos').exists()).toBe(true);
  });

  it('remonte l’ouverture d’une section repliable, pour la charger à ce moment-là', async () => {
    const wrapper = mount(BrowseTemplate, { props: { rows }, slots: { 'row-genres': '<p class="g">Aventure</p>' }, global });
    await wrapper.find('.ui-disclosure button, button[aria-expanded]').trigger('click');
    expect(wrapper.emitted('open-row')?.[0]).toEqual(['genres']);
  });
});

describe('PlanTemplate', () => {
  const at = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(0, 0, 0, 0); return d.toISOString(); };
  const states = [{ key: 'available', label: 'Disponible', color: 'green' }, { key: 'upcoming', label: 'À venir', color: 'blue' }, { key: 'late', label: 'En retard', color: 'red' }];
  const events = [
    { key: 'a', date: at(0), title: 'A', state: 'upcoming' },
    { key: 'b', date: at(0), title: 'B', state: 'upcoming' },
    { key: 'c', date: at(0), title: 'C', state: 'available' },
    { key: 'd', date: at(0), title: 'D', state: 'upcoming' },
  ];

  it('légende les états présents avec leur nombre, et replie au-delà de trois par jour', async () => {
    const { default: PlanTemplate } = await import('./PlanTemplate.vue');
    const wrapper = mount(PlanTemplate, { props: { events, states, cursor: new Date(), preferenceKey: 'test.plan.month' }, global });
    await wrapper.findAll('.calendar-view-switch button').find((b) => b.text() === 'Mois')?.trigger('click');
    expect(wrapper.findAll('.calendar-legend li').map((n) => n.text().replace(/\s+/g, ' '))).toEqual(['Disponible 1', 'À venir 3']);
    expect(wrapper.find('.month-more').text()).toContain('+ 1 autre');
  });

  it('bascule en Agenda pendant une recherche, sans navigation de période', async () => {
    const { default: PlanTemplate } = await import('./PlanTemplate.vue');
    const wrapper = mount(PlanTemplate, { props: { events, states, cursor: new Date(), searching: true, searchScope: 'sur un an' }, global });
    expect(wrapper.find('.calendar-agenda').exists()).toBe(true);
    expect(wrapper.find('.calendar-navigation').exists()).toBe(false);
    expect(wrapper.find('.calendar-search-scope').text()).toBe('4 résultats sur un an');
  });
});

describe('MiniCalendar', () => {
  const at = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString(); };

  it('liste par date avec le type de sortie, et marque aujourd’hui entre passé et à venir', async () => {
    const { default: MiniCalendar } = await import('@/components/ui/MiniCalendar.vue');
    const wrapper = mount(MiniCalendar, { props: { entries: [
      { key: 's', date: at(12), title: 'Streaming', kind: 'streaming' },
      { key: 'c', date: at(-40), title: 'Cinéma', kind: 'cinema' },
    ] } });
    expect(wrapper.findAll('.mini-date__text strong').map((n) => n.text())).toEqual(['Cinéma', 'Streaming']);
    expect(wrapper.find('.mini-date.is-cinema').classes()).toContain('is-past');
    expect(wrapper.find('.mini-calendar__today').exists()).toBe(true);
    expect(wrapper.find('.mini-date.is-streaming').text()).toContain('En streaming');
  });
});

describe('ChooseTemplate', () => {
  const c = (key, score, size, rejected) => ({ key, title: `Release ${key}`, badges: [{ label: 'VF' }], facts: [`${size} Go`], metrics: { score, size }, rejected });
  const sorts = [{ key: 'score', label: 'Score' }, { key: 'size', label: 'Taille', direction: 'asc' }];

  it('garde les rejetées à leur place dans le tri, et recommande la meilleure non rejetée', async () => {
    const { default: ChooseTemplate } = await import('./ChooseTemplate.vue');
    const wrapper = mount(ChooseTemplate, { props: { candidates: [c('a', 10, 5), c('b', 30, 1, 'CAM refusée'), c('c', 20, 9)], sorts }, global });
    expect(wrapper.findAll('.choose-card__title').map((n) => n.text())).toEqual(['Release b', 'Release c', 'Release a']);
    expect(wrapper.find('.choose-card.is-recommended .choose-card__title').text()).toBe('Release c');
    expect(wrapper.find('.choose-card.is-rejected').text()).toContain('Rejetée : CAM refusée');
  });

  it('masque les rejets seulement à la demande', async () => {
    const { default: ChooseTemplate } = await import('./ChooseTemplate.vue');
    const wrapper = mount(ChooseTemplate, { props: { candidates: [c('a', 10, 5), c('b', 30, 1, 'CAM')], sorts }, global });
    expect(wrapper.findAll('.choose-card')).toHaveLength(2);
    await wrapper.find('.ui-checkbox, [role="checkbox"], input[type="checkbox"]').trigger('click');
    expect(wrapper.findAll('.choose-card')).toHaveLength(1);
  });

  it('remonte le choix d’un candidat accepté sans confirmation', async () => {
    const { default: ChooseTemplate } = await import('./ChooseTemplate.vue');
    const wrapper = mount(ChooseTemplate, { props: { candidates: [c('a', 10, 5)] }, global });
    await wrapper.find('.choose-card button').trigger('click');
    expect(wrapper.emitted('choose')[0][1]).toBe(false);
  });
});

describe('CreateTemplate', () => {
  const definition = {
    noun: 'un service',
    another: 'un autre service',
    initial: () => ({ type: 'prowlarr', name: '' }),
    steps: [
      { key: 'service', label: 'Service', title: 'Quel service ?', fields: [{ key: 'type', type: 'cards', label: 'Service', options: [{ value: 'radarr', label: 'Radarr' }, { value: 'prowlarr', label: 'Prowlarr' }] }] },
      { key: 'connection', label: 'Connexion', title: 'Où ?', fields: [{ key: 'name', type: 'text', label: 'Nom', required: true }] },
      { key: 'settings', label: 'Réglages', title: 'Réglages', when: (v) => v.type === 'radarr', fields: [] },
    ],
    submit: async (v) => ({ message: `${v.name} branché` }),
  };
  const text = () => document.body.textContent;
  const button = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label);

  it('adapte les étapes au contexte, valide avant de continuer, puis crée', async () => {
    const { default: CreateTemplate } = await import('./CreateTemplate.vue');
    const wrapper = mount(CreateTemplate, { props: { open: true, definition }, attachTo: document.body, global });
    await flushPromises();
    // Prowlarr : pas d'étape Réglages.
    expect(text()).toContain('Récapitulatif');
    expect(text()).not.toContain('Réglages');
    button('Continuer').click(); await flushPromises();
    button('Continuer').click(); await flushPromises();
    expect(text()).toContain('Ce champ est requis.');
    const input = document.querySelector('.create-modal input');
    input.value = 'Prowlarr'; input.dispatchEvent(new Event('input')); await flushPromises();
    expect(text()).not.toContain('Ce champ est requis.');
    button('Continuer').click(); await flushPromises();
    expect(text()).toContain('Tout est prêt ?');
    button('Créer').click(); await flushPromises();
    expect(text()).toContain('Prowlarr branché');
    expect(wrapper.emitted('created')).toHaveLength(1);
    wrapper.unmount();
  });
});

describe('AnalyzeTemplate', () => {
  const leads = Array.from({ length: 7 }, (_, i) => ({ key: `l${i}`, text: `Constat ${i}` }));

  it('montre cinq pistes puis « Voir toutes », et remonte la piste ouverte', async () => {
    const { default: AnalyzeTemplate } = await import('./AnalyzeTemplate.vue');
    const wrapper = mount(AnalyzeTemplate, { props: { period: '30d', leads }, global });
    expect(wrapper.findAll('.analyze-lead')).toHaveLength(5);
    await wrapper.find('.analyze__more').trigger('click');
    expect(wrapper.findAll('.analyze-lead')).toHaveLength(7);
    await wrapper.find('.analyze-lead').trigger('click');
    expect(wrapper.emitted('drill')[0][0]).toMatchObject({ key: 'l0', title: 'Constat 0' });
  });

  it('compare à la période précédente, sauf sur « Tout », et colore selon le bon sens', async () => {
    const { default: AnalyzeTemplate } = await import('./AnalyzeTemplate.vue');
    const kpis = [{ key: 'novf', label: 'Sans VF', value: '312', change: -6, better: 'down' }];
    const month = mount(AnalyzeTemplate, { props: { period: '30d', kpis }, global });
    expect(month.find('.metric-trend').classes()).toContain('up');
    expect(month.find('.analyze__compare').text()).toContain('Comparé aux 30 jours précédents');
    const all = mount(AnalyzeTemplate, { props: { period: 'all', kpis }, global });
    expect(all.find('.metric-trend').exists()).toBe(false);
  });

  it('ouvre la liste concernée avec Explorer, et Traiter quand il y a à corriger', async () => {
    const { default: AnalyzeTemplate } = await import('./AnalyzeTemplate.vue');
    const wrapper = mount(AnalyzeTemplate, {
      props: { period: '30d', drill: { key: 'novf', title: 'Films sans VF', exploreTo: '/library?vf=vo', handleTo: '/vf-upgrades' } },
      slots: { drill: '<p class="rows">Dune</p>' },
      global,
    });
    expect(wrapper.find('.analyze__drill .rows').exists()).toBe(true);
    expect(wrapper.findAll('.analyze__drill footer a').map((a) => a.text())).toEqual(['Ouvrir dans Explorer', 'Traiter']);
  });
});
