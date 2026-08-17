import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { useBodyScrollLock } from './useBodyScrollLock';

function render(open) {
  const component = defineComponent({
    setup() {
      useBodyScrollLock(open);
      return () => h('div');
    },
  });
  return mount(component);
}

describe('useBodyScrollLock', () => {
  afterEach(() => document.body.classList.remove('modal-open'));

  it('suit l’état d’ouverture', async () => {
    const open = ref(false);
    const wrapper = render(open);
    expect(document.body.classList.contains('modal-open')).toBe(false);
    open.value = true;
    await wrapper.vm.$nextTick();
    expect(document.body.classList.contains('modal-open')).toBe(true);
    wrapper.unmount();
  });

  it('conserve le verrou tant qu’une autre surface est ouverte', () => {
    const first = render(ref(true));
    const second = render(ref(true));
    first.unmount();
    expect(document.body.classList.contains('modal-open')).toBe(true);
    second.unmount();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });
});
