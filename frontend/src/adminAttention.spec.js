import { describe, expect, it } from 'vitest';
import { areaSeverity, buildAttention, urgentCount } from './adminAttention';

const settings = { plex_url: 'http://plex:32400', public_base_url: 'https://watchdeck.example', channels: true };

describe('adminAttention', () => {
  it('ne signale rien quand tout va bien', () => {
    const items = buildAttention({
      services: { plex: { state: 'ok' }, sonarr: { state: 'ok' }, seer: { state: 'not_configured' } },
      tasks: [{ job: 'poll', label: 'Sondage', state: { status: 'complete' } }],
      version: { version: '1.63.0', is_latest: true },
      settings,
    });
    expect(items).toEqual([]);
  });

  it('classe les entrées par gravité et nomme l’instance', () => {
    const items = buildAttention({
      services: {
        sonarr: { state: 'error', message: 'HTTP 401', instance_name: 'Sonarr 4K', action_url: '/settings/services/integrations' },
        radarr: { state: 'ok', issues: [{ level: 'warning', message: 'Disque /media plein à 91 %' }], issue_count: 3 },
      },
      tasks: [{ job: 'vf', label: 'Synchronisation VF', state: { status: 'failed', last_error: 'Délai dépassé' } }],
      version: { version: '1.62.0', is_latest: false, latest_release: { tag_name: 'v1.63.0' } },
      settings: { ...settings, public_base_url: '' },
    });
    expect(items.map((item) => item.severity)).toEqual(['error', 'warn', 'warn', 'info', 'info']);
    expect(items[0].title).toBe('Sonarr 4K ne répond pas');
    expect(items[0].detail).toBe('HTTP 401');
    expect(items[1].title).toBe('Radarr signale 3 alertes');
    expect(items[2].title).toBe('« Synchronisation VF » a échoué');
    expect(items.find((item) => item.key === 'version-update')?.title).toBe('Version 1.63.0 disponible');
    expect(urgentCount(items)).toBe(3);
    expect(areaSeverity(items, 'admin-connections')).toBe('error');
    expect(areaSeverity(items, 'admin-automation')).toBe('warn');
    expect(areaSeverity(items, 'admin-users')).toBeNull();
  });

  it('signale Plex non configuré, mais pas les services facultatifs', () => {
    const items = buildAttention({ services: { plex: { state: 'not_configured' }, seer: { state: 'not_configured' } } });
    expect(items.map((item) => item.key)).toEqual(['service-plex']);
  });

  it('n’envoie jamais vers une adresse externe', () => {
    const [item] = buildAttention({ services: { sonarr: { state: 'error', action_url: 'https://evil.example' } } });
    expect(item.action.to).toBe('/settings/services/integrations');
  });

  it('range l’adresse publique manquante dans Sécurité & API', () => {
    const [item] = buildAttention({ settings: { public_base_url: '', channels: true } });
    expect(item.key).toBe('config-public-url');
    expect(item.area).toBe('admin-security');
    expect(item.action.to).toBe('/settings/security');
    expect(areaSeverity([item], 'admin-security')).toBe('info');
  });

  it('ignore les anciennes ancres d’onglet du serveur au profit de l’écran du service', () => {
    const [item] = buildAttention({ services: { sonarr: { state: 'error', action_url: '/settings#tab-connexions' } } });
    expect(item.action.to).toBe('/settings/services/integrations');
  });

  it('attend les réglages avant de parler de configuration', () => {
    expect(buildAttention({ settings: null })).toEqual([]);
    expect(buildAttention({ settings: { public_base_url: '', channels: false } }).map((i) => i.key)).toEqual(['config-public-url', 'config-channels']);
  });
});

describe('adminAttention — réponses inattendues', () => {
  it('ignore un objet à la place d’une liste', () => {
    expect(buildAttention({ services: [], tasks: {}, version: 'x' })).toEqual([]);
  });
});
