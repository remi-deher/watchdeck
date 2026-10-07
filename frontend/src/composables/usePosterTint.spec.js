import { describe, expect, it } from 'vitest';
import { dominantOfBottom } from './usePosterTint';

const pixels = (...rgba) => new Uint8ClampedArray(rgba.flat());

describe('dominantOfBottom', () => {
  it('rend la couleur d’un aplat', () => {
    expect(dominantOfBottom(pixels([192, 57, 43, 255], [192, 57, 43, 255]))).toBe('192 57 43');
  });

  it('préfère une teinte saturée à un fond presque noir', () => {
    // Un bas d'affiche sombre avec une touche rouge doit donner du rouge, pas du gris.
    const color = dominantOfBottom(pixels([10, 10, 10, 255], [10, 10, 10, 255], [220, 30, 30, 255]));
    const [r, g, b] = color.split(' ').map(Number);
    expect(r).toBeGreaterThan(g * 2);
    expect(r).toBeGreaterThan(b * 2);
  });

  it('ignore les pixels transparents', () => {
    expect(dominantOfBottom(pixels([255, 0, 0, 0], [0, 128, 0, 255]))).toBe('0 128 0');
  });

  it('ne renvoie rien d’une image entièrement transparente', () => {
    expect(dominantOfBottom(pixels([1, 2, 3, 0]))).toBeNull();
  });
});
