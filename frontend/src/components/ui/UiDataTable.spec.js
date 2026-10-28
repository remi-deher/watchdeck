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

  it('passe du tri local au tri serveur après chargement', async () => {
    const w = monter({ sort: { key: 'size', direction: 'asc' } });
    expect(titres(w)).toEqual(['Alien', 'Brazil', 'Dune']);
    await w.setProps({ manualSort: true });
    await nextTick();
    expect(titres(w)).toEqual(['Dune', 'Alien', 'Brazil']);
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

  it('Maj / Ctrl-clic sélectionne une ligne cliquable au lieu de l’ouvrir ; un clic simple l’ouvre', async () => {
    const w = monter({ selectable: true, clickable: true });
    await w.findAll('tbody tr')[0].trigger('click', { ctrlKey: true });
    expect(w.emitted('row-click')).toBeUndefined();
    expect(w.emitted('update:selection').at(-1)[0]).toEqual([1]);
    await w.findAll('tbody tr')[2].trigger('click', { shiftKey: true });
    expect(w.emitted('update:selection').at(-1)[0]).toEqual([1, 2, 3]);
    await w.findAll('tbody tr')[1].trigger('click');
    expect(w.emitted('row-click')).toHaveLength(1);
  });

  it('un clic sur un bouton de la ligne n’est jamais une sélection', async () => {
    const w = monter({ selectable: true, clickable: true }, { 'cell-title': () => h('button', { class: 'dans-la-ligne' }, 'Ouvrir') });
    await w.find('button.dans-la-ligne').trigger('click', { ctrlKey: true });
    expect(w.emitted('row-click')).toHaveLength(1);
    expect(w.emitted('update:selection')).toBeUndefined();
  });
});


describe('UiDataTable large collections', () => {
  const many = Array.from({ length: 2000 }, (_, i) => ({ id: `row-${i}`, title: `Film ${String(i).padStart(4, '0')}`, size: i }));
  it('bounds rendered rows, keeps total and selection across unmounted rows', async () => {
    const w = monter({ rows: many, selectable: true });
    await nextTick();
    expect(w.findAll('tbody[data-row-key]').length).toBeLessThan(50);
    expect(w.find('table').attributes('aria-rowcount')).toBe('2001');
    await w.find('thead [role="checkbox"]').trigger('click');
    expect(w.emitted('update:selection').at(-1)[0]).toHaveLength(2000);
    await w.find('thead th:nth-child(2) button').trigger('click');
    await w.find('thead th:nth-child(2) button').trigger('click');
    expect(w.find('tbody[data-row-key]').attributes('data-row-key')).toBe('row-1999');
    w.unmount();
  });
  it('preserves an explicit opt-out and uncontrolled expanded content', async () => {
    const w = monter({ rows: many.slice(0, 160), virtualize: false });
    expect(w.findAll('tbody[data-row-key]')).toHaveLength(160);
    w.unmount();
    const expanded = monter({ rows: many.slice(0, 160) }, { 'row-after': () => h('div', 'Detail') });
    expect(expanded.findAll('tbody[data-row-key]')).toHaveLength(160);
    expanded.unmount();
  });
  it('crosses the progressive loading threshold without changing selection', async () => {
    const w = monter({ rows: many.slice(0, 100), selectable: true, selection: ['row-0'] });
    expect(w.findAll('tbody[data-row-key]')).toHaveLength(100);
    await w.setProps({ rows: many.slice(0, 300) });
    await nextTick();
    expect(w.findAll('tbody[data-row-key]').length).toBeLessThan(50);
    expect(w.find('tbody[data-row-key="row-0"] tr').classes()).toContain('is-selected');
    w.unmount();
  });
});

it('keeps controlled expanded content inside its virtual row group', async () => {
  const w = monter({ rows: Array.from({ length: 300 }, (_, i) => ({ id: i, title: `Film ${i}` })), rowExpanded: row => row.id === 0 }, {
    'row-after': ({ row }) => row.id === 0 ? h('section', 'Details ouverts') : null,
  });
  await nextTick();
  expect(w.findAll('tbody[data-row-key]').length).toBeLessThan(50);
  expect(w.find('tbody[data-row-key="0"] tr').attributes('aria-expanded')).toBe('true');
  expect(w.find('tbody[data-row-key="0"] .ui-data-table__row-after').text()).toBe('Details ouverts');
  w.unmount();
});
