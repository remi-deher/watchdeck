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
    const wrapper = await mountAt('/settings/maintenance/data');
    const labels = wrapper.findAll('.app-subnav__item').map((item) => item.text());
    expect(labels).toEqual(['Maintenance', 'Données & sauvegardes', 'Confidentialité & RGPD']);
    expect(wrapper.find('.app-subnav__item[aria-current="page"]').text()).toBe('Données & sauvegardes');
  });

  it('porte les sections dans la page hors de l’Administration aussi, sur téléphone', async () => {
    restore = stubShellMode('compact');
    const wrapper = await mountAt('/library');
    expect(wrapper.find('.app-subnav__item').exists()).toBe(true);
  });

  it('n’ajoute pas de rangée à une zone qui n’a qu’une section', async () => {
    restore = stubShellMode('expanded');
    const wrapper = await mountAt('/settings/security');
    expect(wrapper.find('.app-subnav__item').exists()).toBe(false);
  });
});
