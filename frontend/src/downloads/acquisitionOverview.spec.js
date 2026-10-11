import { describe, expect, it } from 'vitest';
import { acquisitionOverview, liveItems } from './acquisitionOverview';

const base = { queue: [], arrInstances: [], clients: [], torrents: [], volumes: [], prowlarr: {} };
const radarr = { id: 1, name: 'Radarr', arr_type: 'radarr', enabled: true };
const stuck = { instance_id: 1, queue_id: 1, title: 'Film bloqué', arr_type: 'radarr', status: 'warning', error: 'Import bloqué', progress: 100 };
const running = { instance_id: 1, queue_id: 2, title: 'Film', arr_type: 'radarr', library_id: 4, status: 'downloading', progress: 30, work: { key: 'dl:2', state: 'running' } };

describe('acquisitionOverview', () => {
  it('ne signale rien quand tout va bien', () => {
    const { items, kpis } = acquisitionOverview({ ...base, queue: [running], arrInstances: [radarr] });
    expect(items).toEqual([]);
    expect(kpis.find((kpi) => kpi.key === 'attention')).toMatchObject({ value: '0', tone: 'ok' });
    expect(kpis.find((kpi) => kpi.key === 'running').value).toBe('1');
  });

  it('un point d’attention par chose à traiter, chacun menant à la page qui la règle', () => {
    const { items, kpis } = acquisitionOverview({
      ...base,
      queue: [stuck, stuck],
      arrInstances: [radarr, { id: 5, name: 'Prowlarr', arr_type: 'prowlarr', enabled: true }],
      clients: [{ id: 7, name: 'Maison', enabled: true }],
      torrents: [{ client_id: 7, client_error: 'Connexion refusée' }],
      volumes: [{ path: '/media', total_bytes: 100, free_bytes: 5 }],
      prowlarr: { 5: { connected: false } },
    });
    expect(items.map((item) => [item.area, item.severity])).toEqual([['queue', 'error'], ['client', 'error'], ['indexer', 'warn'], ['storage', 'warn']]);
    expect(items[0].title).toContain('2 téléchargements demandent');
    expect(items[0].action.to).toBe('/downloads?view=queue');
    expect(items[1].action.to).toContain('client=7');
    expect(items[3].detail).toContain('95 %');
    expect(kpis.find((kpi) => kpi.key === 'attention')).toMatchObject({ value: '3', tone: 'error' });
    expect(kpis.find((kpi) => kpi.key === 'storage')).toMatchObject({ value: '1', tone: 'warn' });
  });

  it('range gestionnaires, indexeurs et clients en zones, sans groupe vide', () => {
    const { zones } = acquisitionOverview({ ...base, queue: [stuck], arrInstances: [radarr], clients: [{ id: 7, name: 'Maison', enabled: true }], torrents: [{ client_id: 7 }] });
    expect(zones.map((group) => group.label)).toEqual(['Radarr et Sonarr', 'Clients de téléchargement']);
    expect(zones[0].items[0]).toMatchObject({ line: '1 téléchargement · 1 à traiter', severity: 'error' });
    expect(zones[1].items[0].line).toBe('1 torrent');
  });

  it('ne montre en direct que ce qui tourne', () => {
    expect(liveItems([stuck, running]).map((item) => item.key)).toEqual(['dl:2']);
  });
});
