/* Ameliorations VF : ce que la page confie a ses gabarits. Les suggestions de release (*arr) et
   l'audit des pistes Plex sont a traiter (HandleTemplate) ; l'historique des cycles de scan
   est a comprendre (UnderstandTemplate). Fonctions pures : la vue ne fait qu'assembler. */
import type { HandleAction, HandleIssue, HandleItem, HandleUrgency } from '@/components/templates/handle/types';
import type { UnderstandDetail, UnderstandEvent, UnderstandOutcome } from '@/components/templates/understand/types';
import type { AuditItem, ScanRun, ScanRunItem } from '@/composables/vf/types';
import type { VfUpgradeGroup, VfUpgradeItem } from '@/types/vfUpgrades';
import { canFixStreams, runStatusLabel, statusLabel } from '@/utils/vfUpgradeLabels';

/* --- Releases et telechargements (*arr) --- */

export type UpgradeBucket = 'failed' | 'pending' | 'waiting_release' | 'in_progress' | 'history' | 'ignored';
/** Ce que la page montre par defaut : tout ce qui n'est ni archive ni ignore. */
export const OPEN_BUCKETS: readonly UpgradeBucket[] = ['failed', 'pending', 'waiting_release', 'in_progress'];

const ACTIVE_STATES = new Set(['accepted', 'downloading', 'importing', 'awaiting_verification']);
const BUCKET_LABELS: Record<UpgradeBucket, string> = {
  failed: 'Échecs',
  pending: 'À traiter',
  waiting_release: 'En attente de release',
  in_progress: 'En cours',
  history: 'Historique',
  ignored: 'Ignorés',
};
/* Les deux gestes de maintenance, portes par le type de probleme qu'ils concernent. */
const BUCKET_BULK: Partial<Record<UpgradeBucket, HandleAction>> = {
  failed: { key: 'recompute', label: 'Réouvrir les échecs', title: 'Remettre les suggestions en échec parmi celles à traiter' },
  history: { key: 'purge', label: 'Purger l’historique', title: 'Supprimer les entrées archivées' },
};
const BUCKET_URGENCY: Record<UpgradeBucket, HandleUrgency> = { failed: 'high', pending: 'medium', waiting_release: 'low', in_progress: 'low', history: 'low', ignored: 'low' };

export function itemBucket(item: Pick<VfUpgradeItem, 'status' | 'is_ignored'>): UpgradeBucket {
  if (item.is_ignored) return 'ignored';
  if (item.status === 'failed') return 'failed';
  if (item.status === 'pending') return 'pending';
  if (item.status === 'waiting_release') return 'waiting_release';
  if (ACTIVE_STATES.has(item.status)) return 'in_progress';
  return 'history';
}

/** Le groupe se range sous ce qui demande le plus d'attention parmi ses cibles. */
export function groupBucket(group: Pick<VfUpgradeGroup, 'items'>): UpgradeBucket {
  const order: UpgradeBucket[] = ['ignored', 'failed', 'pending', 'waiting_release', 'in_progress', 'history'];
  const buckets = new Set(group.items.map(itemBucket));
  return order.find((bucket) => buckets.has(bucket)) || 'history';
}

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** Le media dont la recherche se fait en un seul geste : un film, ou une serie entiere / une saison. */
export function searchTarget(group: VfUpgradeGroup): VfUpgradeItem | null {
  return group.items.find((item) => item.scope === 'movie' || item.scope === 'show')
    || group.items.find((item) => item.scope === 'season')
    || null;
}

export function upgradeGroupToHandle(group: VfUpgradeGroup, to: HandleItem['to']): HandleItem {
  const bucket = groupBucket(group);
  const counts = new Map<string, number>();
  for (const item of group.items) counts.set(item.status, (counts.get(item.status) || 0) + 1);
  const summary = [...counts.entries()].map(([status, count]) => `${count} ${statusLabel(status).toLowerCase()}`).join(' · ');
  const failure = group.items.find((item) => item.status === 'failed' && item.arr_message)?.arr_message;
  const isMovie = group.media?.media_type === 'movie';
  const releases = group.releaseCount;
  const searchLabel = releases > 1 ? `Voir les ${releases} releases` : releases === 1 ? 'Voir la release' : 'Rechercher une VF';
  const actions: HandleAction[] = bucket === 'ignored'
    ? [{ key: 'reactivate', label: 'Réactiver', title: 'Le scan de fond proposera de nouveau ce média' }]
    : bucket === 'in_progress' || bucket === 'history'
      ? []
      : [
        { key: 'search', label: bucket === 'failed' ? 'Chercher une autre release' : searchLabel, tone: 'primary' },
        { key: 'ignore', label: 'Ignorer', tone: 'danger', title: isMovie ? 'Ne plus proposer ce film au scan de fond' : 'Ne plus proposer cette série au scan de fond' },
      ];
  return {
    key: group.key,
    issue: bucket,
    urgency: BUCKET_URGENCY[bucket],
    title: group.media?.title || 'Média sans titre',
    subtitle: [isMovie ? 'Film' : 'Série', plural(group.items.length, 'cible', 'cibles')].join(' · '),
    problem: [summary, failure].filter(Boolean).join(' — '),
    proposal: releases > 0 && bucket !== 'in_progress' && bucket !== 'history' ? `${plural(releases, 'release VF disponible', 'releases VF disponibles')}` : undefined,
    poster: group.media?.poster_url || null,
    backdrop: group.media?.backdrop_url || null,
    to,
    actions,
  };
}

/** Les types de probleme : un par etat, dans l'ordre ou on les traite. `waitingMore` : medias VO suivis mais non listes. */
export function upgradeIssues(items: HandleItem[], waitingMore = 0): HandleIssue[] {
  return (['failed', 'pending', 'waiting_release', 'in_progress', 'history', 'ignored'] as UpgradeBucket[])
    .map((bucket) => {
      const count = items.filter((item) => item.issue === bucket).length;
      return {
        key: bucket,
        label: bucket === 'waiting_release' && waitingMore > 0 ? `${BUCKET_LABELS[bucket]} (+${waitingMore} non listés)` : BUCKET_LABELS[bucket],
        count,
        ...(BUCKET_BULK[bucket] ? { fixable: count, bulk: BUCKET_BULK[bucket] } : {}),
      } as HandleIssue;
    })
    .filter((issue) => issue.count > 0);
}

/* --- Alignement des pistes (Plex) --- */

const AUDIT_LABELS: Record<string, string> = {
  audio_secondary: 'Audio FR secondaire',
  forced_sub_not_default: 'Sous-titres forcés inactifs',
  sub_fr_not_default: 'Sous-titres VO inactifs',
  partial_vf: 'Série partiellement en VF',
};
const AUDIT_PROBLEMS: Record<string, string> = {
  audio_secondary: 'La piste française est présente mais n’est pas la piste par défaut.',
  forced_sub_not_default: 'Les sous-titres forcés français existent mais ne s’activent pas.',
  sub_fr_not_default: 'Les sous-titres français existent mais ne s’activent pas.',
  partial_vf: 'Certains épisodes n’ont pas de version française.',
};
const AUDIT_ORDER = ['audio_secondary', 'forced_sub_not_default', 'sub_fr_not_default', 'partial_vf'];

export function auditItemToHandle(item: AuditItem, to: HandleItem['to']): HandleItem {
  const issues = (item.issues || []).filter((issue) => AUDIT_LABELS[issue]);
  const main = AUDIT_ORDER.find((issue) => issues.includes(issue)) || issues[0] || 'other';
  const fixable = canFixStreams(item);
  const actions: HandleAction[] = [];
  if (fixable) actions.push({ key: 'align', label: 'Aligner les pistes', tone: 'primary', title: 'Prévisualiser puis appliquer l’alignement sur les profils Plex' });
  if (!item.has_vf || issues.includes('partial_vf')) actions.push({ key: 'search-vf', label: 'Chercher une VF', tone: fixable ? 'default' : 'primary' });
  if (['absent', 'no_track'].includes(String(item.sub_fr_status))) actions.push({ key: 'search-subtitles', label: 'Chercher des sous-titres' });
  return {
    key: `audit-${item.id}`,
    issue: main,
    urgency: main === 'partial_vf' ? 'low' : 'medium',
    title: item.title || 'Média sans titre',
    subtitle: [item.media_type === 'movie' ? 'Film' : 'Série', item.year].filter(Boolean).join(' · '),
    problem: issues.map((issue) => AUDIT_LABELS[issue]).join(' · ') || 'Pistes à vérifier',
    proposal: fixable ? 'Mettre la VF et les sous-titres français par défaut' : AUDIT_PROBLEMS[main],
    poster: item.poster_url || null,
    backdrop: item.backdrop_url || null,
    to,
    actions,
  };
}

export function auditIssues(items: AuditItem[]): HandleIssue[] {
  return AUDIT_ORDER
    .map((kind) => {
      const concerned = items.filter((item) => (AUDIT_ORDER.find((issue) => item.issues?.includes(issue)) || '') === kind);
      const fixable = concerned.filter((item) => canFixStreams(item)).length;
      return {
        key: kind,
        label: AUDIT_LABELS[kind],
        count: concerned.length,
        fixable,
        bulk: fixable ? { key: 'align-all', label: `Aligner les ${fixable}` } : undefined,
      } as HandleIssue;
    })
    .filter((issue) => issue.count > 0);
}

/* --- Historique des cycles de scan --- */

const TRIGGERS: Record<string, string> = { selection: 'Sélection manuelle', manual: 'Manuel' };
const triggerLabel = (trigger: unknown): string => TRIGGERS[String(trigger)] || 'Automatique';

const RUN_OUTCOME: Record<string, UnderstandOutcome> = { success: 'success', completed: 'success', degraded: 'warning', failed: 'failed', running: 'info' };
const runOutcome = (status: string): UnderstandOutcome => RUN_OUTCOME[status] || 'failed';

export function scanRunToEvent(run: ScanRun, live?: { items_scanned?: number; total_items?: number } | null): UnderstandEvent {
  const running = run.status === 'running';
  const scanned = running && live?.total_items ? live.items_scanned : run.tasks_scanned;
  const total = running && live?.total_items ? live.total_items : run.tasks_total;
  const errors = Number(run.tasks_errored || 0);
  return {
    key: String(run.id),
    at: String(run.started_at || ''),
    outcome: runOutcome(run.status),
    title: running ? 'Recherche VF en cours' : `Recherche VF · ${runStatusLabel(run.status).toLowerCase()}`,
    detail: [`${scanned ?? 0} / ${total ?? 0} recherche(s)`, `${run.suggestions_found ?? 0} suggestion(s)`, errors ? `${errors} erreur(s)` : ''].filter(Boolean).join(' · '),
    context: triggerLabel(run.trigger),
  };
}

const ITEM_OUTCOME: Record<string, UnderstandOutcome> = { found: 'success', error: 'failed', running: 'info' };
export function scanItemLabel(item: ScanRunItem): string {
  if (item.status === 'running') return 'En cours…';
  if (item.status === 'found') {
    const count = Number(item.release_count || 0);
    return `${count} release${count > 1 ? 's' : ''}`;
  }
  return item.status === 'error' ? 'Erreur' : 'Sans résultat';
}

export function scanRunDetail(run: ScanRun, items: ScanRunItem[], duration: string): UnderstandDetail {
  return {
    title: `Cycle de recherche VF n° ${run.id}`,
    subtitle: [triggerLabel(run.trigger), duration].filter(Boolean).join(' · '),
    outcome: runOutcome(run.status),
    cause: run.error ? String(run.error) : undefined,
    tags: [`${run.suggestions_found ?? 0} suggestion(s)`, `${run.tasks_scanned ?? 0} / ${run.tasks_total ?? 0} recherche(s)`],
    steps: items.map((item) => ({ label: `${item.title} · ${scanItemLabel(item)}`, outcome: ITEM_OUTCOME[String(item.status)] || 'info' })),
  };
}
