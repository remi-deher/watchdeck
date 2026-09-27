import { describe, expect, it } from 'vitest';
import { passwordStrength } from './passwordStrength';

describe('passwordStrength', () => {
  it('reste neutre tant que rien n’est saisi', () => {
    expect(passwordStrength('')).toMatchObject({ score: 0, level: 'empty' });
  });

  it('juge faible un mot de passe court et uniforme', () => {
    expect(passwordStrength('abc').level).toBe('weak');
  });

  it('récompense longueur et variété', () => {
    expect(passwordStrength('abcdefgh').level).toBe('weak');
    expect(passwordStrength('abcdefgh1').level).toBe('fair');
    expect(passwordStrength('Abcdefgh1').level).toBe('good');
    expect(passwordStrength('Abcdefgh1234!')).toMatchObject({ score: 100, level: 'strong' });
  });
});
