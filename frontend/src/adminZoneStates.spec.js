import { describe, expect, it } from 'vitest';
import { zoneStates } from './adminZoneStates';
import { buildAttention } from './adminAttention';

const settings = {
  require_approval: true,
  quota_movie_limit: 5,
  quota_show_limit: 0,
  quota_period_days: 7,
  vf_upgrade_enabled: true,
  public_base_url: 'https://watchdeck.example',
  trusted_proxies: '',
  channels: ['Email', 'Discord'],
};
const overview = {
  requests: { pending_approval: 3, failed: 0 },
  conflicts: { count: 0 },
  issues: { open: 0 },
  notifications: { queue: 4, hold: false, sent_7d: 10, failed_7d: 0, by_day: [] },
  users: { total: 14, admins: 1, moderators: 2 },
  download_clients: { total: 2, enabled: 2 },
  storage: { connections: 1, running_transfers: 0, blocked_transfers: 0 },
  images: { files: 10, bytes: 1_500_000_000 },
  maintenance: {},
};
const base = {
  items: [],
  services: { plex: { state: 'ok' }, sonarr: { state: 'ok' }, radarr: { state: 'ok' } },
  tasks: [{ job: 'a', label: 'A', state: { status: 'complete' } }, { job: 'b', label: 'B', state: { status: 'failed' } }],
  version: { version: '1.79.0', is_latest: true },
  overview,
  settings,
};
const line = (states, key) => states[key].line;

describe('zoneStates', () => {
  it('donne une ligne à chacune des neuf zones', () => {
    const states = zoneStates(base);
    expect(Object.keys(states)).toHaveLength(9);
    for (const state of Object.values(states)) expect(state.line.length).toBeGreaterThan(0);
  });

  it('décrit les connexions par ce qui répond, et nomme ce qui est en erreur', () => {
    expect(line(zoneStates(base), 'admin-connections')).toBe('3 services répondent');
    const broken = zoneStates({ ...base, services: { ...base.services, plex: { state: 'error' } } });
    expect(line(broken, 'admin-connections')).toBe('Plex en erreur · 2 sur 3 répondent');
    const instance = zoneStates({ ...base, services: { sonarr: { state: 'error', instance_name: 'Sonarr 4K' }, radarr: { state: 'ok' } } });
    expect(line(instance, 'admin-connections')).toBe('Sonarr 4K en erreur · 1 sur 2 répondent');
  });

  it('ne cite pas les services coupés ni sans réglage', () => {
    const states = zoneStates({ ...base, services: { plex: { state: 'ok' }, seer: { state: 'disabled' }, prowlarr: { state: 'non_configured' } } });
    expect(line(states, 'admin-connections')).toBe('1 service répond');
  });

  it('compte les tâches et les échecs, et dit si la VF est active', () => {
    expect(line(zoneStates(base), 'admin-automation')).toBe('2 tâches · 1 en échec · VF active');
    expect(line(zoneStates({ ...base, tasks: [], settings: { ...settings, vf_upgrade_enabled: false } }), 'admin-automation')).toBe('VF désactivée');
  });

  it('résume les notifications : canaux, file, suspension', () => {
    expect(line(zoneStates(base), 'admin-notifications')).toBe('2 canaux actifs · 4 en attente');
    expect(line(zoneStates({ ...base, settings: { ...settings, channels: [] } }), 'admin-notifications')).toBe('Aucun canal actif · 4 en attente');
    const held = { ...overview, notifications: { ...overview.notifications, hold: true } };
    expect(line(zoneStates({ ...base, overview: held }), 'admin-notifications')).toBe('2 canaux actifs · envoi suspendu');
  });

  it('résume les demandes : approbation, quotas, attente', () => {
    expect(line(zoneStates(base), 'admin-requests')).toBe('Approbation requise · 5 films / 7 j · 3 à approuver');
    const open = zoneStates({ ...base, settings: { ...settings, require_approval: false, quota_movie_limit: 0 }, overview: { ...overview, requests: { pending_approval: 0, failed: 0 } } });
    expect(line(open, 'admin-requests')).toBe('Sans approbation · Pas de quota');
  });

  it('décrit les comptes, la sécurité, la maintenance et la version', () => {
    const states = zoneStates(base);
    expect(line(states, 'admin-users')).toBe('14 comptes · 2 modérateurs');
    expect(line(states, 'admin-security')).toBe('Adresse publique définie');
    expect(line(states, 'admin-maintenance')).toContain('d’images en cache');
    expect(line(states, 'admin-maintenance')).toContain('Images jamais préchargées');
    expect(line(states, 'admin-system')).toBe('v1.79.0 · à jour');
    expect(line(zoneStates({ ...base, version: { version: 'v1.80.0', is_latest: false } }), 'admin-system')).toBe('v1.80.0 · mise à jour disponible');
    expect(line(zoneStates({ ...base, settings: { ...settings, public_base_url: '', trusted_proxies: '10.0.0.1' } }), 'admin-security')).toBe('Adresse publique non définie · proxys déclarés');
  });

  it('rappelle le dernier préchargement des images', () => {
    const recent = new Date(Date.now() - 3 * 3600_000).toISOString();
    const states = zoneStates({ ...base, overview: { ...overview, maintenance: { 'warm-images': { status: 'done', finished_at: recent } } } });
    expect(line(states, 'admin-maintenance')).toContain('Préchargement il y a 3 h');
  });

  it('laisse la ligne vide quand la donnée manque, au lieu d’affirmer', () => {
    const states = zoneStates({ ...base, overview: null, settings: null, version: null, tasks: [] });
    for (const key of ['admin-acquisition', 'admin-automation', 'admin-notifications', 'admin-requests', 'admin-users', 'admin-security', 'admin-maintenance', 'admin-system']) {
      expect(line(states, key), key).toBe('');
    }
  });

  it('prend la gravité de la zone dans ses points à traiter', () => {
    const items = buildAttention({ services: { plex: { state: 'error' } }, overview: { ...overview, requests: { pending_approval: 3, failed: 0 } } });
    const states = zoneStates({ ...base, items });
    expect(states['admin-connections'].severity).toBe('error');
    expect(states['admin-requests'].severity).toBe('warn');
    expect(states['admin-users'].severity).toBeNull();
  });

  it('signale les transferts bloqués dans la ligne d’acquisition', () => {
    const blocked = { ...overview, storage: { connections: 1, running_transfers: 0, blocked_transfers: 2 } };
    expect(line(zoneStates({ ...base, overview: blocked }), 'admin-acquisition')).toBe('2 clients actifs · 2 transferts bloqués');
  });
});
