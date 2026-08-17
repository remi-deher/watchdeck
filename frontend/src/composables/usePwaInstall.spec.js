import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePwaInstall } from './usePwaInstall';

describe('usePwaInstall', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('fournit les états par défaut', () => {
    const { canInstall, isInstalled, isIos, isDismissed, promptInstall, dismiss } = usePwaInstall();
    expect(typeof canInstall.value).toBe('boolean');
    expect(typeof isInstalled.value).toBe('boolean');
    expect(typeof isIos.value).toBe('boolean');
    expect(typeof isDismissed.value).toBe('boolean');
    expect(typeof promptInstall).toBe('function');
    expect(typeof dismiss).toBe('function');
  });

  it('permet de masquer la bannière pour la session', () => {
    const { isDismissed, dismiss } = usePwaInstall();
    expect(isDismissed.value).toBe(false);
    dismiss();
    expect(isDismissed.value).toBe(true);
    expect(sessionStorage.getItem('watchdeck_pwa_dismissed')).toBe('1');
  });
});
