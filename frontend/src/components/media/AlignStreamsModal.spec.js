import { chooseOption, uiSelects } from '@/testing/uiSelect';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AlignStreamsModal from './AlignStreamsModal.vue';

const apiMock = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => apiMock(...args) }));

const ModalStub = {
  props: ['open', 'title', 'subtitle', 'busy', 'error'],
  template: '<div class="modal-shell-stub"><h2>{{ title }}</h2><slot /><slot name="actions" /><p class="err">{{ error }}</p></div>',
};

function mountModal(props = {}) {
  return mount(AlignStreamsModal, {
    props: { open: true, item: { id: 42, title: 'Super Média', media_type: 'movie', year: 2024 }, ...props },
    global: { stubs: { ModalShell: ModalStub, ConfirmModal: { template: '<div />' } } },
  });
}
const button = (wrapper, label) => wrapper.findAll('button').find((b) => b.text().includes(label));
async function press(wrapper, label) {
  await button(wrapper, label).trigger('click');
  await flushPromises();
}

const users = [
  { id: 'admin', name: 'Admin', title: 'Administrateur', is_admin: true },
  { id: '2', name: 'Enfants', title: 'Enfants', is_admin: false },
];

describe('AlignStreamsModal', () => {
  beforeEach(() => apiMock.mockReset());

  it('charge l’analyse Plex et montre ce qui change avant de continuer', async () => {
    apiMock.mockResolvedValueOnce({
      media_type: 'movie',
      total_parts: 1,
      current_audio: { id: 1, title: 'English', language: 'en', codec: 'eac3', channels: '5.1' },
      target_audio: { id: 2, title: 'French', language: 'fr', codec: 'ac3', channels: '5.1' },
      current_subtitle: null,
      target_subtitle: { id: 3, title: 'French Forced', language: 'fr', codec: 'srt', forced: true },
      subtitle_will_change: true,
      available_users: users,
    });
    const wrapper = mountModal();
    await flushPromises();

    expect(apiMock).toHaveBeenCalledWith('/api/vf-upgrades/audit/42/preview');
    expect(wrapper.text()).toContain('Alignement Plex : Super Média');
    for (const text of ['English', 'French', 'French Forced', 'Changement']) expect(wrapper.text()).toContain(text);

    await press(wrapper, 'Continuer');
    expect(wrapper.text()).toContain('Tous les profils');
  });

  it('applique l’alignement à des profils choisis', async () => {
    apiMock.mockResolvedValueOnce({
      media_type: 'movie',
      total_parts: 1,
      current_audio: { id: 1, title: 'English' },
      target_audio: { id: 2, title: 'French' },
      available_users: users,
    });
    const wrapper = mountModal();
    await flushPromises();
    await press(wrapper, 'Continuer');

    await wrapper.findAll('[role="radio"]').find((r) => r.text().includes('Profils spécifiques')).trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[role="checkbox"]')).toHaveLength(2);

    await press(wrapper, 'Continuer'); // récapitulatif
    apiMock.mockResolvedValueOnce({ success: true, parts_processed: 1 });
    await press(wrapper, 'Appliquer');

    expect(apiMock).toHaveBeenCalledWith('/api/vf-upgrades/audit/42/fix-streams', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ users: ['Admin', 'Enfants'], include_home_users: true, mode: 'auto' }),
    }));
    expect(wrapper.emitted('applied')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('permet de choisir librement la piste audio et les sous-titres', async () => {
    apiMock.mockResolvedValueOnce({
      media_type: 'movie',
      total_parts: 1,
      current_audio: { id: 1, title: 'English 5.1', language: 'en', codec: 'eac3', channels: '5.1' },
      target_audio: { id: 2, title: 'French 5.1', language: 'fr', codec: 'ac3', channels: '5.1' },
      all_audio_streams: [
        { id: 1, title: 'English 5.1', language: 'en', codec: 'eac3', channels: '5.1' },
        { id: 2, title: 'French 5.1', language: 'fr', codec: 'ac3', channels: '5.1' },
        { id: 3, title: 'Japanese 2.0', language: 'ja', codec: 'aac', channels: '2.0' },
      ],
      all_subtitle_streams: [
        { id: 10, title: 'French Forced', language: 'fr', codec: 'srt', forced: true },
        { id: 11, title: 'French Full', language: 'fr', codec: 'srt', forced: false },
      ],
      available_users: [users[0]],
    });
    const wrapper = mountModal();
    await flushPromises();

    await wrapper.findAll('[role="radio"]').find((r) => r.text().includes('Personnalisé')).trigger('click');
    await flushPromises();
    const [audio, subtitle] = uiSelects(wrapper);
    await chooseOption(audio, '3');
    await chooseOption(subtitle, '11');

    await press(wrapper, 'Continuer');
    await press(wrapper, 'Continuer');
    apiMock.mockResolvedValueOnce({ success: true });
    await press(wrapper, 'Appliquer');

    expect(apiMock).toHaveBeenCalledWith('/api/vf-upgrades/audit/42/fix-streams', expect.objectContaining({
      body: JSON.stringify({
        users: ['all'],
        include_home_users: true,
        mode: 'custom',
        audio_stream_id: 3,
        audio_language: 'ja',
        subtitle_stream_id: 11,
        subtitle_language: 'fr',
        subtitle_forced: false,
      }),
    }));
  });
});
