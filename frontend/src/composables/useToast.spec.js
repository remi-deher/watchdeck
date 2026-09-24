import { afterEach, describe, expect, it } from 'vitest';
import { toasts, useToast } from './useToast';

afterEach(() => { toasts.value = []; });

describe('useToast', () => {
  it('ajoute une notification typee a la file, avec sa duree', () => {
    const { success, error } = useToast();
    success('Enregistré', 'Réglages sauvegardés.');
    error('Échec');
    expect(toasts.value.map((t) => [t.type, t.title, t.message, t.duration])).toEqual([
      ['success', 'Enregistré', 'Réglages sauvegardés.', 4000],
      ['error', 'Échec', '', 4000],
    ]);
  });

  it('retire une notification par son identifiant', () => {
    const { info, dismissToast } = useToast();
    const a = info('A');
    info('B');
    dismissToast(a);
    expect(toasts.value.map((t) => t.title)).toEqual(['B']);
  });

  it("une notification annulable reste plus longtemps et porte son action", () => {
    const run = () => {};
    useToast().undoable('Supprimé', 'Annuler', run);
    expect(toasts.value[0]).toMatchObject({ duration: 8000, action: { label: 'Annuler', run } });
  });
});
