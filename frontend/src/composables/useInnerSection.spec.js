import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { useInnerSection } from './useInnerSection';

function setup(path) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] });
  let section;
  const Probe = defineComponent({ setup() { section = useInnerSection(['a', 'b']); return () => h('i'); } });
  return { router, mountIt: async () => { await router.push(path); await router.isReady(); mount(Probe, { global: { plugins: [router] } }); return section; } };
}

describe('useInnerSection', () => {
  it('lit la section dans l’adresse, et retombe sur la première si elle est inconnue', async () => {
    expect((await setup('/x?section=b').mountIt()).value).toBe('b');
    expect((await setup('/x?section=zz').mountIt()).value).toBe('a');
  });

  it('écrit la section dans l’adresse en gardant le reste', async () => {
    const { router, mountIt } = setup('/x?q=1');
    const section = await mountIt();
    section.value = 'b';
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ q: '1', section: 'b' });
  });
});
