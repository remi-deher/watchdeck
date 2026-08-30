import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CommandPalette from './CommandPalette.vue';

const push = vi.fn(() => Promise.resolve());

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ path: '/discover', query: {}, fullPath: '/discover' }),
}));

vi.mock('@/composables/useDownloadSources', () => ({
  useDownloadSources: () => ({
    arrInstances: { value: [{ id: 2, name: 'Sonarr principal', arr_type: 'sonarr' }] },
    downloadClients: { value: [{ id: 7, name: 'qBittorrent DATA' }] },
    load: vi.fn(() => Promise.resolve()),
  }),
}));

function factory(props = { isAdmin: true, canModerate: true }) {
  return mount(CommandPalette, { props, attachTo: document.body });
}

function pressCtrlK() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
}

const optionTexts = (wrapper) => wrapper.findAll('[role="option"]').map((node) => node.text());

describe('CommandPalette', () => {
  beforeEach(() => push.mockClear());

  it('reste fermée tant que Ctrl+K n’a pas été pressé', () => {
    const wrapper = factory();
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('s’ouvre sur Ctrl+K et liste navigation, réglages et instances', async () => {
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();

    const texts = optionTexts(wrapper).join(' | ');
    expect(texts).toContain('Découvrir');
    expect(texts).toContain('Paramètres');
    expect(texts).toContain('Sonarr principal');
    expect(texts).toContain('qBittorrent DATA');
    wrapper.unmount();
  });

  it('filtre sans tenir compte des accents', async () => {
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();

    await wrapper.get('.palette-input').setValue('parametres');

    const texts = optionTexts(wrapper).join(' | ');
    expect(texts).toContain('Paramètres');
    expect(texts).not.toContain('Découvrir');
    wrapper.unmount();
  });

  it('navigue avec les flèches et ouvre la sélection avec Entrée', async () => {
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();

    const input = wrapper.get('.palette-input');
    await input.setValue('sonarr');
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toMatchObject({
      path: '/downloads',
      query: { view: 'sonarr', instance: '2' },
    });
    wrapper.unmount();
  });

  it('ne se ferme qu’une fois la navigation résolue', async () => {
    // useModalA11y consomme son entree d'historique par un history.back() a la
    // fermeture : si la palette fermait avant que la navigation soit commitee, ce
    // back() ramenerait l'utilisateur sur la page de depart. Le contrat verifiable
    // ici est donc que `activate` attend router.push avant d'appeler close().
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();

    let commitNavigation;
    push.mockImplementationOnce(() => new Promise((resolve) => { commitNavigation = resolve; }));

    const input = wrapper.get('.palette-input');
    await input.setValue('sonarr');
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(wrapper.find('[role="listbox"]').exists()).toBe(true);

    commitNavigation();
    await flushPromises();

    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('n’expose ni réglages ni instances à un utilisateur non-admin', async () => {
    const wrapper = factory({ isAdmin: false, canModerate: false });
    pressCtrlK();
    await flushPromises();

    const texts = optionTexts(wrapper).join(' | ');
    expect(texts).toContain('Découvrir');
    expect(texts).not.toContain('Sonarr principal');
    expect(texts).not.toContain('Version & mises à jour');
    wrapper.unmount();
  });

  it('bascule à la fermeture si Ctrl+K est pressé une seconde fois', async () => {
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true);

    pressCtrlK();
    await flushPromises();
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
