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

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/dashboard', meta: {} }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/cache', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    cache: {
      clear: vi.fn(),
    },
    syncCacheOwner: vi.fn(),
  };
});

describe('App.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne rend aucun bouton ni lien "Aller au contenu principal" (skip-link)', async () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          RouterLink: {
            props: ['to', 'title'],
            template: '<a :href="to"><slot /></a>',
          },
          RouterView: {
            template: '<div class="router-view-stub" />',
          },
          SpaceSidebar: true,
          FeedbackToast: true,
          PlaybackToast: true,
          PwaUpdateBanner: true,
          PanelLeftOpen: true,
          PanelLeftClose: true,
          Gauge: true,
          Compass: true,
          Library: true,
          CalendarDays: true,
          Download: true,
          Activity: true,
          Wrench: true,
          MessageSquareWarning: true,
          UserRound: true,
          ShieldCheck: true,
          LogOut: true,
          MoreHorizontal: true,
          DownloadIcon: true,
          HelpCircle: true,
        },
      },
    });
    await flushPromises();

    expect(wrapper.find('.skip-link').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Aller au contenu principal');
  });
});
