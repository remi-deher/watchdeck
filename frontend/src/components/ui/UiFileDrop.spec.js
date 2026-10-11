import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UiFileDrop from './UiFileDrop.vue';

const file = (name, type = '') => new File(['x'], name, { type });
const drop = (wrapper, files) => wrapper.trigger('drop', { dataTransfer: { files } });

describe('UiFileDrop', () => {
  it('invite à déposer, puis nomme le fichier choisi', async () => {
    const wrapper = mount(UiFileDrop, { props: { accept: '.torrent', placeholder: 'Glissez un .torrent' } });
    expect(wrapper.text()).toContain('Glissez un .torrent');
    await wrapper.setProps({ modelValue: file('film.torrent') });
    expect(wrapper.text()).toContain('film.torrent');
    expect(wrapper.classes()).toContain('has-file');
  });

  it('ne retient au dépôt que les fichiers du type accepté', async () => {
    const wrapper = mount(UiFileDrop, { props: { accept: '.torrent' } });
    await drop(wrapper, [file('notes.txt')]);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    const torrent = file('Film.TORRENT');
    await drop(wrapper, [torrent]);
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([torrent]);
  });

  it('accepte un type MIME générique et retire le fichier', async () => {
    const wrapper = mount(UiFileDrop, { props: { accept: 'image/*', modelValue: file('a.png', 'image/png') } });
    const image = file('b.jpg', 'image/jpeg');
    await drop(wrapper, [image]);
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([image]);
    await wrapper.get('.ui-file-drop__clear').trigger('click');
    expect(wrapper.emitted('update:modelValue')[1]).toEqual([null]);
  });
});
