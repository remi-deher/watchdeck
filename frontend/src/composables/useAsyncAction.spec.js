import { describe, expect, it, vi } from 'vitest';

import { useAsyncAction } from './useAsyncAction';

describe('useAsyncAction', () => {
  it('exécute l’opération et recharge après succès', async () => {
    const onDone = vi.fn();
    const { run, busy, error } = useAsyncAction({ onDone });
    const operation = vi.fn().mockResolvedValue('résultat');

    const outcome = await run(operation);

    expect(operation).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
    expect(outcome).toEqual({ ok: true, result: 'résultat' });
    expect(busy.value).toBe(false);
    expect(error.value).toBe('');
  });

  it('capture l’erreur au lieu de la laisser remonter', async () => {
    const { run, error } = useAsyncAction();
    const operation = vi.fn().mockRejectedValue(new Error('panne réseau'));

    const outcome = await run(operation);

    expect(outcome).toEqual({ ok: false });
    expect(error.value).toBe('panne réseau');
  });

  it('rabaisse busy même après une erreur', async () => {
    const { run, busy } = useAsyncAction();
    const operation = vi.fn().mockRejectedValue(new Error('panne'));

    expect(busy.value).toBe(false);
    const pending = run(operation);
    expect(busy.value).toBe(true);
    await pending;
    expect(busy.value).toBe(false);
  });

  it('ne recharge pas après une erreur', async () => {
    const onDone = vi.fn();
    const { run } = useAsyncAction({ onDone });
    await run(vi.fn().mockRejectedValue(new Error('panne')));
    expect(onDone).not.toHaveBeenCalled();
  });

  it('demande confirmation avant d’agir, et n’agit pas si elle est refusée', async () => {
    const askConfirm = vi.fn().mockResolvedValue(false);
    const operation = vi.fn();
    const { run } = useAsyncAction({ askConfirm });

    const outcome = await run(operation, { confirm: { title: 'Sûr ?' } });

    expect(askConfirm).toHaveBeenCalledWith({ title: 'Sûr ?' });
    expect(operation).not.toHaveBeenCalled();
    expect(outcome).toEqual({ ok: false, cancelled: true });
  });

  it('agit une fois la confirmation acceptée', async () => {
    const askConfirm = vi.fn().mockResolvedValue(true);
    const operation = vi.fn().mockResolvedValue();
    const { run } = useAsyncAction({ askConfirm });

    await run(operation, { confirm: { title: 'Sûr ?' } });

    expect(operation).toHaveBeenCalledOnce();
  });

  it('refuse une confirmation sans askConfirm plutôt que d’agir sans demander', async () => {
    const { run } = useAsyncAction();
    await expect(run(vi.fn(), { confirm: { title: 'Sûr ?' } })).rejects.toThrow();
  });

  it('n’appelle pas onDone quand reload vaut false', async () => {
    const onDone = vi.fn();
    const { run } = useAsyncAction({ onDone });
    await run(vi.fn().mockResolvedValue(), { reload: false });
    expect(onDone).not.toHaveBeenCalled();
  });

  it('réutilise les refs busy/error fournies plutôt que d’en créer de nouvelles', async () => {
    const { ref } = await import('vue');
    const busy = ref(false);
    const error = ref('');
    const { run } = useAsyncAction({ busy, error });
    await run(vi.fn().mockRejectedValue(new Error('partagée')));
    expect(error.value).toBe('partagée');
  });

  it('efface une erreur précédente au nouvel essai', async () => {
    const { run, error } = useAsyncAction();
    await run(vi.fn().mockRejectedValue(new Error('premier échec')));
    expect(error.value).toBe('premier échec');
    await run(vi.fn().mockResolvedValue());
    expect(error.value).toBe('');
  });
});
