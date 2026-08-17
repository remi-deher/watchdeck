import { describe, expect, it, vi } from 'vitest';
import { useConfirmedAction } from './useConfirmedAction';

describe('useConfirmedAction', () => {
  it('n’exécute l’opération qu’après confirmation', async () => {
    const action = useConfirmedAction();
    const operation = vi.fn().mockResolvedValue('ok');
    const pending = action.runConfirmed(operation, { title: 'Confirmer' });
    expect(action.dialog.value.open).toBe(true);
    expect(operation).not.toHaveBeenCalled();
    action.resolveConfirm(true);
    await expect(pending).resolves.toMatchObject({ ok: true, result: 'ok' });
    expect(operation).toHaveBeenCalledOnce();
  });

  it('retourne une annulation sans exécuter l’opération', async () => {
    const action = useConfirmedAction();
    const operation = vi.fn();
    const pending = action.runConfirmed(operation, { title: 'Confirmer' });
    action.resolveConfirm(false);
    await expect(pending).resolves.toEqual({ ok: false, cancelled: true });
    expect(operation).not.toHaveBeenCalled();
  });
});
