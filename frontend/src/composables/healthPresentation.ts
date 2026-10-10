import type { ServiceHealth } from '@/types/generated/mediaAvailability';

export interface ServiceObservation {
  health?: ServiceHealth;
  state?: string;
  issues?: Array<{ level: string; message: string }>;
}

export function serviceTone(info?: ServiceObservation): 'ok' | 'warn' | 'error' | 'off' | 'loading' {
  if (info?.health) return ({ operational: 'ok', configured: 'ok', warning: 'warn', unreachable: 'error', disabled: 'off', not_configured: 'off', unknown: 'loading' } as const)[info.health.state];
  if (!info?.state) return 'loading';
  if (info.state === 'ok') return info.issues?.length ? 'warn' : 'ok';
  return info.state === 'error' ? 'error' : 'off';
}
