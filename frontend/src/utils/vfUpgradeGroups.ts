import type { VfUpgradeItem, VfUpgradeGroup, VfUpgradeSeasonGroup } from '@/types/vfUpgrades';

const ACTIVE_STATES = new Set(['accepted', 'downloading', 'importing', 'awaiting_verification']);
const HISTORY_STATES = new Set(['verified', 'dismissed', 'grabbed']);

export function filterVfUpgradeItems(
  items: VfUpgradeItem[] = [],
  query = '',
  status = '',
  mediaType = ''
): VfUpgradeItem[] {
  const needle = query.trim().toLowerCase();
  return (items || []).filter((item) => {
    let statusMatches = true;
    if (status === 'pending') {
      statusMatches = item.status === 'pending';
    } else if (status === 'waiting_release') {
      statusMatches = item.status === 'waiting_release';
    } else if (status === 'in_progress' || status === 'downloading') {
      statusMatches = ACTIVE_STATES.has(item.status);
    } else if (status === 'failed') {
      statusMatches = item.status === 'failed';
    } else if (status === 'ignored') {
      statusMatches = Boolean(item.is_ignored);
    } else if (status === 'history' || status === 'verified') {
      // Un item ignore via le bouton serie passe par status='dismissed' comme un
      // dismiss manuel classique -- exclu d'ici pour ne vivre que dans l'onglet dedie.
      statusMatches = (HISTORY_STATES.has(item.status) && !item.is_ignored) || item.status === 'verified';
    } else if (status && status !== 'all') {
      statusMatches = item.status === status;
    }
    const mediaTypeMatches =
      !mediaType ||
      item.media?.media_type === mediaType ||
      (mediaType === 'movie' && item.scope === 'movie') ||
      (mediaType === 'show' && item.scope !== 'movie');
    const searchText = `${item.media?.title || ''} ${(item.releases || []).map((release: any) => release.title).join(' ')}`.toLowerCase();
    return statusMatches && mediaTypeMatches && (!needle || searchText.includes(needle));
  });
}

function targetOrder(item: VfUpgradeItem): number {
  if (item.scope === 'season') return -1;
  if (item.scope === 'episode') return item.episode_number ?? Number.MAX_SAFE_INTEGER;
  return 0;
}

export function groupVfUpgradeItems(items: VfUpgradeItem[] = []): VfUpgradeGroup[] {
  const groups = new Map<string, VfUpgradeGroup>();
  for (const item of items || []) {
    const key = `${item.source_type}:${item.source_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        source_type: item.source_type,
        source_id: item.source_id,
        media: item.media || null,
        items: [],
        seasons: [],
        releaseCount: 0,
      });
    }
    const group = groups.get(key)!;
    group.items.push(item);
    group.releaseCount += item.release_count || item.releases?.length || 0;
  }

  for (const group of groups.values()) {
    const seasons = new Map<string, { key: string; number: number | null; label: string; items: VfUpgradeItem[] }>();
    for (const item of group.items) {
      const seasonNumber = item.scope === 'movie' || item.scope === 'show' ? null : item.season_number ?? null;
      // scope 'show' (suggestion/attente portant sur la serie entiere, sans saison
      // precise) doit rester distinct de scope 'movie' -- les deux ont season_number
      // null, mais melanges dans le meme groupe une serie s'affichait comme "Film".
      const key = seasonNumber != null ? String(seasonNumber) : item.scope === 'movie' ? 'movie' : 'show';
      if (!seasons.has(key)) {
        seasons.set(key, {
          key,
          number: seasonNumber,
          label: seasonNumber != null ? `Saison ${seasonNumber}` : key === 'movie' ? 'Film' : 'Série',
          items: [],
        });
      }
      seasons.get(key)!.items.push(item);
    }
    group.seasons = [...seasons.values()]
      .sort((a, b) => (a.number ?? -1) - (b.number ?? -1))
      .map(
        (season): VfUpgradeSeasonGroup => {
          const sortedItems = season.items.sort((a, b) => targetOrder(a) - targetOrder(b));
          return {
            key: season.key,
            label: season.label,
            seasonNumber: season.number,
            season_number: season.number,
            items: sortedItems,
            episodes: sortedItems,
            // Repliee par defaut (voir SeasonEpisodeList) : une carte avec toutes ses
            // saisons/episodes deroules d'emblee etait le principal reproche de clarte
            // sur cet onglet -- l'utilisateur deplie ce qui l'interesse au clic.
            open: false,
          };
        }
      );
  }

  return [...groups.values()].sort((a, b) =>
    String(a.media?.title || '').localeCompare(String(b.media?.title || ''), 'fr')
  );
}
