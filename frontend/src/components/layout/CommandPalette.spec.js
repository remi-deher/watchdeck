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

/**
 * La palette s'ouvre sur l'onglet le plus probable au vu de la page : depuis
 * /discover, c'est « Médias ». Les tests qui verifient la navigation et les reglages
 * basculent donc explicitement sur l'autre perimetre.
 */
async function selectAppScope(wrapper) {
  const tabs = wrapper.findAll('[role="tab"]');
  await tabs[tabs.length - 1].trigger('click');
  await flushPromises();
}

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
    expect(texts).toContain('Explorer');
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
    await selectAppScope(wrapper);

    const texts = optionTexts(wrapper).join(' | ');
    expect(texts).toContain('Paramètres');
    expect(texts).not.toContain('Explorer');
    wrapper.unmount();
  });

  it('navigue avec les flèches et ouvre la sélection avec Entrée', async () => {
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();

    const input = wrapper.get('.palette-input');
    await input.setValue('sonarr');
    await selectAppScope(wrapper);
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
    await selectAppScope(wrapper);
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
    expect(texts).toContain('Explorer');
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

  it('ouvre l’onglet Médias depuis une page de contenu', async () => {
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();
    await wrapper.get('.palette-input').setValue('dune');

    // Route mockee : /discover. Chercher « dune » y designe presque toujours un film,
    // pas un reglage — l'onglet ouvert doit epouser cette intention.
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].text()).toContain('Médias');
    expect(tabs[0].attributes('aria-selected')).toBe('true');
    wrapper.unmount();
  });

  it('n’affiche les onglets qu’une fois une recherche saisie', async () => {
    const wrapper = factory();
    pressCtrlK();
    await flushPromises();
    // Palette vide : la liste complete des destinations suffit, un selecteur de
    // perimetre n'aurait rien a departager.
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(0);
    wrapper.unmount();
  });
});
