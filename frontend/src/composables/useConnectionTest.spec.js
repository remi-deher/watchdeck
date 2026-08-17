import { describe, expect, it, vi } from 'vitest';
import { useConnectionTest } from './useConnectionTest';

describe('useConnectionTest', () => {
  it('publie le résultat et appelle le succès', async () => {
    const onSuccess = vi.fn();
    const test = vi.fn().mockResolvedValue({ message: 'Joignable' });
    const state = useConnectionTest(test, { onSuccess });

    const pending = state.run('instance-1');
    expect(state.testing.value).toBe(true);
    await expect(pending).resolves.toEqual({ message: 'Joignable' });
    expect(state.testing.value).toBe(false);
    expect(state.result.value).toEqual({ message: 'Joignable' });
    expect(test).toHaveBeenCalledWith('instance-1');
    expect(onSuccess).toHaveBeenCalledWith({ message: 'Joignable' });
  });

  it('capture une erreur et empêche deux tests simultanés', async () => {
    let rejectTest;
    const onError = vi.fn();
    const test = vi.fn(() => new Promise((_resolve, reject) => { rejectTest = reject; }));
    const state = useConnectionTest(test, { onError });

    const first = state.run();
    await expect(state.run()).resolves.toBeNull();
    expect(test).toHaveBeenCalledTimes(1);
    const failure = new Error('Indisponible');
    rejectTest(failure);
    await expect(first).resolves.toBeNull();
    expect(state.error.value).toBe(failure);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(state.testing.value).toBe(false);
  });
});
