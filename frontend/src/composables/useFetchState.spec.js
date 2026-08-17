import { describe, it, expect } from 'vitest';
import { useFetchState } from './useFetchState';

describe('useFetchState', () => {
  it('initialise avec loading=false et error vide par défaut', () => {
    const { loading, error, data } = useFetchState([]);
    expect(loading.value).toBe(false);
    expect(error.value).toBe('');
    expect(data.value).toEqual([]);
  });

  it('exécute une fonction asynchrone avec succès et met à jour data', async () => {
    const { loading, error, data, execute } = useFetchState([]);

    const promise = execute(async () => {
      expect(loading.value).toBe(true);
      return [1, 2, 3];
    });

    const result = await promise;
    expect(loading.value).toBe(false);
    expect(error.value).toBe('');
    expect(result).toEqual([1, 2, 3]);
    expect(data.value).toEqual([1, 2, 3]);
  });

  it('gère les erreurs et met à jour error', async () => {
    let capturedError = null;
    const { loading, error, data, execute } = useFetchState([], {
      onError: (err) => { capturedError = err; },
    });

    const result = await execute(async () => {
      throw new Error('Échec du chargement');
    });

    expect(loading.value).toBe(false);
    expect(error.value).toBe('Échec du chargement');
    expect(result).toBeUndefined();
    expect(data.value).toEqual([]);
    expect(capturedError).toBeInstanceOf(Error);
  });

  it('permet de réinitialiser l’erreur avec clearError', () => {
    const { error, clearError } = useFetchState(undefined, { initialError: 'Erreur initiale' });
    expect(error.value).toBe('Erreur initiale');
    clearError();
    expect(error.value).toBe('');
  });
});
