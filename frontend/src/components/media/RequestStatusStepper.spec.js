import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import RequestStatusStepper from './RequestStatusStepper.vue';

it('affiche le parcours serveur sans déduire Plex du statut historique', () => {
  const wrapper = mount(RequestStatusStepper, { props: { row: {
    status: 'available', operational_status: 'completed', journey: { steps: [
      { key: 'import', label: 'Import terminé', state: 'completed', occurred_at: null },
      { key: 'plex', label: 'Confirmation Plex attendue', state: 'current', occurred_at: null },
    ] },
  } } });
  expect(wrapper.findAll('.journey-step')).toHaveLength(2);
  expect(wrapper.find('.is-current').text()).toContain('Confirmation Plex attendue');
  expect(wrapper.find('.is-current').attributes('aria-current')).toBe('step');
  expect(wrapper.findAll('time')).toHaveLength(0);
});
