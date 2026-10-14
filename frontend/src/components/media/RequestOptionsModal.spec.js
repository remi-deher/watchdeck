import { chooseOption, uiSelects } from '@/testing/uiSelect';
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import RequestOptionsModal from './RequestOptionsModal.vue';

const ModalStub = { props: ['open', 'title', 'subtitle', 'error'], template: '<div v-if="open"><h2>{{ title }}</h2><p>{{ subtitle }}</p><slot /><slot name="actions" /></div>' };
const ConfirmStub = { template: '<div />' };
const mountModal = (props) => mount(RequestOptionsModal, { props, global: { stubs: { ModalShell: ModalStub, ConfirmModal: ConfirmStub } } });
const primary = (wrapper) => wrapper.findAll('button').at(-1);

describe('RequestOptionsModal', () => {
  it('propose les saisons d’une série et renvoie la sélection à la confirmation', async () => {
    const wrapper = mountModal({
      open: true,
      mediaTitle: 'Breaking Bad',
      mediaType: 'show',
      seasonNumbers: [0, 1, 2, 3],
      seasons: [1, 2, 3],
      plexUserId: 'alice',
    });

    expect(wrapper.text()).toContain('Options de la demande');
    expect(wrapper.text()).toContain('Breaking Bad');
    expect(wrapper.findAll('[role="checkbox"]')).toHaveLength(3); // saisons 1, 2, 3 (la 0 est exclue)

    await primary(wrapper).trigger('click');
    expect(wrapper.emitted('update:seasons')[0]).toEqual([[1, 2, 3]]);
    expect(wrapper.emitted('confirm')).toHaveLength(1);
    expect(wrapper.emitted('cancel')).toBeFalsy();
  });

  it('propose les sélecteurs demandeur et dossier racine aux administrateurs', async () => {
    const wrapper = mountModal({
      open: true,
      mediaTitle: 'Inception',
      mediaType: 'movie',
      requesters: [{ plex_user_id: 'alice', display_name: 'Alice' }, { plex_user_id: 'bob', display_name: 'Bob' }],
      folders: [{ path: '/data/movies' }],
      plexUserId: 'alice',
      rootFolder: '/data/movies',
    });

    const selects = uiSelects(wrapper);
    expect(selects).toHaveLength(2);

    await chooseOption(selects[0], 'bob');
    await primary(wrapper).trigger('click');
    expect(wrapper.emitted('update:plexUserId')[0]).toEqual(['bob']);
    expect(wrapper.emitted('confirm')).toHaveLength(1);
  });
});
