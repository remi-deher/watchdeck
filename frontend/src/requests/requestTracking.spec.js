import { describe, expect, it } from 'vitest';
import { isRefused, requestActions, requestTabOf, toRecent, toTrackItem } from './requestTracking';

const request = (kind, extra = {}) => ({ id: 7, title: 'Dune', media_type: 'movie', year: 2021, tracking: kind ? { kind, label: `label ${kind}` } : null, ...extra });

describe('requestTracking', () => {
  it('classe une demande selon son suivi', () => {
    expect(requestTabOf(request('downloading'))).toBe('suivi');
    expect(requestTabOf(request(null))).toBe('disponibles');
    expect(requestTabOf(request('rejected'))).toBe('disponibles');
    expect(isRefused(request('rejected'))).toBe(true);
  });

  it('un blocage porte sa cause et les actions du moderateur', () => {
    const item = toTrackItem(request('failed', { fulfillment_error: 'Import refusé' }), true);
    expect(item.state).toBe('blocked');
    expect(item.cause.reasons).toEqual(['Import refusé']);
    expect(item.actions.map((a) => a.key)).toEqual(['retry', 'withdraw']);
    expect(toTrackItem(request('failed'), false).actions).toEqual([]);
  });

  it('un telechargement est en cours avec sa progression', () => {
    const item = toTrackItem(request('downloading', { tracking: { kind: 'downloading', download: { progress: 41.6, timeleft: '00:12:00' } } }), false);
    expect(item.state).toBe('running');
    expect(item.progress).toBe(42);
    expect(item.eta).toBe('encore 12:00');
  });

  it('une demande refusee rejoint les derniers termines, en echec', () => {
    expect(toRecent(request('rejected'))).toMatchObject({ failed: true, detail: 'label rejected' });
    expect(requestActions('approval', true).map((a) => a.key)).toEqual(['approve', 'reject']);
  });
});
