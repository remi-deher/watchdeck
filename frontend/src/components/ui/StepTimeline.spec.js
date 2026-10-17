import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import StepTimeline from './StepTimeline.vue';

const STEPS = [
  { key: 'a', label: 'Demandée', state: 'done', at: '2026-01-02T10:00:00Z' },
  { key: 'b', label: 'Importée', state: 'current' },
  { key: 'c', label: 'Dans Plex', state: 'upcoming', note: 'Bientôt', noteTone: 'attention' },
];

describe('StepTimeline', () => {
  it('marque l’étape en cours et n’invente aucune date', () => {
    const wrapper = mount(StepTimeline, { props: { steps: STEPS, formatAt: () => 'formatée' } });
    expect(wrapper.findAll('.step-timeline__step')).toHaveLength(3);
    expect(wrapper.find('.is-current').attributes('aria-current')).toBe('step');
    expect(wrapper.findAll('time')).toHaveLength(1);
    expect(wrapper.get('time').text()).toBe('formatée');
    expect(wrapper.get('.step-timeline__meta.is-attention').text()).toBe('Bientôt');
  });

  it('colore le rail jusqu’à la dernière étape franchie ou en cours', () => {
    const wrapper = mount(StepTimeline, { props: { steps: STEPS } });
    expect(wrapper.get('.step-timeline__list').attributes('style')).toContain('--step-progress: 0.5');
  });

  it('laisse l’emplacement meta remplacer la date', () => {
    const wrapper = mount(StepTimeline, { props: { steps: STEPS }, slots: { meta: '<small class="custom">x</small>' } });
    expect(wrapper.findAll('.custom')).toHaveLength(3);
    expect(wrapper.find('time').exists()).toBe(false);
  });
});
