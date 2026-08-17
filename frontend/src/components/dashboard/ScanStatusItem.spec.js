import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ScanStatusItem from './ScanStatusItem.vue';

describe('ScanStatusItem', () => {
  it('normalise le statut, la progression et l action', async () => {
    const wrapper = mount(ScanStatusItem, {
      props: { title: 'Synchronisation', subtitle: '4 / 10 items', status: 'running', actionLabel: 'Sync', progress: 40 },
    });
    expect(wrapper.get('.badge').text()).toBe('En cours');
    expect(wrapper.get('.progress-bar').attributes('style')).toContain('40%');
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();

    await wrapper.setProps({ status: 'idle' });
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('action')).toHaveLength(1);
  });
});
