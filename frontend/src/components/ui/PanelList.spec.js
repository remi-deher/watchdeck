import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PanelList from './PanelList.vue';

describe('PanelList', () => {
  it('rend une liste accessible avec une cle configurable', () => {
    const wrapper = mount(PanelList, {
      props: { items: [{ code: 'a', label: 'Alpha' }, { code: 'b', label: 'Beta' }], itemKey: 'code' },
      slots: { default: '<template #default="{ item }"><strong>{{ item.label }}</strong></template>' },
    });
    expect(wrapper.attributes('role')).toBe('list');
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(2);
    expect(wrapper.text()).toContain('Alpha');
    expect(wrapper.text()).toContain('Beta');
  });
});
