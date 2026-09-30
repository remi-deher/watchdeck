import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import { useTableColumns } from '@/composables/useTableColumns';
import ColumnPickerModal from './ColumnPickerModal.vue';

const reel = { global: { stubs: { teleport: false } } };
const COLUMNS = [
  { key: 'title', label: 'Titre', required: true },
  { key: 'size', label: 'Poids', hint: 'Taille sur le disque' },
  { key: 'plays', label: 'Lectures' },
];

function monter() {
  const prefs = useTableColumns(() => COLUMNS, { storageKey: 'test:column-picker' });
  const wrapper = mount(ColumnPickerModal, { props: { open: true, prefs, defaults: COLUMNS }, attachTo: document.body, ...reel });
  return { prefs, wrapper };
}
const lignes = () => [...document.querySelectorAll('.column-row')];
const libelles = () => lignes().map((row) => row.querySelector('strong').textContent);

describe('ColumnPickerModal', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { document.body.innerHTML = ''; });

  it('liste les colonnes dans l’ordre, avec leur description et le compte des affichées', async () => {
    const { wrapper } = monter();
    await nextTick();
    expect(libelles()).toEqual(['Titre', 'Poids', 'Lectures']);
    expect(lignes()[0].textContent).toContain('Toujours affichée');
    expect(lignes()[1].textContent).toContain('Taille sur le disque');
    expect(document.querySelector('.column-picker__count').textContent).toContain('3 sur 3');
    wrapper.unmount();
  });

  it('masque une colonne sans la retirer de la liste, et « Réinitialiser » rétablit tout', async () => {
    const { prefs, wrapper } = monter();
    await nextTick();
    prefs.toggleColumn('plays');
    prefs.moveColumn('plays', -1);
    await nextTick();
    expect(libelles()).toEqual(['Titre', 'Lectures', 'Poids']);
    expect(lignes()[1].classList).toContain('is-hidden');
    expect(document.querySelector('.column-picker__count').textContent).toContain('2 sur 3');

    const reset = [...document.querySelectorAll('.column-picker__bulk button')].find((button) => button.textContent.includes('Réinitialiser'));
    reset.click();
    await nextTick();
    expect(libelles()).toEqual(['Titre', 'Poids', 'Lectures']);
    expect(document.querySelectorAll('.column-row.is-hidden')).toHaveLength(0);
    wrapper.unmount();
  });

  it('déplace une colonne au clavier par ses flèches', async () => {
    const { wrapper } = monter();
    await nextTick();
    lignes()[2].querySelector('button[aria-label="Monter Lectures"]').click();
    await nextTick();
    expect(libelles()).toEqual(['Titre', 'Lectures', 'Poids']);
    expect(lignes()[0].querySelector('button[aria-label="Monter Titre"]').disabled).toBe(true);
    wrapper.unmount();
  });
});
