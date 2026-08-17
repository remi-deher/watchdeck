import { describe, expect, it, vi } from 'vitest';
import { useToast } from './useToast';

describe('useToast', () => {
  it('adds and dismisses toasts correctly', () => {
    const { toasts, addToast, dismissToast, success, error } = useToast();
    const initialCount = toasts.value.length;

    const id1 = success('Succès', 'Opération réussie');
    expect(toasts.value.length).toBe(initialCount + 1);

    const id2 = error('Erreur', 'Opération échouée');
    expect(toasts.value.length).toBe(initialCount + 2);

    dismissToast(id1);
    expect(toasts.value.some(t => t.id === id1)).toBe(false);

    dismissToast(id2);
  });

  it('auto-dismisses toast after duration', () => {
    vi.useFakeTimers();
    const { toasts, addToast } = useToast();
    const id = addToast({ title: 'Auto dismiss', duration: 1000 });

    expect(toasts.value.some(t => t.id === id)).toBe(true);

    vi.advanceTimersByTime(1100);
    expect(toasts.value.some(t => t.id === id)).toBe(false);
    vi.useRealTimers();
  });
});
