import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import RequestOptionsModal from './RequestOptionsModal.vue';

describe('RequestOptionsModal', () => {
  it('affiche les options de saisons pour une série et émet la confirmation', async () => {
    const wrapper = mount(RequestOptionsModal, {
      props: {
        open: true,
        mediaTitle: 'Breaking Bad',
        mediaType: 'show',
        seasonNumbers: [0, 1, 2, 3],
        seasons: [1, 2, 3],
        plexUserId: 'alice',
      },
    });

    expect(wrapper.text()).toContain('Options de la demande');
    expect(wrapper.text()).toContain('Breaking Bad');
    expect(wrapper.text()).toContain('Toutes les saisons');

    const checkboxes = wrapper.findAll('.season-options-grid input');
    expect(checkboxes).toHaveLength(3); // seasons 1, 2, 3 (0 excluded)

    const confirmBtn = wrapper.find('.form-actions .ui-button--primary');
    await confirmBtn.trigger('click');
    expect(wrapper.emitted('confirm')).toHaveLength(1);
  });

  it('affiche les sélecteurs demandeur et dossier racine pour les administrateurs', async () => {
    const wrapper = mount(RequestOptionsModal, {
      props: {
        open: true,
        mediaTitle: 'Inception',
        mediaType: 'movie',
        requesters: [{ plex_user_id: 'alice', display_name: 'Alice' }, { plex_user_id: 'bob', display_name: 'Bob' }],
        folders: [{ path: '/data/movies' }],
        plexUserId: 'alice',
        rootFolder: '/data/movies',
      },
    });

    const selects = wrapper.findAll('select');
    expect(selects).toHaveLength(2);

    await selects[0].setValue('bob');
    expect(wrapper.emitted('update:plexUserId')).toBeTruthy();
    expect(wrapper.emitted('update:plexUserId')[0]).toEqual(['bob']);
  });
});
