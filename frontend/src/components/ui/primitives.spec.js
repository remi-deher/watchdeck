import { mount } from '@vue/test-utils';
import { h } from 'vue';
import { describe, expect, it } from 'vitest';

import LoadMore from './LoadMore.vue';
import MetricCard from './MetricCard.vue';
import MetricGrid from './MetricGrid.vue';
import PanelCard from './PanelCard.vue';
import TabNav from './TabNav.vue';
import ToggleSwitch from './ToggleSwitch.vue';
import UiButton from './UiButton.vue';
import UiEmptyState from './UiEmptyState.vue';
import UiBadge from './UiBadge.vue';
import StatusBadge from './StatusBadge.vue';
import UiField from './UiField.vue';
import UiSectionHeader from './UiSectionHeader.vue';
import UiToolbar from './UiToolbar.vue';
import UiCheckboxField from './UiCheckboxField.vue';
import UiSegmentedControl from './UiSegmentedControl.vue';
import BulkActionBar from './BulkActionBar.vue';

const RouterLinkStub = {
  props: ['to'],
  setup(props, { slots }) {
    return () => h('a', { href: typeof props.to === 'string' ? props.to : '#' }, slots.default?.());
  },
};
const global = { stubs: { RouterLink: RouterLinkStub } };
const Icon = { setup: () => () => h('svg') };

describe('UiButton', () => {
  it('applique la variante et transmet le clic', async () => {
    const wrapper = mount(UiButton, { props: { variant: 'primary' }, slots: { default: 'Enregistrer' } });
    expect(wrapper.find('button').classes()).toContain('ui-button--primary');
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('désactive le bouton et affiche un indicateur pendant le chargement', () => {
    const wrapper = mount(UiButton, { props: { loading: true }, slots: { default: 'Enregistrer' } });
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
    expect(wrapper.find('button').attributes('aria-busy')).toBe('true');
    expect(wrapper.find('.ui-button-spinner').exists()).toBe(true);
  });
});

describe('BulkActionBar', () => {
  it('reste masquée sans sélection', () => {
    const wrapper = mount(BulkActionBar, { props: { count: 0 } });
    expect(wrapper.find('[role="toolbar"]').exists()).toBe(false);
  });

  it('affiche le compte, les actions et permet de vider la sélection', async () => {
    const wrapper = mount(BulkActionBar, {
      props: { count: 2, singular: 'utilisateur sélectionné', plural: 'utilisateurs sélectionnés' },
      slots: { default: '<button class="bulk-action">Activer</button>' },
    });
    expect(wrapper.attributes('role')).toBe('toolbar');
    expect(wrapper.find('.bulk-action-count').text()).toBe('2 utilisateurs sélectionnés');
    expect(wrapper.find('.bulk-action').text()).toBe('Activer');
    await wrapper.find('.ui-button').trigger('click');
    expect(wrapper.emitted('clear')).toHaveLength(1);
  });
});

describe('UiButton links', () => {
  it('devient un lien de navigation et bloque un lien désactivé', async () => {
    const link = mount(UiButton, { props: { to: '/downloads' }, slots: { default: 'Téléchargements' }, global });
    expect(link.findComponent(RouterLinkStub).props('to')).toBe('/downloads');

    const disabled = mount(UiButton, { props: { href: '/admin', disabled: true }, slots: { default: 'Admin' } });
    expect(disabled.find('a').attributes('aria-disabled')).toBe('true');
    await disabled.find('a').trigger('click');
    expect(disabled.emitted('click')).toBeUndefined();
  });
});

describe('UiCheckboxField', () => {
  it('associe le libellé et l’aide puis émet la nouvelle valeur', async () => {
    const wrapper = mount(UiCheckboxField, { props: { modelValue: false, label: 'Notifications', hint: 'Recevoir un résumé.' } });
    const input = wrapper.find('input');
    expect(wrapper.find('label').attributes('for')).toBe(input.attributes('id'));
    expect(input.attributes('aria-describedby')).toBe(wrapper.find('.ui-checkbox-hint').attributes('id'));
    await input.setValue(true);
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
  });
});

describe('UiSegmentedControl', () => {
  it('expose la sélection et émet le nouvel onglet', async () => {
    const wrapper = mount(UiSegmentedControl, { props: {
      modelValue: 'week', ariaLabel: 'Période',
      options: [{ value: 'week', label: 'Semaine' }, { value: 'month', label: 'Mois', count: 3 }],
    } });
    expect(wrapper.findAll('[role="tab"]')[0].attributes('aria-selected')).toBe('true');
    await wrapper.findAll('button')[1].trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['month']]);
  });
});

describe('UiEmptyState', () => {
  it('rend un message accessible et une action optionnelle', () => {
    const wrapper = mount(UiEmptyState, {
      props: { title: 'Aucun résultat', message: 'Modifiez les filtres.' },
      slots: { action: '<button>Réinitialiser</button>' },
    });
    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.find('strong').text()).toBe('Aucun résultat');
    expect(wrapper.find('p').text()).toBe('Modifiez les filtres.');
    expect(wrapper.find('button').text()).toBe('Réinitialiser');
  });
});

describe('UiBadge', () => {
  it('applique le ton demandé sans connaître le statut métier', () => {
    const wrapper = mount(UiBadge, { props: { tone: 'warning', dot: true }, slots: { default: 'Attention' } });
    expect(wrapper.classes()).toContain('is-warning');
    expect(wrapper.find('.ui-status-dot').exists()).toBe(true);
    expect(wrapper.text()).toBe('Attention');
  });
});

describe('StatusBadge', () => {
  it('traduit un statut métier vers UiBadge', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'blocked' } });
    expect(wrapper.find('.ui-badge').classes()).toContain('is-danger');
    expect(wrapper.text()).toBe('Bloqué');
  });
});

describe('UiField', () => {
  it('associe le libellé, le champ et le texte d’aide', () => {
    const wrapper = mount(UiField, {
      props: { label: 'Adresse', hint: 'Adresse locale du serveur.' },
      slots: {
        default: ({ id, describedBy }) => h('input', { id, 'aria-describedby': describedBy }),
      },
    });
    const input = wrapper.find('input');
    expect(wrapper.find('label').attributes('for')).toBe(input.attributes('id'));
    expect(input.attributes('aria-describedby')).toBe(wrapper.find('.ui-field-hint').attributes('id'));
  });

  it('priorise une erreur accessible sur le texte d’aide', () => {
    const wrapper = mount(UiField, {
      props: { label: 'Email', hint: 'Adresse de contact.', error: 'Adresse invalide.' },
      slots: { default: ({ id, describedBy, invalid }) => h('input', { id, 'aria-describedby': describedBy, 'aria-invalid': invalid }) },
    });
    expect(wrapper.find('.ui-field-hint').exists()).toBe(false);
    expect(wrapper.find('.ui-field-error').attributes('role')).toBe('alert');
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true');
  });
});

describe('UiSectionHeader', () => {
  it('structure le titre, la description, les métadonnées et les actions', () => {
    const wrapper = mount(UiSectionHeader, {
      props: { eyebrow: 'Activité', title: 'Dernières lectures', description: 'Sur 30 jours' },
      slots: { meta: '<small>12 résultats</small>', actions: '<button>Filtrer</button>' },
    });
    expect(wrapper.find('h2').text()).toBe('Dernières lectures');
    expect(wrapper.find('p').text()).toBe('Sur 30 jours');
    expect(wrapper.find('.ui-section-meta').text()).toBe('12 résultats');
    expect(wrapper.find('.ui-section-actions button').text()).toBe('Filtrer');
  });
});

describe('UiToolbar', () => {
  it('expose son rôle, son libellé et son alignement', () => {
    const wrapper = mount(UiToolbar, {
      props: { align: 'end', role: 'group', ariaLabel: 'Actions' },
      slots: { default: '<button>Enregistrer</button>' },
    });
    expect(wrapper.attributes('role')).toBe('group');
    expect(wrapper.attributes('aria-label')).toBe('Actions');
    expect(wrapper.classes()).toContain('ui-toolbar--end');
  });

  it('permet un empilement explicite des actions sur mobile', () => {
    const wrapper = mount(UiToolbar, { props: { mobileStack: true } });
    expect(wrapper.classes()).toContain('ui-toolbar--mobile-stack');
  });
});

describe('MetricCard', () => {
  // Deux markups existaient : à plat (Bibliothèque, Téléchargements) et avec icône
  // enveloppant le texte dans un div (Tableau de bord, Activité). La CSS des grilles
  // parentes cible ces structures précises, donc le composant doit les reproduire.
  it('rend la forme à plat sans icône', () => {
    const wrapper = mount(MetricCard, { props: { label: 'En VF', value: 42, detail: '3 ajoutés' }, global });
    const card = wrapper.find('article.metric-card');
    // Forme à plat : les trois éléments sont enfants directs de la carte, sans div.
    expect(card.find('div').exists()).toBe(false);
    expect(card.find('span').text()).toBe('En VF');
    expect(card.find('strong').text()).toBe('42');
    expect(card.find('small').text()).toBe('3 ajoutés');
  });

  it('enveloppe le texte dans un div quand une icône est fournie', () => {
    const wrapper = mount(MetricCard, { props: { label: 'Bloqués', value: 2, icon: Icon }, global });
    const card = wrapper.find('article.metric-card');
    expect(card.find('svg.metric-icon').exists()).toBe(true);
    const inner = card.find('div');
    expect(inner.exists()).toBe(true);
    expect(inner.find('span').text()).toBe('Bloqués');
    expect(inner.find('strong').text()).toBe('2');
  });

  it('omet le détail quand il est vide, et affiche une valeur de repli', () => {
    const wrapper = mount(MetricCard, { props: { label: 'X' }, global });
    expect(wrapper.find('small').exists()).toBe(false);
    expect(wrapper.find('strong').text()).toBe('—');
  });

  it('devient un lien quand `to` est fourni', () => {
    const wrapper = mount(MetricCard, { props: { label: 'À approuver', value: 3, to: '/library' }, global });
    expect(wrapper.find('article').exists()).toBe(false);
    const link = wrapper.find('a');
    expect(link.attributes('href')).toBe('/library');
    expect(link.classes()).toEqual(expect.arrayContaining(['metric-card', 'metric-card-link']));
  });

  it('affiche un badge de tendance', () => {
    const wrapper = mount(MetricCard, {
      props: { label: 'Sessions', value: 120, trend: { direction: 'up', label: '+15%' } },
      global,
    });
    const trend = wrapper.find('.metric-trend');
    expect(trend.exists()).toBe(true);
    expect(trend.classes()).toContain('up');
    expect(trend.text()).toBe('+15%');
  });

  it('affiche une jauge de progression', () => {
    const wrapper = mount(MetricCard, {
      props: { label: 'Quota', value: '60 Go', progress: { value: 60, max: 100 } },
      global,
    });
    const progress = wrapper.find('.metric-progress-bar');
    expect(progress.exists()).toBe(true);
    expect(progress.attributes('style')).toContain('width: 60%');
  });

  it('affiche un placeholder quand loading est vrai', () => {
    const wrapper = mount(MetricCard, {
      props: { label: 'Actifs', loading: true },
      global,
    });
    expect(wrapper.find('.metric-skeleton-value').exists()).toBe(true);
  });
});


describe('MetricGrid', () => {
  it('porte la classe de variante et expose son libellé accessible', () => {
    const wrapper = mount(MetricGrid, {
      props: { gridClass: 'dashboard-metrics', ariaLabel: 'Résumé' },
      slots: { default: '<article/>' },
    });
    const grid = wrapper.find('section.metric-grid');
    expect(grid.classes()).toContain('dashboard-metrics');
    expect(grid.classes()).toContain('shared-metric-grid');
    expect(grid.attributes('aria-label')).toBe('Résumé');
  });
});

describe('PanelCard', () => {
  it('rend le markup attendu par la CSS globale', () => {
    const wrapper = mount(PanelCard, {
      props: { title: 'Utilisateurs actifs', eyebrow: 'Usage', description: 'Sur 30 jours' },
      slots: { default: '<p class="body">x</p>', action: '<a>Gérer</a>' },
    });
    const panel = wrapper.find('section.panel');
    expect(panel.classes()).toContain('panel-card');
    const head = panel.find('.panel-head');
    expect(head.find('.eyebrow').text()).toBe('Usage');
    expect(head.find('h2').text()).toBe('Utilisateurs actifs');
    expect(head.find('p').text()).toBe('Sur 30 jours');
    expect(head.find('a').text()).toBe('Gérer');
    expect(panel.find('.body').exists()).toBe(true);
  });

  it('omet entièrement l’en-tête quand il n’y a rien à y mettre', () => {
    const wrapper = mount(PanelCard, { slots: { default: '<p/>' } });
    expect(wrapper.find('.panel-head').exists()).toBe(false);
  });

  // `empty` est une chaîne : le parent passe le message, pas un booléen.
  it('n’affiche l’état vide que si un message est fourni', () => {
    expect(mount(PanelCard, { props: { title: 'T' } }).find('.empty').exists()).toBe(false);
    const filled = mount(PanelCard, { props: { title: 'T', empty: 'Aucune activité.' } });
    expect(filled.find('.empty').text()).toBe('Aucune activité.');
  });
  it('priorise le chargement et l erreur sur le contenu', async () => {
    const wrapper = mount(PanelCard, {
      props: { title: 'T', loading: true, loadingMessage: 'Mise a jour...' },
      slots: { default: '<p class="body">contenu</p>' },
    });
    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(wrapper.find('.ui-feedback').text()).toContain('Mise a jour');
    expect(wrapper.find('.body').exists()).toBe(false);

    await wrapper.setProps({ loading: false, error: 'Service indisponible', retry: true });
    expect(wrapper.attributes('aria-busy')).toBeUndefined();
    expect(wrapper.find('[role="alert"]').text()).toContain('Service indisponible');
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });
});

describe('TabNav', () => {
  const tabs = [
    { value: 'queue', label: 'File active', count: 3, badgeClass: 'error-badge' },
    { value: 'history', label: 'Historique' },
  ];

  it('marque l’onglet courant et expose les rôles ARIA', () => {
    const wrapper = mount(TabNav, { props: { tabs, modelValue: 'queue', ariaLabel: 'Téléchargements' } });
    expect(wrapper.find('nav.detail-tabs').attributes('aria-label')).toBe('Téléchargements');
    expect(wrapper.find('nav').attributes('role')).toBe('tablist');
    const [active, other] = wrapper.findAll('button[role="tab"]');
    expect(active.attributes('aria-selected')).toBe('true');
    expect(active.classes()).toContain('active');
    expect(other.attributes('aria-selected')).toBe('false');
  });

  it('affiche le compteur seulement là où il y en a un', () => {
    const wrapper = mount(TabNav, { props: { tabs, modelValue: 'queue' } });
    const badges = wrapper.findAll('.tab-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0].text()).toBe('3');
    expect(badges[0].classes()).toContain('error-badge');
  });

  it('émet la nouvelle valeur au clic', async () => {
    const wrapper = mount(TabNav, { props: { tabs, modelValue: 'queue' } });
    await wrapper.findAll('button')[1].trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['history']]);
  });
});

describe('LoadMore', () => {
  it('ne s’affiche que s’il reste des pages', () => {
    expect(mount(LoadMore, { props: { hasMore: false } }).find('button').exists()).toBe(false);
    expect(mount(LoadMore, { props: { hasMore: true } }).find('button').exists()).toBe(true);
  });

  it('désactive le bouton et change le libellé pendant le chargement', () => {
    const wrapper = mount(LoadMore, { props: { hasMore: true, loading: true, loadingLabel: 'Chargement…' } });
    const button = wrapper.find('button');
    expect(button.attributes('disabled')).toBeDefined();
    expect(button.text()).toBe('Chargement…');
    expect(wrapper.find('.ui-button-spinner').exists()).toBe(true);
  });

  it('émet load au clic', async () => {
    const wrapper = mount(LoadMore, { props: { hasMore: true, label: 'Charger plus de médias' } });
    expect(wrapper.find('button').text()).toBe('Charger plus de médias');
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('load')).toHaveLength(1);
  });
});

describe('ToggleSwitch', () => {
  it('expose un interrupteur accessible reflétant son état', () => {
    const wrapper = mount(ToggleSwitch, { props: { modelValue: true, label: 'Réactiver' } });
    const input = wrapper.find('input');
    expect(input.attributes('role')).toBe('switch');
    expect(input.attributes('aria-checked')).toBe('true');
    expect(input.element.checked).toBe(true);
    expect(wrapper.find('label').classes()).toContain('is-on');
    // Le libellé est du vrai texte, pas un `content:` CSS : lisible par un lecteur d'écran.
    expect(wrapper.find('.ui-switch-label').text()).toBe('Réactiver');
    expect(input.attributes('aria-label')).toBe('Réactiver');
  });

  it('émet la nouvelle valeur au changement', async () => {
    const wrapper = mount(ToggleSwitch, { props: { modelValue: false } });
    await wrapper.find('input').setValue(true);
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
  });

  it('se laisse désactiver pendant une écriture en cours', () => {
    const wrapper = mount(ToggleSwitch, { props: { modelValue: false, disabled: true } });
    expect(wrapper.find('input').attributes('disabled')).toBeDefined();
  });
});
