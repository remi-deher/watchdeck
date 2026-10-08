import { describe, expect, it, vi } from 'vitest';
import { channelState } from './channelLastSend';

vi.mock('@/utils/format', () => ({ formatRelativeDate: () => 'Il y a 12 min' }));

describe('channelState', () => {
  it('dit qu’un canal coupé est désactivé, sans regarder ses envois', () => {
    expect(channelState(false, { sent_at: 'x', success: false })).toEqual({ status: 'inactive', text: 'Désactivé', detail: '' });
  });

  it('dit qu’un canal actif n’a encore rien envoyé', () => {
    expect(channelState(true, null)).toMatchObject({ status: 'active', detail: 'Aucun envoi pour l’instant' });
  });

  it('montre le dernier envoi réussi, ou la cause de l’échec', () => {
    expect(channelState(true, { sent_at: 'x', success: true, media_title: 'Dune', recipient: 'Léa' }))
      .toEqual({ status: 'active', text: 'Fonctionne', detail: 'Dernier envoi il y a 12 min · Dune → Léa' });
    expect(channelState(true, { sent_at: 'x', success: false, error: 'Webhook refusé (404)' }))
      .toEqual({ status: 'error', text: 'Dernier envoi en échec', detail: 'Échec il y a 12 min · Webhook refusé (404)' });
  });
});
