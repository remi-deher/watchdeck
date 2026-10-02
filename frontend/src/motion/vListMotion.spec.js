import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref, withDirectives } from 'vue';
import { mount } from '@vue/test-utils';

const disable = vi.fn();
const enable = vi.fn();
vi.mock('@formkit/auto-animate', () => ({ default: vi.fn(() => ({ disable, enable, destroy: vi.fn() })) }));
// Le fichier de preparation l'a deja charge avec la vraie bibliotheque : on le recharge.
vi.resetModules();
const { vListMotion } = await import('./vListMotion');

describe('v-list-motion', () => {
  it('anime les listes courtes et renonce au-dela de soixante elements', async () => {
    const n = ref(5);
    mount(defineComponent({
      setup: () => () => withDirectives(h('ul', Array.from({ length: n.value }, (_, i) => h('li', { key: i }, i))), [[vListMotion]]),
    }));
    expect(enable).toHaveBeenLastCalledWith();
    n.value = 120;
    await nextTick();
    expect(disable).toHaveBeenCalled();
  });
});
