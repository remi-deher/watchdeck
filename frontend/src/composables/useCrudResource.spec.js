import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.fn();
const success = vi.fn();
const fail = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => api(...args) }));
vi.mock('@/settingsForm', () => ({
  success: (...args) => success(...args),
  fail: (...args) => fail(...args),
}));

const { useCrudResource } = await import('./useCrudResource');

const DEFAULTS = { name: '', url: '', enabled: true };

function factory(messages) {
  return useCrudResource('/api/things', DEFAULTS, messages);
}

describe('useCrudResource', () => {
  beforeEach(() => {
    api.mockReset().mockResolvedValue([]);
    success.mockReset();
    fail.mockReset();
  });

  it('charge la liste depuis la racine REST', async () => {
    api.mockResolvedValueOnce([{ id: 1, name: 'Un' }]);
    const { items, load } = factory();
    await load();
    expect(api).toHaveBeenCalledWith('/api/things');
    expect(items.value).toEqual([{ id: 1, name: 'Un' }]);
  });

  it('ouvre le formulaire vierge en création', () => {
    const { form, editingId, showModal, openModal } = factory();
    openModal();
    expect(editingId.value).toBeNull();
    expect(showModal.value).toBe(true);
    expect({ ...form }).toEqual(DEFAULTS);
  });

  it('préremplit le formulaire en édition', () => {
    const { form, editingId, openModal } = factory();
    openModal({ id: 7, name: 'Sonarr', url: 'http://x' });
    expect(editingId.value).toBe(7);
    expect(form.name).toBe('Sonarr');
    expect(form.url).toBe('http://x');
  });

  it('ne laisse pas traîner les champs de l’édition précédente', () => {
    const { form, openModal } = factory();
    openModal({ id: 1, name: 'Premier', url: 'http://a' });
    openModal({ id: 2, name: 'Second' });
    expect(form.name).toBe('Second');
    expect(form.url).toBe('');
  });

  it('crée par POST sur la racine', async () => {
    const { form, save, showModal } = factory({ created: 'Ajouté.' });
    form.name = 'Nouveau';
    await save();
    expect(api).toHaveBeenCalledWith('/api/things', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(api.mock.calls[0][1].body).name).toBe('Nouveau');
    expect(success).toHaveBeenCalledWith('Ajouté.');
    expect(showModal.value).toBe(false);
  });

  it('met à jour par PUT sur l’élément, avec son propre libellé', async () => {
    const { openModal, save } = factory({ created: 'Ajouté.', updated: 'Mis à jour.' });
    openModal({ id: 42, name: 'Existant' });
    await save();
    expect(api).toHaveBeenCalledWith('/api/things/42', expect.objectContaining({ method: 'PUT' }));
    expect(success).toHaveBeenCalledWith('Mis à jour.');
  });

  it('remet le formulaire à zéro après enregistrement', async () => {
    const { form, openModal, save, editingId } = factory();
    openModal({ id: 3, name: 'X' });
    await save();
    expect(editingId.value).toBeNull();
    expect({ ...form }).toEqual(DEFAULTS);
  });

  it('signale l’échec sans fermer la modale ni rester occupé', async () => {
    api.mockRejectedValueOnce(new Error('boum'));
    const { openModal, save, showModal, busy } = factory();
    openModal();
    await save();
    expect(fail).toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(showModal.value).toBe(true);
    expect(busy.value).toBe(false);
  });

  it('bascule l’activation puis recharge', async () => {
    const { toggle } = factory();
    await toggle({ id: 5 });
    expect(api).toHaveBeenNthCalledWith(1, '/api/things/5/toggle', { method: 'PATCH' });
    expect(api).toHaveBeenNthCalledWith(2, '/api/things');
  });

  it('supprime après confirmation', async () => {
    const askConfirm = vi.fn().mockResolvedValue(true);
    const { remove } = factory({ confirmTitle: 'Supprimer ?' });
    await remove({ id: 9, name: 'Cible' }, askConfirm);
    expect(askConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Supprimer ?', danger: true }));
    expect(api).toHaveBeenNthCalledWith(1, '/api/things/9', { method: 'DELETE' });
  });

  it('n’appelle rien si la confirmation est refusée', async () => {
    const askConfirm = vi.fn().mockResolvedValue(false);
    const { remove } = factory();
    await remove({ id: 9, name: 'Cible' }, askConfirm);
    expect(api).not.toHaveBeenCalled();
  });

  it('ferme sans conserver la saisie en cours', () => {
    const { form, showModal, openModal, closeModal, editingId } = factory();
    openModal({ id: 4, name: 'Brouillon' });
    closeModal();
    expect(showModal.value).toBe(false);
    expect(editingId.value).toBeNull();
    expect({ ...form }).toEqual(DEFAULTS);
  });
});
