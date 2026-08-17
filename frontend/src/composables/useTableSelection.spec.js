import { nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';

import { useTableSelection } from './useTableSelection';

const ROWS = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

describe('useTableSelection', () => {
  it('bascule une ligne', () => {
    const { isSelected, toggle, count } = useTableSelection(ref([...ROWS]));
    toggle(ROWS[1]);
    expect(isSelected(ROWS[1])).toBe(true);
    expect(count.value).toBe(1);
    toggle(ROWS[1]);
    expect(isSelected(ROWS[1])).toBe(false);
  });

  it('sélectionne et désélectionne tout', () => {
    const { allSelected, toggleAll, selectedIds } = useTableSelection(ref([...ROWS]));
    toggleAll();
    expect(allSelected.value).toBe(true);
    expect(selectedIds.value).toEqual([1, 2, 3, 4]);
    toggleAll();
    expect(selectedIds.value).toEqual([]);
  });

  it('signale une sélection partielle', () => {
    const { partiallySelected, allSelected, toggle } = useTableSelection(ref([...ROWS]));
    expect(partiallySelected.value).toBe(false);
    toggle(ROWS[0]);
    expect(partiallySelected.value).toBe(true);
    expect(allSelected.value).toBe(false);
  });

  it('ne se dit pas « tout sélectionné » sur une liste vide', () => {
    const { allSelected } = useTableSelection(ref([]));
    expect(allSelected.value).toBe(false);
  });

  it('étend la sélection à la plage avec Maj', () => {
    const { selectedIds, toggle } = useTableSelection(ref([...ROWS]));
    toggle(ROWS[0], 0);
    toggle(ROWS[2], 2, { shiftKey: true });
    expect(selectedIds.value).toEqual([1, 2, 3]);
  });

  it('étend la plage vers le haut aussi', () => {
    const { selectedIds, toggle } = useTableSelection(ref([...ROWS]));
    toggle(ROWS[3], 3);
    toggle(ROWS[1], 1, { shiftKey: true });
    expect(selectedIds.value.sort()).toEqual([2, 3, 4]);
  });

  it('accepte une clé composite', () => {
    const rows = ref([{ client_id: 1, hash: 'a' }, { client_id: 2, hash: 'b' }]);
    const keyOf = row => `${row.client_id}:${row.hash}`;
    const { toggle, selectedIds, isSelected } = useTableSelection(rows, keyOf);
    toggle(rows.value[1]);
    expect(selectedIds.value).toEqual(['2:b']);
    expect(isSelected(rows.value[1])).toBe(true);
  });

  it('élague les lignes disparues de la liste', async () => {
    const rows = ref([...ROWS]);
    const { toggleAll, selectedIds } = useTableSelection(rows);
    toggleAll();
    expect(selectedIds.value).toEqual([1, 2, 3, 4]);

    // Changement de filtre : seules deux lignes restent affichées.
    rows.value = [{ id: 2 }, { id: 4 }];
    await nextTick();
    expect(selectedIds.value).toEqual([2, 4]);
  });

  it('vide la sélection quand plus rien n’est affiché', async () => {
    const rows = ref([...ROWS]);
    const { toggle, count } = useTableSelection(rows);
    toggle(ROWS[0]);
    rows.value = [];
    await nextTick();
    expect(count.value).toBe(0);
  });

  it('conserve la sélection quand la liste ne fait que changer d’ordre', async () => {
    const rows = ref([...ROWS]);
    const { toggle, selectedIds } = useTableSelection(rows);
    toggle(ROWS[0]);
    rows.value = [...ROWS].reverse();
    await nextTick();
    expect(selectedIds.value).toEqual([1]);
  });

  it('remet l’ancre de plage à zéro en vidant la sélection', () => {
    const { toggle, clear, lastIndex, count } = useTableSelection(ref([...ROWS]));
    toggle(ROWS[2], 2);
    expect(lastIndex.value).toBe(2);
    clear();
    expect(count.value).toBe(0);
    expect(lastIndex.value).toBeNull();
  });

  it('remplace la sélection avec setKeys', () => {
    const { setKeys, selectedIds } = useTableSelection(ref([...ROWS]));
    setKeys([3]);
    expect(selectedIds.value).toEqual([3]);
  });

  it('expose les lignes sélectionnées, pas seulement leurs clés', () => {
    const { toggle, selectedRows } = useTableSelection(ref([...ROWS]));
    toggle(ROWS[1]);
    toggle(ROWS[3]);
    expect(selectedRows.value).toEqual([{ id: 2 }, { id: 4 }]);
  });
});
