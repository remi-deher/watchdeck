import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppPage from './AppPage.vue';

vi.mock('@/composables/useSession', () => ({
  useSession: () => ({ isAdmin: { value: true }, canModerate: { value: true } }),
}));

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
});

/** Force le mode du shell, que `useShellMode` lit par media queries. */
function stubShellMode(mode) {
  const original = window.matchMedia;
  window.matchMedia = (query) => ({
    matches:
      (query.includes('768') && (mode === 'medium' || mode === 'expanded')) ||
      (query.includes('1200') && mode === 'expanded'),
    addEventListener() {},
    removeEventListener() {},
  });
  return () => { window.matchMedia = original; };
}

async function mountAt(path) {
  await router.push(path);
  await router.isReady();
  return mount(AppPage, { props: { title: 'Page' }, global: { plugins: [router] } });
}

let restore = () => {};
afterEach(() => restore());

describe('AppPage dans l’Administration', () => {
  it('rend les sections de la zone en onglets sur téléphone : il n’y a pas de dock pour les porter', async () => {
    restore = stubShellMode('compact');
    const wrapper = await mountAt('/settings/security');
    const labels = wrapper.findAll('.app-subnav__item').map((item) => item.text());
    expect(labels).toEqual(['Réseau & langue', 'API & jeton']);
    expect(wrapper.find('.app-subnav__item[aria-current="page"]').text()).toBe('Réseau & langue');
  });

  it('garde la page sans rangée de sections hors de l’Administration, où le dock les porte', async () => {
    restore = stubShellMode('compact');
    const wrapper = await mountAt('/library');
    expect(wrapper.find('.app-subnav__item').exists()).toBe(false);
  });

  it('laisse le rail porter les sections en mode déployé', async () => {
    restore = stubShellMode('expanded');
    const wrapper = await mountAt('/settings/security');
    expect(wrapper.find('.app-subnav__item').exists()).toBe(false);
  });
});
