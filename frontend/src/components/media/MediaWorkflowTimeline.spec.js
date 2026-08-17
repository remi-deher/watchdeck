import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MediaWorkflowTimeline from './MediaWorkflowTimeline.vue';

function makeEvent(overrides = {}) {
  return {
    kind: 'file_replaced',
    label: 'Fichier mis a jour par *ARR',
    state: 'completed',
    occurred_at: '2026-08-01T10:00:00Z',
    ...overrides,
  };
}

function mountTimeline(history) {
  return mount(MediaWorkflowTimeline, {
    props: { steps: [{ key: 'available', label: 'Disponible', state: 'completed' }], history },
  });
}

describe('MediaWorkflowTimeline - historique', () => {
  it('fusionne les evenements consecutifs identiques avec un compteur', () => {
    const history = [makeEvent(), makeEvent(), makeEvent()];
    const wrapper = mountTimeline(history);
    const items = wrapper.findAll('.workflow-history li');
    expect(items).toHaveLength(1);
    expect(items[0].text()).toContain('x3');
  });

  it('ne fusionne pas des evenements de nature differente meme consecutifs', () => {
    const history = [
      makeEvent({ kind: 'vf_upgrade', label: 'VF verifiee' }),
      makeEvent({ kind: 'file_replaced' }),
    ];
    const wrapper = mountTimeline(history);
    expect(wrapper.findAll('.workflow-history li')).toHaveLength(2);
  });

  it('ne fusionne pas des evenements identiques non consecutifs', () => {
    const history = [
      makeEvent(),
      makeEvent({ kind: 'vf_upgrade', label: 'VF verifiee' }),
      makeEvent(),
    ];
    const wrapper = mountTimeline(history);
    expect(wrapper.findAll('.workflow-history li')).toHaveLength(3);
  });

  it('limite l affichage a 5 evenements apres fusion, avec bouton pour deplier', async () => {
    const history = Array.from({ length: 8 }, (_, i) => makeEvent({
      kind: 'vf_upgrade',
      label: `Evenement ${i}`,
      occurred_at: `2026-08-0${(i % 9) + 1}T10:00:00Z`,
    }));
    const wrapper = mountTimeline(history);
    expect(wrapper.findAll('.workflow-history li')).toHaveLength(5);
    const toggle = wrapper.get('.workflow-history-toggle');
    expect(toggle.text()).toContain('3');

    await toggle.trigger('click');
    expect(wrapper.findAll('.workflow-history li')).toHaveLength(8);
    expect(wrapper.get('.workflow-history-toggle').text()).toContain('Reduire');
  });

  it('n affiche pas le bouton de repli si 5 evenements ou moins', () => {
    const history = [makeEvent(), makeEvent({ label: 'Autre' })];
    const wrapper = mountTimeline(history);
    expect(wrapper.find('.workflow-history-toggle').exists()).toBe(false);
  });
});
