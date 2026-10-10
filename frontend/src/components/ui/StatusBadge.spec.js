import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import StatusBadge from './StatusBadge.vue';

it('lit le travail entier, son état et sa cause', () => {
  const wrapper = mount(StatusBadge, { props: {
    status: 'completed',
    work: { key: 'task:watchlist', source: 'task', state: 'blocked', label: 'À traiter', stage: null,
      progress: { percent: null, scope: 'execution', label: 'Exécution' }, reason: 'Connexion perdue', stale: false },
  } });
  expect(wrapper.text()).toBe('À traiter');
  expect(wrapper.attributes('title')).toBe('Connexion perdue');
  expect(wrapper.classes().join(' ')).toContain('danger');
});
