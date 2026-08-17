import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AcquisitionPipelinePanel from './AcquisitionPipelinePanel.vue';

const RouterLink = {
  props: ['to'],
  template: '<a :href="typeof to === \'string\' ? to : JSON.stringify(to)"><slot /></a>',
};

describe('AcquisitionPipelinePanel', () => {
  it('rend les compteurs et étapes du pipeline', () => {
    const wrapper = mount(AcquisitionPipelinePanel, {
      props: {
        pendingCount: 2,
        downloadingCount: 5,
        importPendingCount: 1,
        availableCount: 142,
        blockedCount: 0,
      },
      global: { stubs: { RouterLink } },
    });

    expect(wrapper.text()).toContain('À approuver');
    expect(wrapper.text()).toContain('2');
    expect(wrapper.text()).toContain('En téléchargement');
    expect(wrapper.text()).toContain('5');
    expect(wrapper.text()).toContain('À importer');
    expect(wrapper.text()).toContain('1');
    expect(wrapper.text()).toContain('Disponibles');
    expect(wrapper.text()).toContain('142');
    expect(wrapper.text()).toContain('0 bloqué');
  });

  it('affiche l’alerte rouge en cas d’anomalie', () => {
    const wrapper = mount(AcquisitionPipelinePanel, {
      props: {
        blockedCount: 3,
      },
      global: { stubs: { RouterLink } },
    });

    const alert = wrapper.find('.pipeline-alert.is-danger');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('3 bloqués');
  });
});
