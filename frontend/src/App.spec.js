import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';

vi.mock('@/composables/useSession', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useSession: () => ({
      session: { value: { role: 'admin', is_owner: true, user_id: 1 } },
      isAdmin: { value: true },
      canModerate: { value: true },
      user: { value: { role: 'admin' } },
    }),
  };
});

vi.mock('@/composables/usePwaInstall', () => ({
  usePwaInstall: () => ({
    canInstall: { value: false },
    install: vi.fn(),
  }),
}));

// Le shell monte RouterLink lui-meme (rail, dock, feuille) : le mock doit donc
// l'exposer, sinon le composant echoue avant meme d'atteindre l'assertion.
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/dashboard', fullPath: '/dashboard', meta: {}, query: {} }),
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: {
    props: ['to'],
    template: '<a :href="typeof to === \'string\' ? to : to.path"><slot /></a>',
  },
}));

vi.mock('@/cache', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    cache: { clear: vi.fn() },
    syncCacheOwner: vi.fn(),
  };
});

function mountApp() {
  return mount(App, {
    global: {
      stubs: {
        RouterView: { template: '<div class="router-view-stub" />' },
        CommandPalette: true,
      },
    },
  });
}

describe('App.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rend un skip-link pointant vers #main-content', async () => {
    const wrapper = mountApp();
    await flushPromises();

    const skipLink = wrapper.find('.skip-link');
    expect(skipLink.exists()).toBe(true);
    expect(skipLink.attributes('href')).toBe('#main-content');
    expect(skipLink.text()).toContain('Aller au contenu principal');
  });

  it('expose la cible du skip-link comme region focalisable', async () => {
    const wrapper = mountApp();
    await flushPromises();

    const main = wrapper.find('#main-content');
    expect(main.exists()).toBe(true);
    // Sans tabindex, deplacer le focus au changement de route est sans effet : le
    // lecteur d'ecran reste sur l'ancienne page.
    expect(main.attributes('tabindex')).toBe('-1');
  });

  it('annonce les changements de route dans une region live', async () => {
    const wrapper = mountApp();
    await flushPromises();

    const announcer = wrapper.find('#route-announcer');
    expect(announcer.exists()).toBe(true);
    expect(announcer.attributes('aria-live')).toBe('polite');
  });
});
