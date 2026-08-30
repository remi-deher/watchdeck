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

  it('rend un skip-link pointant vers #main-content', async () => {
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
          AppNav: true,
          CommandPalette: true,
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

    const skipLink = wrapper.find('.skip-link');
    expect(skipLink.exists()).toBe(true);
    expect(skipLink.attributes('href')).toBe('#main-content');
    expect(skipLink.text()).toContain('Aller au contenu principal');
  });
});
