import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/vue-query';
import { conserverRequete, synchroniserProprietaire } from './stockage';

const requete = (queryKey, status = 'success') => ({ queryKey, state: { status } });

describe('stockage local', () => {
  afterEach(() => localStorage.clear());

  it("ne garde sur l'appareil que des donnees de consultation reussies", () => {
    expect(conserverRequete(requete(['library', 'grid']))).toBe(true);
    expect(conserverRequete(requete(['media', 'library', 3]))).toBe(true);
    expect(conserverRequete(requete(['discover', 'home']))).toBe(true);
    // Les reglages portent des cles d'API : jamais sur l'appareil.
    expect(conserverRequete(requete(['settings', 'connections']))).toBe(false);
    expect(conserverRequete(requete(['users', 'list']))).toBe(false);
    expect(conserverRequete(requete(['logs']))).toBe(false);
    expect(conserverRequete(requete(['library'], 'error'))).toBe(false);
  });

  it('efface les donnees quand un autre compte se connecte', async () => {
    const client = new QueryClient();
    localStorage.setItem('watchdeck:stockage-proprietaire', 'alice');
    client.setQueryData(['library', 'grid'], [{ id: 1 }]);
    const clear = vi.spyOn(client, 'clear');
    await synchroniserProprietaire(client, { id: 'bob' });
    expect(clear).toHaveBeenCalled();
    expect(client.getQueryData(['library', 'grid'])).toBeUndefined();
    expect(localStorage.getItem('watchdeck:stockage-proprietaire')).toBe('bob');
  });

  it('efface les donnees a la deconnexion, et garde celles du meme compte', async () => {
    const client = new QueryClient();
    localStorage.setItem('watchdeck:stockage-proprietaire', 'alice');
    client.setQueryData(['library', 'grid'], [{ id: 1 }]);
    await synchroniserProprietaire(client, { id: 'alice' });
    expect(client.getQueryData(['library', 'grid'])).toEqual([{ id: 1 }]);
    await synchroniserProprietaire(client, null);
    expect(client.getQueryData(['library', 'grid'])).toBeUndefined();
    expect(localStorage.getItem('watchdeck:stockage-proprietaire')).toBeNull();
  });

  it("un compte sans identifiant n'est pas pris pour une deconnexion", async () => {
    const client = new QueryClient();
    await synchroniserProprietaire(client, { role: 'admin' });
    expect(localStorage.getItem('watchdeck:stockage-proprietaire')).toBe('compte');
  });
});
