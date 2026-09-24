import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { h, nextTick } from 'vue';
import UiDataTable from './UiDataTable.vue';

const rows = [
  { id: 1, title: 'Dune', size: 30 },
  { id: 2, title: 'Alien', size: 10 },
  { id: 3, title: 'Brazil', size: 20 },
];
const columns = [
  { key: 'title', label: 'Titre', sortable: true, card: 'title' },
  { key: 'size', label: 'Taille', sortable: true },
  { key: 'secret', label: 'Interne', card: 'hidden', value: () => 'x' },
];

function monter(props = {}, slots = {}) {
  return mount(UiDataTable, {
    props: { rows, columns, rowKey: (r) => r.id, label: 'Films', ...props },
    slots,
  });
}
const titres = (w) => w.findAll('tbody tr').map((tr) => tr.find('td.card-title').text());

describe('UiDataTable', () => {
  it('rend un tableau dont chaque cellule porte son libelle pour les cartes mobiles', () => {
    const w = monter();
    expect(w.find('[role="region"]').attributes('aria-label')).toBe('Films');
    const cellules = w.findAll('tbody tr')[0].findAll('td');
    expect(cellules.map((td) => td.attributes('data-label'))).toEqual(['Titre', 'Taille', 'Interne']);
    expect(cellules[0].classes()).toContain('card-title');
    expect(cellules[2].classes()).toContain('card-hidden');
  });

  it('trie cote client au clic sur un en-tete, et le signale aux lecteurs d\'ecran', async () => {
    const w = monter();
    expect(titres(w)).toEqual(['Dune', 'Alien', 'Brazil']);
    await w.findAll('thead th')[0].find('button').trigger('click');
    expect(titres(w)).toEqual(['Alien', 'Brazil', 'Dune']);
    expect(w.findAll('thead th')[0].attributes('aria-sort')).toBe('ascending');
    await w.findAll('thead th')[0].find('button').trigger('click');
    expect(titres(w)).toEqual(['Dune', 'Brazil', 'Alien']);
    expect(w.emitted('update:sort').at(-1)).toEqual([{ key: 'title', direction: 'desc' }]);
  });

  it('en tri serveur, laisse l\'ordre recu et ne fait qu\'emettre la demande', async () => {
    const w = monter({ manualSort: true, sort: { key: 'size', direction: 'asc' } });
    expect(titres(w)).toEqual(['Dune', 'Alien', 'Brazil']);
    await w.findAll('thead th')[0].find('button').trigger('click');
    expect(titres(w)).toEqual(['Dune', 'Alien', 'Brazil']);
    expect(w.emitted('update:sort').at(-1)[0].key).toBe('title');
  });

  it('selectionne une ligne, puis une plage au Maj-clic', async () => {
    const w = monter({ selectable: true, selection: [] });
    const cases = () => w.findAll('tbody [role="checkbox"]');
    await cases()[0].trigger('click');
    expect(w.emitted('update:selection').at(-1)).toEqual([[1]]);
    await w.setProps({ selection: [1] });
    await cases()[2].trigger('click', { shiftKey: true });
    expect(w.emitted('update:selection').at(-1)[0].sort()).toEqual([1, 2, 3]);
  });

  it('coche « tout » pour tout selectionner', async () => {
    const w = monter({ selectable: true, selection: [] });
    await w.find('thead [role="checkbox"]').trigger('click');
    await nextTick();
    expect(w.emitted('update:selection').at(-1)[0].sort()).toEqual([1, 2, 3]);
  });

  it('accepte une cellule personnalisee et un message quand il n\'y a rien', () => {
    const w = monter({}, { 'cell-size': ({ value }) => h('b', `${value} Go`) });
    expect(w.findAll('tbody tr')[0].find('b').text()).toBe('30 Go');
    const vide = monter({ rows: [] }, { empty: () => 'Rien ici.' });
    expect(vide.find('.ui-data-table__empty').text()).toBe('Rien ici.');
  });
});
