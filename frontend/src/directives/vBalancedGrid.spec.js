import { describe, expect, it } from 'vitest';
import { balancedColumns } from './vBalancedGrid';

describe('balancedColumns', () => {
  it('repartit les blocs pour que les rangees tombent juste', () => {
    expect(balancedColumns(5, 4)).toBe(3); // 3 + 2 plutot que 4 + 1
    expect(balancedColumns(6, 5)).toBe(3); // 3 + 3 plutot que 5 + 1
    expect(balancedColumns(9, 3)).toBe(3); // 3 x 3
    expect(balancedColumns(8, 4)).toBe(4); // 4 + 4, deja juste
  });

  it('ne cree pas plus de colonnes que de blocs', () => {
    expect(balancedColumns(1, 3)).toBe(1); // un bloc seul prend toute la ligne
    expect(balancedColumns(2, 5)).toBe(2);
  });

  it('respecte la largeur disponible', () => {
    expect(balancedColumns(5, 2)).toBe(2); // 2 + 2 + 1 : inevitable, le dernier s'etire
    expect(balancedColumns(5, 1)).toBe(1);
    expect(balancedColumns(0, 4)).toBe(1);
  });
});
