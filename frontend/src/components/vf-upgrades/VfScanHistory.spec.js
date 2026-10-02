import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import VfScanHistory from './VfScanHistory.vue';

const formatDate = value => `date:${value}`;
const formatDuration = () => '2 min';
const statusLabel = value => `status:${value}`;

describe('VfScanHistory', () => {
  it('affiche la progression et demande l’ouverture du cycle', async () => {
    const run = { id: 7, status: 'completed', started_at: 'start', finished_at: 'end', trigger: 'manual', tasks_scanned: 2, tasks_total: 3, suggestions_found: 1, tasks_errored: 0 };
    const wrapper = mount(VfScanHistory, {
      props: {
        liveScan: { status: 'running', items_scanned: 2, total_items: 4 },
        runs: [run],
        formatDate,
        formatDuration,
        statusLabel,
      },
    });

    expect(wrapper.find('.scan-live-bar-fill').attributes('style')).toContain('50%');
    expect(wrapper.text()).toContain('Manuel');
    await wrapper.find('.run-row').trigger('click');
    expect(wrapper.emitted('toggle')?.[0]).toEqual([run]);
  });

  it('rend le détail du cycle développé', () => {
    const wrapper = mount(VfScanHistory, {
      props: {
        runs: [{ id: 7, status: 'completed', trigger: 'selection', tasks_scanned: 1, tasks_total: 1, suggestions_found: 1 }],
        expandedRunId: 7,
        items: [{ id: 1, title: 'Film test', status: 'found', release_count: 2 }],
        formatDate,
        formatDuration,
        statusLabel,
      },
    });

    expect(wrapper.text()).toContain('Sélection manuelle');
    expect(wrapper.text()).toContain('Film test');
    expect(wrapper.text()).toContain('2 releases');
  });
});
