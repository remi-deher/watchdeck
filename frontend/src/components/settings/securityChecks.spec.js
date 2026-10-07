import { describe, expect, it } from 'vitest';
import { securityCheckRows } from './securityChecks';

const base = {
  publicBaseUrl: 'https://watchdeck.example.fr',
  trustedProxies: '',
  clientIp: { connection_ip: '10.0.0.5', client_ip: '10.0.0.5', forwarded_for: null },
  tokenActive: true,
  account: { has_local_password: true, totp_enabled: true },
};
const state = (rows, key) => rows.find((row) => row.key === key).state;

describe('securityCheckRows', () => {
  it('ne signale rien quand tout est en ordre', () => {
    const rows = securityCheckRows(base);
    expect(rows.map((row) => row.key)).toEqual(['url', 'proxy', 'token', 'totp']);
    expect(rows.every((row) => row.state === 'ok')).toBe(true);
  });

  it('signale une adresse publique absente ou en clair', () => {
    expect(state(securityCheckRows({ ...base, publicBaseUrl: '  ' }), 'url')).toBe('warn');
    const clear = securityCheckRows({ ...base, publicBaseUrl: 'http://watchdeck.example.fr' }).find((row) => row.key === 'url');
    expect(clear.state).toBe('warn');
    expect(clear.badge).toBe('Non chiffrée');
  });

  it('signale un proxy qui transmet une IP sans être déclaré', () => {
    const behind = { connection_ip: '172.18.0.2', client_ip: '172.18.0.2', forwarded_for: '203.0.113.9' };
    const row = securityCheckRows({ ...base, clientIp: behind }).find((entry) => entry.key === 'proxy');
    expect(row.state).toBe('warn');
    expect(row.detail).toContain('172.18.0.2');
    // Une fois déclaré, l'IP retenue est celle du visiteur : plus d'alerte.
    const fixed = { connection_ip: '172.18.0.2', client_ip: '203.0.113.9', forwarded_for: '203.0.113.9' };
    expect(state(securityCheckRows({ ...base, trustedProxies: '172.18.0.2', clientIp: fixed }), 'proxy')).toBe('ok');
  });

  it('signale une double authentification absente, mais seulement avec un mot de passe local', () => {
    expect(state(securityCheckRows({ ...base, account: { has_local_password: true, totp_enabled: false } }), 'totp')).toBe('warn');
    const plexOnly = securityCheckRows({ ...base, account: { has_local_password: false } });
    expect(plexOnly.some((row) => row.key === 'totp')).toBe(false);
    expect(securityCheckRows({ ...base, account: null }).some((row) => row.key === 'totp')).toBe(false);
  });

  it('ne traite jamais l’absence de jeton comme un problème', () => {
    const row = securityCheckRows({ ...base, tokenActive: false }).find((entry) => entry.key === 'token');
    expect(row.state).toBe('ok');
    expect(row.badge).toBe('Aucun jeton');
  });
});
