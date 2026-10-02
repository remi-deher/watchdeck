import { describe, expect, it } from 'vitest';
import { firstSecurityGap, securityChecks, securityScore } from './profileSecurity';

describe('profileSecurity', () => {
  it('ne réclame pas la 2FA à un compte qui se connecte seulement avec Plex', () => {
    const checks = securityChecks({ has_local_password: false, totp_enabled: false, passkey_count: 1 });
    expect(checks.map((c) => c.key)).toEqual(['login', 'passkey']);
    expect(securityScore(checks)).toEqual({ done: 2, total: 2 });
    expect(firstSecurityGap(checks)).toBeNull();
  });

  it('met la 2FA en avant quand un mot de passe local existe sans elle', () => {
    const checks = securityChecks({ has_local_password: true, totp_enabled: false, passkey_count: 0, role: 'admin' });
    expect(securityScore(checks)).toEqual({ done: 1, total: 3 });
    expect(firstSecurityGap(checks)?.key).toBe('totp');
    expect(firstSecurityGap(checks)?.detail).toContain('administrateur');
  });

  it('propose la passkey quand le reste est en place', () => {
    const checks = securityChecks({ has_local_password: true, totp_enabled: true, passkey_count: 0 });
    expect(firstSecurityGap(checks)?.key).toBe('passkey');
  });

  it('renvoie une liste vide sans compte', () => {
    expect(securityChecks(null)).toEqual([]);
  });
});
