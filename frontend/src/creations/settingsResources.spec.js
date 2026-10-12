/* Les definitions « Creer » des ressources de reglages : ce qu'elles envoient, ce qu'elles
   exigent, et ce qu'elles conservent en modification. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => api(...args) }));

const { downloadClientCreation } = await import('./downloadClient');
const { emailProviderCreation } = await import('./emailProvider');
const { plexServerCreation } = await import('./plexServer');
const { serviceForm } = await import('./service');

const body = (path, method) => {
  const call = api.mock.calls.find(([p, o]) => p === path && o?.method === method);
  return call ? JSON.parse(call[1].body) : null;
};
const field = (definition, stepKey, key) => definition.steps.find((s) => s.key === stepKey).fields.find((f) => f.key === key);

beforeEach(() => { api.mockReset().mockResolvedValue({ success: true }); });

describe('client de telechargement', () => {
  it('cree par POST et previent la liste', async () => {
    const done = vi.fn();
    const definition = downloadClientCreation(null, done);
    expect(definition.quick).toBe(false);
    const result = await definition.submit({ ...definition.initial(), name: 'qBit', url: 'http://q:8080', has_password: true });
    expect(body('/api/download-clients', 'POST')).toMatchObject({ name: 'qBit', client_type: 'qbittorrent' });
    expect(body('/api/download-clients', 'POST')).not.toHaveProperty('has_password');
    expect(done).toHaveBeenCalledWith('Client ajouté.');
    expect(result.message).toContain('branché');
  });

  it('modifie par PUT, en une fenetre sans ecran de resultat', async () => {
    const definition = downloadClientCreation(5, () => {});
    expect(definition.quick).toBe(true);
    await definition.submit({ ...definition.initial(), name: 'qBit', url: 'http://q' });
    expect(body('/api/download-clients/5', 'PUT')).toMatchObject({ name: 'qBit' });
  });

  it('teste la connexion avec l’identifiant de l’element modifie', async () => {
    const definition = downloadClientCreation(5, () => {});
    const result = await definition.test.run({ url: 'http://q', client_type: 'qbittorrent' });
    expect(body('/api/test/download-client', 'POST')).toMatchObject({ id: 5, url: 'http://q' });
    expect(result.ok).toBe(true);
  });
});

describe('instance *arr', () => {
  const base = { arr_type: 'radarr', name: 'Radarr', url: 'http://r', api_key: 'k', root_folder: '/media', minimum_availability: 'released', quality_profile_id: '3', plex_server_id: '', is_default: true, enabled: true, indexer_ids: null };

  it('envoie les reglages d’ajout pour Radarr, convertis', async () => {
    await serviceForm(null, () => {}).submit(base);
    expect(body('/api/arr-instances', 'POST')).toMatchObject({ root_folder: '/media', quality_profile_id: 3, plex_server_id: null, is_default: true, minimum_availability: 'released' });
  });

  it('n’envoie ni dossier ni profil pour Prowlarr, et jamais « par defaut » pour FileFlows', async () => {
    await serviceForm(null, () => {}).submit({ ...base, arr_type: 'prowlarr' });
    expect(body('/api/arr-instances', 'POST')).toMatchObject({ root_folder: null, quality_profile_id: null });
    await serviceForm(null, () => {}).submit({ ...base, arr_type: 'fileflows' });
    expect(api.mock.calls.filter(([, o]) => o?.method === 'POST').map(([, o]) => JSON.parse(o.body)).pop().is_default).toBe(false);
  });

  it('exige la clé API, sauf pour FileFlows ou si elle est déjà enregistrée', () => {
    const validate = field(serviceForm(null, () => {}), 'connection', 'api_key').validate;
    expect(validate('', { arr_type: 'sonarr' })).toBeTruthy();
    expect(validate('', { arr_type: 'fileflows' })).toBeNull();
    expect(validate('', { arr_type: 'sonarr', has_api_key: true })).toBeNull();
    expect(validate('abc', { arr_type: 'sonarr' })).toBeNull();
  });

  it('modifie par PUT sans reinitialiser l’activation', async () => {
    await serviceForm(3, () => {}).submit({ ...base, enabled: false });
    expect(body('/api/arr-instances/3', 'PUT')).toMatchObject({ enabled: false });
  });

  it('charge profils, dossiers et serveurs Plex en arrivant sur l’étape des réglages', async () => {
    api.mockImplementation(async (path) => {
      if (path.includes('/profiles')) return [{ id: 1, name: 'HD' }];
      if (path.includes('/folders')) return [{ path: '/media/FILMS' }];
      if (path === '/api/plex-servers') return [{ id: 1, name: 'Principal', is_primary: true, enabled: true }, { id: 2, name: '4K', is_primary: false, enabled: true }];
      return {};
    });
    const definition = serviceForm(3, () => {});
    const settings = definition.steps.find((s) => s.key === 'settings');
    await settings.onEnter({ arr_type: 'radarr', url: 'http://r', api_key: '' });
    expect(field(definition, 'settings', 'quality_profile_id').options({})).toEqual([{ value: '', label: 'Par défaut' }, { value: '1', label: 'HD' }]);
    expect(field(definition, 'settings', 'root_folder').suggestions({})).toEqual(['/media/FILMS']);
    expect(field(definition, 'settings', 'plex_server_id').when({})).toBe(true);
    expect(field(definition, 'settings', 'plex_server_id').options({}).map((o) => o.value)).toEqual(['', '2']);
  });
});

describe('serveur Plex', () => {
  const values = { name: 'Plex 4K', url: 'http://p:32400', token: 't', libraries_text: 'Films 4K | movie\nSeries | series', is_primary: false };

  it('envoie les bibliothèques en JSON', async () => {
    await plexServerCreation(null, () => {}).submit(values);
    const sent = body('/api/plex-servers', 'POST');
    expect(JSON.parse(sent.libraries)).toEqual([{ name: 'Films 4K', kind: 'movie' }, { name: 'Series', kind: 'series' }]);
    expect(sent).not.toHaveProperty('libraries_text');
  });

  it('refuse un type de bibliothèque inconnu', () => {
    const validate = field(plexServerCreation(null, () => {}), 'libraries', 'libraries_text').validate;
    expect(validate('Films | movie')).toBeNull();
    expect(validate('Films | dvd')).toContain('dvd');
  });

  it('n’exige ni adresse ni jeton pour le serveur principal, seulement son nom', () => {
    const definition = plexServerCreation(1, () => {});
    expect(field(definition, 'connection', 'url').when({ is_primary: true })).toBe(false);
    expect(field(definition, 'connection', 'token').when({ is_primary: true })).toBe(false);
    expect(definition.steps.find((s) => s.key === 'libraries').when({ is_primary: true })).toBe(false);
  });

  it('teste le serveur existant par son identifiant, sans adresse pour le principal', async () => {
    await plexServerCreation(7, () => {}).test.run({ is_primary: true, url: 'x', token: '' });
    expect(body('/api/test/plex-server', 'POST')).toEqual({ id: 7, url: null, token: null });
  });
});

describe('fournisseur d’email', () => {
  const smtp = { name: 'Perso', provider_type: 'smtp', enabled: true, smtp_host: 'smtp', smtp_port: 587, oauth_connected: false, __wasConnected: false };

  it('cree sans les champs internes', async () => {
    const result = await emailProviderCreation(null, () => {}).submit(smtp);
    const sent = body('/api/email-providers', 'POST');
    expect(sent).not.toHaveProperty('__wasConnected');
    expect(sent).not.toHaveProperty('oauth_connected');
    expect(result.links.map((l) => l.label)).toEqual(['Voir les canaux']);
  });

  it('propose de connecter Microsoft une fois le fournisseur OAuth2 enregistré', async () => {
    const result = await emailProviderCreation(4, () => {}).submit({ ...smtp, provider_type: 'smtp_oauth2' });
    expect(result.links[0]).toEqual({ label: 'Connecter avec Microsoft', href: '/api/email-providers/4/smtp-oauth/authorize' });
  });

  it('déconnecte le compte Microsoft quand on décoche « connecté »', async () => {
    await emailProviderCreation(4, () => {}).submit({ ...smtp, provider_type: 'smtp_oauth2', __wasConnected: true, oauth_connected: false });
    expect(api).toHaveBeenCalledWith('/api/email-providers/4/smtp-oauth/disconnect', { method: 'POST' });
  });

  it('ne déconnecte rien si le compte reste connecté', async () => {
    await emailProviderCreation(4, () => {}).submit({ ...smtp, provider_type: 'smtp_oauth2', __wasConnected: true, oauth_connected: true });
    expect(api).not.toHaveBeenCalledWith('/api/email-providers/4/smtp-oauth/disconnect', expect.anything());
  });
});
