import { describe, expect, it } from 'vitest';
import { torrentOverview, trackerBreakdown } from './torrentOverview';

const clients = [{ id: 1, name: 'Maison', enabled: true }, { id: 2, name: 'Seedbox', enabled: true }, { id: 3, name: 'Ancien', enabled: false }];
const torrents = [
  { client_id: 1, status: 'downloading', size: 1000, download_speed: 10, upload_speed: 0, ratio: 1, trackers: 'https://a.example/announce' },
  { client_id: 1, status: 'uploading', size: 500, download_speed: 0, upload_speed: 5, ratio: 2, trackers: 'https://a.example/announce,https://b.example/x' },
  { client_id: 2, client_name: 'Seedbox', client_error: 'timeout' },
];

describe('torrentOverview', () => {
  it('compte les instances connectées et signale celle qui est hors ligne', () => {
    const { kpis, items } = torrentOverview(clients, torrents);
    expect(kpis[0]).toMatchObject({ value: '1/2', tone: 'error' });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ severity: 'error', title: 'Seedbox est hors ligne' });
  });

  it('résume chaque client dans sa zone, sans compter les torrents en erreur', () => {
    const { kpis, zones } = torrentOverview(clients, torrents);
    expect(kpis[1].value).toBe('2');
    const lines = Object.fromEntries(zones[0].items.map((zone) => [zone.label, zone.line]));
    expect(lines.Maison).toBe('1 en téléchargement · 2 actifs · 2 torrents');
    expect(lines.Seedbox).toBe('Hors ligne');
    expect(lines.Ancien).toBe('Inactif');
  });

  it('se limite au client choisi', () => {
    const { kpis, zones } = torrentOverview(clients, torrents, '1');
    expect(kpis[0].value).toBe('1/1');
    expect(zones[0].items).toHaveLength(1);
  });

  it('répartit par tracker, du plus lourd au plus léger', () => {
    const rows = trackerBreakdown(torrents);
    expect(rows.map((row) => [row.name, row.count, row.size])).toEqual([['a.example', 2, 1500], ['b.example', 1, 500]]);
  });
});
