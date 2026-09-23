import { effectScope } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => apiMock(...args) }));

import { computeSeasonCounts, useAuditShowDetails } from './useAuditShowDetails';
import { useVfAudit } from './useVfAudit';
import { useVfScanHistory } from './useVfScanHistory';
import { mediaFromKey, useVfSelection } from './useVfSelection';
import { useVfUpgrades } from './useVfUpgrades';

/** Execute un composable dans une portee, comme dans un composant. */
function inScope(factory) {
  const scope = effectScope();
  const result = scope.run(factory);
  return { result, stop: () => scope.stop() };
}

beforeEach(() => {
  apiMock.mockReset();
  vi.useRealTimers();
});

describe('useVfAudit', () => {
  const item = (id, overrides = {}) => ({ id, media_type: 'movie', has_vf: true, fr_is_default: false, sub_fr_status: 'not_default', forced_fr_status: 'not_default', issues: ['audio_secondary', 'sub_fr_not_default', 'forced_sub_not_default'], ...overrides });

  it('charge l’audit et compte les médias alignables', async () => {
    const notify = vi.fn();
    apiMock.mockResolvedValueOnce({ items: [item(1), item(2, { has_vf: false, issues: [] })], counts: { total: 2, audio_secondary: 1, sub_fr_not_default: 1, forced_sub_not_default: 1, partial_vf: 0 } });
    const audit = useVfAudit(notify);
    await audit.load();
    expect(audit.items.value).toHaveLength(2);
    expect(audit.eligibleFixCount.value).toBe(1);
    expect(audit.totalCount.value).toBe(2);
  });

  it('corrige un média sur place et recalcule les compteurs', () => {
    const audit = useVfAudit(vi.fn());
    audit.items.value = [item(1), item(2, { issues: ['partial_vf'] })];
    audit.applyStreamsFixInPlace(1);
    const fixed = audit.items.value[0];
    expect(fixed.fr_is_default).toBe(true);
    expect(fixed.sub_fr_status).toBe('ok');
    expect(fixed.forced_fr_status).toBe('ok');
    expect(fixed.issues).toEqual([]);
    expect(audit.counts.value).toMatchObject({ total: 2, audio_secondary: 0, partial_vf: 1 });
  });

  it('« Tout aligner » n’envoie que les médias alignables de la liste fournie', async () => {
    const notify = vi.fn();
    const audit = useVfAudit(notify);
    audit.items.value = [item(1), item(2), item(3, { has_vf: false, issues: [] })];
    apiMock.mockResolvedValueOnce({ processed_items: 1 });
    await audit.fixAll([audit.items.value[1], audit.items.value[2]]);
    expect(JSON.parse(apiMock.mock.calls[0][1].body)).toEqual({ item_ids: [2] });
    expect(notify).toHaveBeenCalledWith('1 média(s) réaligné(s) sur Plex.');
    expect(audit.items.value[1].issues).toEqual([]);
    expect(audit.items.value[0].issues).toHaveLength(3);
  });

  it('signale un échec de chargement sans lever', async () => {
    const notify = vi.fn();
    apiMock.mockRejectedValueOnce(new Error('HTTP 500'));
    const audit = useVfAudit(notify);
    await audit.load();
    expect(notify).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(audit.loading.value).toBe(false);
  });
});

describe('useAuditShowDetails', () => {
  it('compte une saison : état VF selon Plex, à défaut disponibilité *arr', () => {
    const counts = computeSeasonCounts(
      { 1: { has_file: true }, 2: { has_file: false }, 3: { air_date_utc: '2999-01-01T00:00:00Z' }, 4: { has_file: true } },
      { 4: { status: 'vo', has_full_fr_sub: true, full_fr_sub_is_default: false }, 5: { status: 'vf', has_forced_fr_sub: true, forced_fr_sub_is_default: false } },
    );
    expect(counts).toMatchObject({ present: 1, absent: 1, tba: 1, vo: 1, vf: 1, sub_fr_not_default: 1, forced_fr_not_default: 1 });
  });

  it('charge la série à la première ouverture, puis se contente de replier', async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === '/api/library/9/episodes') return { seasons: [{ season_number: 1, episode_count: 1 }] };
      if (path === '/api/library/9/episodes/1') return { episodes: [{ episode_number: 1, title: 'Pilote' }] };
      if (path.endsWith('episodes-vf-status')) return { seasons: [{ season_number: 1, episodes: { 1: { status: 'vf' } } }] };
      return {};
    });
    const details = useAuditShowDetails();
    await details.toggle(9);
    expect(details.isExpanded(9)).toBe(true);
    expect(details.seasonsOf(9)[0].episodes[0]).toMatchObject({ episode: 1, title: 'Pilote', status: 'vf' });
    const calls = apiMock.mock.calls.length;
    await details.toggle(9);
    await details.toggle(9);
    expect(apiMock.mock.calls.length).toBe(calls);
  });

  it('marque la série en erreur si ses saisons sont introuvables', async () => {
    apiMock.mockRejectedValue(new Error('404'));
    const details = useAuditShowDetails();
    await details.toggle(3);
    expect(details.hasError(3)).toBe(true);
    expect(details.seasonsOf(3)).toEqual([]);
  });
});

describe('useVfUpgrades', () => {
  const suggestion = (id, status = 'pending', extra = {}) => ({ id, status, source_type: 'library_item', source_id: id, scope: 'movie', ...extra });

  it('compte les suggestions par état et les médias VO non renvoyés', async () => {
    apiMock.mockResolvedValueOnce({
      items: [suggestion(1), suggestion(2, 'waiting_release'), suggestion(3, 'downloading'), suggestion(4, 'failed'), suggestion(5, 'verified'), suggestion(6, 'dismissed', { is_ignored: true })],
      waiting_total: 4,
    });
    const upgrades = useVfUpgrades(vi.fn(), vi.fn());
    await upgrades.load();
    expect({
      pending: upgrades.pendingCount.value, waiting: upgrades.waitingReleaseCount.value, progress: upgrades.inProgressCount.value,
      failed: upgrades.failedCount.value, history: upgrades.historyCount.value, ignored: upgrades.ignoredCount.value,
    }).toEqual({ pending: 1, waiting: 1, progress: 1, failed: 1, history: 1, ignored: 1 });
    expect(upgrades.waitingTruncated.value).toBe(3);
  });

  it('ignorer retire la suggestion et propose de l’annuler', async () => {
    const undoable = vi.fn();
    const upgrades = useVfUpgrades(vi.fn(), undoable);
    upgrades.items.value = [suggestion(1), suggestion(2)];
    apiMock.mockResolvedValueOnce({});
    await upgrades.dismiss(upgrades.items.value[0]);
    expect(apiMock).toHaveBeenCalledWith('/api/vf-upgrades/1/dismiss', { method: 'POST' });
    expect(upgrades.items.value.map((item) => item.id)).toEqual([2]);
    expect(undoable).toHaveBeenCalledWith('Suggestion ignorée.', 'Annuler', expect.any(Function));
  });

  it('met à jour sur place une suggestion affichée, ignore les autres', () => {
    const upgrades = useVfUpgrades(vi.fn(), vi.fn());
    upgrades.items.value = [suggestion(1)];
    expect(upgrades.patchStatus(1, 'downloading', 'Radarr : envoyé')).toBe(true);
    expect(upgrades.items.value[0]).toMatchObject({ status: 'downloading', arr_message: 'Radarr : envoyé' });
    expect(upgrades.patchStatus(99, 'failed')).toBe(false);
  });
});

describe('useVfSelection', () => {
  it('décode une clé de groupe', () => {
    expect(mediaFromKey('request:12')).toEqual({ source_type: 'request', source_id: 12 });
  });

  it('bascule la sélection et envoie les médias choisis', async () => {
    const notify = vi.fn();
    const onScanned = vi.fn();
    const selection = useVfSelection(notify, onScanned);
    selection.toggle('library_item:1');
    selection.toggle('library_item:2');
    selection.toggle('library_item:2');
    selection.toggle('request:5');
    expect(selection.count.value).toBe(2);
    apiMock.mockResolvedValueOnce({ scanned: 2, found: 1 });
    await selection.scanSelected();
    expect(JSON.parse(apiMock.mock.calls[0][1].body)).toEqual({ media: [{ source_type: 'library_item', source_id: 1 }, { source_type: 'request', source_id: 5 }] });
    expect(notify).toHaveBeenCalledWith('2 recherche(s), 1 suggestion(s) trouvée(s).');
    expect(selection.count.value).toBe(0);
    expect(onScanned).toHaveBeenCalled();
    expect(selection.scanning.value).toBe(false);
  });

  it('ne lance rien sans sélection', async () => {
    const selection = useVfSelection(vi.fn(), vi.fn());
    await selection.scanSelected();
    expect(apiMock).not.toHaveBeenCalled();
  });
});

describe('useVfScanHistory', () => {
  it('suit le cycle en cours tant que l’onglet est ouvert, et s’arrête ensuite', async () => {
    vi.useFakeTimers();
    apiMock.mockImplementation(async (path) => (path.includes('scan-status') ? { status: 'running' } : { runs: [{ id: 1, status: 'running' }] }));
    const { result: history, stop } = inScope(() => useVfScanHistory(vi.fn()));
    history.activate();
    await vi.advanceTimersByTimeAsync(0);
    const statusCalls = () => apiMock.mock.calls.filter(([path]) => path.includes('scan-status')).length;
    expect(statusCalls()).toBe(1);
    await vi.advanceTimersByTimeAsync(6000);
    expect(statusCalls()).toBe(3);
    history.deactivate();
    await vi.advanceTimersByTimeAsync(9000);
    expect(statusCalls()).toBe(3);
    stop();
  });

  it('déplie un cycle et le replie au second clic', async () => {
    apiMock.mockResolvedValue({ items: [{ id: 'a' }], run: { id: 4, status: 'success' } });
    const { result: history, stop } = inScope(() => useVfScanHistory(vi.fn()));
    await history.toggleRun({ id: 4, status: 'success' });
    expect(history.expandedRunId.value).toBe(4);
    expect(history.runItems.value).toEqual([{ id: 'a' }]);
    await history.toggleRun({ id: 4, status: 'success' });
    expect(history.expandedRunId.value).toBeNull();
    expect(history.runItems.value).toEqual([]);
    stop();
  });
});
