import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AlignStreamsModal from './AlignStreamsModal.vue';

const apiMock = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => apiMock(...args) }));

function mountModal(props = {}) {
  return mount(AlignStreamsModal, {
    props: {
      open: true,
      item: { id: 42, title: 'Super Média', media_type: 'movie', year: 2024 },
      ...props,
    },
    global: {
      stubs: {
        ModalShell: {
          props: ['open', 'title', 'subtitle', 'busy', 'error'],
          template: '<div class="modal-shell-stub"><slot /><slot name="actions" /></div>',
        },
      },
    },
  });
}

describe('AlignStreamsModal', () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it('charge et affiche la prévisualisation des pistes et les profils Plex', async () => {
    apiMock.mockResolvedValueOnce({
      success: true,
      title: 'Super Média',
      media_type: 'movie',
      total_parts: 1,
      current_audio: { id: 1, title: 'English', language: 'en', codec: 'eac3', channels: '5.1' },
      target_audio: { id: 2, title: 'French', language: 'fr', codec: 'ac3', channels: '5.1' },
      audio_will_change: true,
      current_subtitle: null,
      target_subtitle: { id: 3, title: 'French Forced', language: 'fr', codec: 'srt', forced: true },
      subtitle_will_change: true,
      available_users: [
        { id: 'admin', name: 'Admin', title: 'Administrateur', is_admin: true },
        { id: '2', name: 'Enfants', title: 'Enfants', is_admin: false },
      ],
    });

    const wrapper = mountModal();
    await flushPromises();

    expect(apiMock).toHaveBeenCalledWith('/api/vf-upgrades/audit/42/preview');
    expect(wrapper.text()).toContain('English');
    expect(wrapper.text()).toContain('French');
    expect(wrapper.text()).toContain('French Forced');
    expect(wrapper.text()).toContain('Tous les profils');
  });

  it('permet de choisir les profils spécifiques et d’appliquer l’alignement', async () => {
    apiMock.mockResolvedValueOnce({
      success: true,
      title: 'Super Média',
      media_type: 'movie',
      total_parts: 1,
      current_audio: { id: 1, title: 'English' },
      target_audio: { id: 2, title: 'French' },
      audio_will_change: true,
      available_users: [
        { id: 'admin', name: 'Admin', title: 'Administrateur', is_admin: true },
        { id: '2', name: 'Enfants', title: 'Enfants', is_admin: false },
      ],
    });

    const wrapper = mountModal();
    await flushPromises();

    // Switch to custom profiles
    const customRadio = wrapper.find('.users-selection-section').findAll('input[type="radio"]').find(r => r.element.value === 'custom');
    expect(customRadio).toBeDefined();
    await customRadio.setValue(true);
    await flushPromises();

    expect(wrapper.findAll('.user-check-item')).toHaveLength(2);

    apiMock.mockResolvedValueOnce({ success: true, parts_processed: 1, users_count: 2 });
    const applyBtn = wrapper.findAll('button.ui-button--primary').find(b => b.text().includes('Appliquer'));
    expect(applyBtn).toBeDefined();
    await applyBtn.trigger('click');
    await flushPromises();

    expect(apiMock).toHaveBeenCalledWith(
      '/api/vf-upgrades/audit/42/fix-streams',
      expect.objectContaining({ method: 'POST' })
    );
    expect(wrapper.emitted('applied')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('supporte le mode personnalisé pour sélectionner manuellement n’importe quelle piste', async () => {
    apiMock.mockResolvedValueOnce({
      success: true,
      title: 'Super Média',
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
        { id: 12, title: 'English Full', language: 'en', codec: 'srt', forced: false },
      ],
      available_users: [{ id: 'admin', name: 'Admin', title: 'Administrateur', is_admin: true }],
    });

    const wrapper = mountModal();
    await flushPromises();

    // Passer en mode personnalisé
    const modeRadios = wrapper.findAll('.align-mode-section input[type="radio"]');
    const customModeRadio = modeRadios.find(r => r.element.value === 'custom');
    expect(customModeRadio).toBeDefined();
    await customModeRadio.setValue(true);
    await flushPromises();

    // Sélectionner la piste audio Japonaise (id: 3)
    const audioSelect = wrapper.find('#custom-audio-select');
    expect(audioSelect.exists()).toBe(true);
    await audioSelect.setValue('3');

    // Sélectionner le sous-titre Français complet (id: 11)
    const subSelect = wrapper.find('#custom-sub-select');
    expect(subSelect.exists()).toBe(true);
    await subSelect.setValue('11');

    apiMock.mockResolvedValueOnce({ success: true, parts_processed: 1 });
    const applyBtn = wrapper.findAll('button.ui-button--primary').find(b => b.text().includes('Appliquer'));
    await applyBtn.trigger('click');
    await flushPromises();

    expect(apiMock).toHaveBeenCalledWith(
      '/api/vf-upgrades/audit/42/fix-streams',
      expect.objectContaining({
        method: 'POST',
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
      })
    );
  });
});
