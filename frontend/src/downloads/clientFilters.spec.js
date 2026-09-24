import { describe, expect, it } from 'vitest';
import { clientStatus, filterClients, matchFilterValue, parseSearchQuery } from './clientFilters';

const rows = [
  { client_id: 1, title: 'Alpha 1080p', tags: 'vff', category: 'films', status: 'downloading', progress: 30, trackers: 'https://tracker.one/announce', managed_by: 'watchdeck' },
  { client_id: 2, title: 'Bravo', tags: '', category: '', status: 'pausedDL', progress: 10, trackers: 'udp://two.org', managed_by: 'external' },
  { client_id: 1, title: 'Charlie', tags: '', category: 'series', status: 'uploading', progress: 100, trackers: '' },
  { client_id: 1, title: 'Cassé', client_error: 'injoignable' },
];
const none = { query: '', clientId: '', category: '', status: '', tracker: '', ownership: '' };

describe('clientFilters', () => {
  it('separe le texte libre des operateurs de recherche', () => {
    expect(parseSearchQuery('Alpha cat:Films is:seeding tracker:one foo:bar')).toEqual({
      terms: 'alpha foo:bar',
      filters: { cat: 'films', tag: null, is: 'seeding', tracker: 'one' },
    });
  });

  it('accepte valeur, liste ou exclusion', () => {
    expect(matchFilterValue('', 'x')).toBe(true);
    expect(matchFilterValue(['films', 'series'], 'Series')).toBe(true);
    expect(matchFilterValue(['!films'], 'films')).toBe(false);
    expect(matchFilterValue(['!films'], 'series')).toBe(true);
    expect(matchFilterValue('one', 'https://tracker.one', true)).toBe(true);
  });

  it('simplifie l etat des torrents', () => {
    expect(rows.map(clientStatus)).toEqual(['downloading', 'paused', 'seeding', 'error']);
  });

  it('ecarte les clients en erreur et combine recherche et filtres', () => {
    expect(filterClients(rows, none).map(r => r.title)).toEqual(['Alpha 1080p', 'Bravo', 'Charlie']);
    expect(filterClients(rows, { ...none, clientId: '1' }).map(r => r.title)).toEqual(['Alpha 1080p', 'Charlie']);
    expect(filterClients(rows, { ...none, query: 'tag:vff' }).map(r => r.title)).toEqual(['Alpha 1080p']);
    expect(filterClients(rows, { ...none, category: ['Non classé'] }).map(r => r.title)).toEqual(['Bravo']);
    expect(filterClients(rows, { ...none, status: ['!downloading'] }).map(r => r.title)).toEqual(['Bravo', 'Charlie']);
    expect(filterClients(rows, { ...none, tracker: 'two' }).map(r => r.title)).toEqual(['Bravo']);
    expect(filterClients(rows, { ...none, ownership: 'watchdeck' }).map(r => r.title)).toEqual(['Alpha 1080p']);
  });
});
