import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerToastService, unregisterToastService, useToast } from './useToast';

function createService() {
  return { add: vi.fn(), remove: vi.fn(), removeGroup: vi.fn(), removeAllGroups: vi.fn() };
}

let activeService;
afterEach(() => {
  if (activeService) unregisterToastService(activeService);
  activeService = undefined;
});

describe('useToast', () => {
  it('translates the stable app API to PrimeVue messages', () => {
    activeService = createService();
    registerToastService(activeService);
    const { success, error } = useToast();
    const successId = success('Succès', 'Opération réussie');
    const errorId = error('Erreur', 'Opération échouée');

    expect(errorId).toBeGreaterThan(successId);
    expect(activeService.add).toHaveBeenNthCalledWith(1, expect.objectContaining({ severity: 'success', summary: 'Succès', detail: 'Opération réussie', group: 'app', life: 4000 }));
    expect(activeService.add).toHaveBeenNthCalledWith(2, expect.objectContaining({ severity: 'error' }));
  });

  it('queues early messages and can remove one by its returned id', () => {
    const { addToast, removeToast } = useToast();
    const id = addToast({ title: 'Prêt avant le montage', duration: 0, image: '/poster.jpg' });
    activeService = createService();
    registerToastService(activeService);

    expect(activeService.add).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Prêt avant le montage', data: expect.objectContaining({ id, image: '/poster.jpg' }) }));
    removeToast(id);
    expect(activeService.remove).toHaveBeenCalledWith(activeService.add.mock.calls[0][0]);
  });

  it('preserves undo actions in the message payload', () => {
    activeService = createService();
    registerToastService(activeService);
    const run = vi.fn();
    useToast().undoable('Supprimé', 'Annuler', run, 'La demande a été retirée.');

    expect(activeService.add).toHaveBeenCalledWith(expect.objectContaining({ life: 8000, data: expect.objectContaining({ action: { label: 'Annuler', run } }) }));
  });
});
