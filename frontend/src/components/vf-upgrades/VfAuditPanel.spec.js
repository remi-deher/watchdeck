import { expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import VfAuditPanel from './VfAuditPanel.vue';

vi.mock('@/composables/useMediaOverlay', () => ({ useOuvrirFiche: () => ({ auClic: vi.fn() }) }));

it('montre les conséquences du problème entier et les images du média audité', () => {
  const wrapper = mount(VfAuditPanel, {
    props: { loading: false, fixingAll: false, items: [{ id: 7, title: 'Série', media_type: 'movie',
      poster_url: '/poster.jpg', backdrop_url: '/fanart.jpg', has_vf: true, issues: ['partial_vf'],
      problems: [{ key: 'vf_audit:7:partial_vf', source: 'vf_audit', kind: 'partial_vf', label: 'VF partielle',
        consequence: 'Certains épisodes sans VF', proposal: 'Chercher une version VF', fixable: false, actions: [] }] }] },
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, VfUpgradeButton: true, SeasonEpisodeList: true } },
  });
  expect(wrapper.find('img').attributes('src')).toContain('poster.jpg');
  expect(wrapper.find('.audit-card__backdrop').attributes('style')).toContain('fanart.jpg');
  expect(wrapper.text()).toContain('Certains épisodes sans VF');
  expect(wrapper.text()).toContain('Chercher une version VF');
  expect(wrapper.text()).not.toContain('Aligner sur Plex');
});
