import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import DataTable from './DataTable.vue';

const columns = [
  { key: 'title', label: 'Titre', required: true, className: 'card-title' },
  { key: 'size', label: 'Taille' },
  { key: 'note', label: 'Note', sortable: false, priority: 'optional' },
];
const rows = [
  { id: 1, title: 'Zulu', size: 10, note: 'z' },
  { id: 2, title: 'Alpha', size: 30, note: 'a' },
  { id: 3, title: 'Mike', size: 20, note: 'm' },
];

function factory(props = {}) {
  return mount(DataTable, {
    props: { columns, rows, rowKey: row => row.id, preferenceScope: `test-${Math.random()}`, ...props },
  });
}

describe('DataTable', () => {
  beforeEach(() => localStorage.clear());

  it('affiche toutes les colonnes et lignes par défaut', () => {
    const wrapper = factory();
    expect(wrapper.findAll('thead th')).toHaveLength(3);
    expect(wrapper.findAll('tbody tr')).toHaveLength(3);
    expect(wrapper.text()).toContain('Zulu');
    expect(wrapper.text()).toContain('Alpha');
  });

  it('expose la priorité responsive sur les en-têtes et cellules', () => {
    const wrapper = factory();
    const headers = wrapper.findAll('thead th');
    expect(headers[0].attributes('data-priority')).toBe('primary');
    expect(headers[1].attributes('data-priority')).toBe('secondary');
    expect(headers[2].attributes('data-priority')).toBe('optional');
    expect(wrapper.find('tbody td[data-priority="optional"]').exists()).toBe(true);
  });

  it('trie les lignes au clic sur un en-tête triable', async () => {
    const wrapper = factory({ defaultSortKey: '' });
    const sizeHeader = wrapper.findAll('thead th').find(th => th.text().includes('Taille'));
    await sizeHeader.find('button').trigger('click');
    let firstCells = wrapper.findAll('tbody tr').map(tr => tr.text());
    expect(firstCells[0]).toContain('Zulu'); // size 10 ascending first

    await sizeHeader.find('button').trigger('click');
    firstCells = wrapper.findAll('tbody tr').map(tr => tr.text());
    expect(firstCells[0]).toContain('Alpha'); // size 30 descending first
  });

  it("n'affiche pas de bouton de tri pour une colonne non triable", () => {
    const wrapper = factory();
    const noteHeader = wrapper.findAll('thead th').find(th => th.text().includes('Note'));
    expect(noteHeader.find('button.sort-button').exists()).toBe(false);
    // aria-sort doit porter sur le <th> lui-meme (obligatoire pour etre lu par les
    // lecteurs d'ecran) et pas sur le bouton interne qui ne l'expose pas.
    expect(noteHeader.attributes('aria-sort')).toBeUndefined();
  });

  it('porte aria-sort sur le <th> triable, pas sur son bouton', async () => {
    const wrapper = factory();
    const sizeHeader = wrapper.findAll('thead th').find(th => th.text().includes('Taille'));
    expect(sizeHeader.attributes('aria-sort')).toBe('none');
    await sizeHeader.find('button').trigger('click');
    expect(sizeHeader.attributes('aria-sort')).toBe('ascending');
  });

  it('réordonne les colonnes au clavier via les boutons haut/bas (équivalent au glisser-déposer)', async () => {
    const wrapper = factory();
    await wrapper.vm.openColumnPicker();
    await wrapper.vm.$nextTick();
    const items = wrapper.findAll('.column-picker-item');
    const [, titleDown] = items[0].findAll('.column-reorder-btn');
    const [sizeUp] = items[1].findAll('.column-reorder-btn');
    expect(items[0].findAll('.column-reorder-btn')[0].attributes('disabled')).toBeDefined();

    await titleDown.trigger('click');
    await wrapper.vm.$nextTick();

    const headers = wrapper.findAll('thead th');
    expect(headers[0].text()).toContain('Taille');
    expect(headers[1].text()).toContain('Titre');
    expect(sizeUp).toBeTruthy();
  });

  it('émet row-click quand clickableRows est activé', async () => {
    const wrapper = factory({ clickableRows: true });
    await wrapper.findAll('tbody tr')[0].trigger('click');
    expect(wrapper.emitted('row-click')).toBeTruthy();
    expect(wrapper.emitted('row-click')[0][0].title).toBe('Zulu');
  });

  it("n'émet rien au clic quand clickableRows est désactivé", async () => {
    const wrapper = factory({ clickableRows: false });
    await wrapper.findAll('tbody tr')[0].trigger('click');
    expect(wrapper.emitted('row-click')).toBeFalsy();
  });

  it('masque une colonne facultative via le sélecteur de colonnes et persiste le choix', async () => {
    const scope = `test-${Math.random()}`;
    const wrapper = factory({ preferenceScope: scope });
    await wrapper.vm.openColumnPicker();
    await wrapper.vm.$nextTick();
    const checkboxes = wrapper.findAll('.column-picker-item input[type="checkbox"]');
    const sizeCheckbox = wrapper.findAll('.column-picker-item').find(item => item.text().includes('Taille')).find('input');
    await sizeCheckbox.setValue(false);
    expect(wrapper.findAll('thead th')).toHaveLength(2);

    const stored = JSON.parse(localStorage.getItem(`watchdeck:data-table-columns:${scope}`));
    expect(stored.visible).not.toContain('size');
    expect(checkboxes.length).toBe(3);
  });

  it('ne peut pas masquer une colonne requise', async () => {
    const wrapper = factory();
    await wrapper.vm.openColumnPicker();
    await wrapper.vm.$nextTick();
    const titleCheckbox = wrapper.findAll('.column-picker-item').find(item => item.text().includes('Titre')).find('input');
    expect(titleCheckbox.attributes('disabled')).toBeDefined();
  });

  it('affiche le message vide fourni par le slot quand il n’y a aucune ligne', () => {
    const wrapper = mount(DataTable, {
      props: { columns, rows: [], rowKey: row => row.id, preferenceScope: `test-${Math.random()}` },
      slots: { empty: 'Rien à montrer ici' },
    });
    expect(wrapper.text()).toContain('Rien à montrer ici');
  });
});
