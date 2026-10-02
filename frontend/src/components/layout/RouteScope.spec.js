import { describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter, useRoute } from 'vue-router';
import RouteScope from './RouteScope.vue';

const Lecteur = defineComponent({
  setup() {
    const route = useRoute();
    return () => h('p', `${route.path}|${route.query.query ?? ''}`);
  },
});

async function monter(routeDeFond) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/library', component: Lecteur }, { path: '/library/media/:id', component: Lecteur }],
  });
  await router.push('/library/media/13');
  const wrapper = mount(RouteScope, {
    props: { route: routeDeFond ? router.resolve(routeDeFond) : null },
    slots: { default: () => h(Lecteur) },
    global: { plugins: [router] },
  });
  return { wrapper, router };
}

describe('RouteScope', () => {
  it('fait lire la route de fond a la page posee sous une fiche', async () => {
    // Sans cela, la mediatheque lisait l'adresse de la fiche et vidait sa grille.
    const { wrapper } = await monter('/library?query=Film');
    expect(wrapper.text()).toBe('/library|Film');
  });

  it('laisse passer la route courante hors fiche, et la suit', async () => {
    const { wrapper, router } = await monter(null);
    expect(wrapper.text()).toBe('/library/media/13|');
    await router.push('/library?query=Dune');
    await nextTick();
    expect(wrapper.text()).toBe('/library|Dune');
  });
});
