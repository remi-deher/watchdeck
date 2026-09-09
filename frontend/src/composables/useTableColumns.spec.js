/** Les préférences de colonnes, désormais partagées par les deux tableaux. */
import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import { useTableColumns } from './useTableColumns';

const columns = [
  { key: 'title', label: 'Titre', required: true },
  { key: 'size', label: 'Poids' },
  { key: 'plays', label: 'Lectures' },
];

const drag = (api, from, to) => {
  api.startDrag(from, { dataTransfer: {} });
  api.drop(to);
};

describe('useTableColumns', () => {
  beforeEach(() => localStorage.clear());

  it('affiche les colonnes dans leur ordre déclaré', () => {
    const api = useTableColumns(ref(columns), { storageKey: 'test:a' });

    expect(api.visibleColumns.value.map((column) => column.key)).toEqual(['title', 'size', 'plays']);
  });

  it('garde ordre, visibilité, largeur et densité d’une session à l’autre', async () => {
    const first = useTableColumns(ref(columns), { storageKey: 'test:b' });
    drag(first, 'plays', 'title');
    first.toggleColumn('size');
    first.columnWidths.value = { title: 240 };
    first.toggleDensity();
    // L'ecriture des preferences passe par un `watch` : elle attend le tick suivant.
    await nextTick();

    const second = useTableColumns(ref(columns), { storageKey: 'test:b' });

    expect(second.orderedColumns.value.map((column) => column.key)).toEqual(['plays', 'title', 'size']);
    expect(second.visibleColumns.value.map((column) => column.key)).toEqual(['plays', 'title']);
    expect(second.columnWidths.value.title).toBe(240);
    expect(second.density.value).toBe('compact');
  });

  it('ne vide jamais le tableau', () => {
    // Une colonne requise reste affichée, et le minimum protège les autres.
    const api = useTableColumns(ref(columns), { storageKey: 'test:c', minimumVisible: 2 });

    api.toggleColumn('size');
    api.toggleColumn('plays');
    api.toggleColumn('title');

    expect(api.visibleColumns.value.length).toBeGreaterThanOrEqual(2);
  });

  it('fait apparaître une colonne ajoutée par une nouvelle version', async () => {
    // Les préférences rangées ne connaissent qu'un ancien jeu de clés : sans cela, une
    // colonne neuve resterait invisible pour qui a déjà ouvert la page.
    const source = ref(columns);
    const api = useTableColumns(source, { storageKey: 'test:d' });

    source.value = [...columns, { key: 'viewer', label: 'Spectateurs' }];
    await Promise.resolve();

    expect(api.visibleColumns.value.map((column) => column.key)).toContain('viewer');
  });

  it('redimensionne une colonne au pointeur, sans passer sous 50 px', () => {
    const api = useTableColumns(ref(columns), { storageKey: 'test:e', defaultWidths: { title: 200 } });

    api.startColumnResize('title', { clientX: 100, target: null });
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160 }));
    expect(api.columnWidths.value.title).toBe(260);

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: -900 }));
    expect(api.columnWidths.value.title).toBe(50);
    window.dispatchEvent(new MouseEvent('pointerup'));
  });

  it('déplace une colonne au clavier comme au glisser-déposer', () => {
    // Le drag-and-drop HTML5 n'est opérable ni au clavier ni au toucher.
    const api = useTableColumns(ref(columns), { storageKey: 'test:f' });

    api.moveColumn('plays', -1);

    expect(api.orderedColumns.value.map((column) => column.key)).toEqual(['title', 'plays', 'size']);
  });
});
