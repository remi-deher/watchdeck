import { parseApiDate } from '@/utils/format';
/* Libelles et classes d'etat de la page « Ameliorations VF & Flux ».
 *
 * Fonctions pures, extraites telles quelles de VfUpgradesView : elles ne dependent que
 * de leurs arguments (et de l'heure courante pour les durees), ce qui permet de les
 * tester sans monter la vue.
 */
import type { VfUpgradeItem } from '@/types/vfUpgrades';
import type { AuditItem, ForcedStatus, SubtitleStatus } from '@/composables/vf/types';

export const VF_STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'pending', label: 'À traiter' },
  { value: 'waiting_release', label: 'En attente de release' },
  { value: 'accepted', label: 'Accepté par *arr' },
  { value: 'downloading', label: 'Téléchargement' },
  { value: 'importing', label: 'Import' },
  { value: 'awaiting_verification', label: 'Validation Plex' },
  { value: 'verified', label: 'VF validée' },
  { value: 'failed', label: 'Échec' },
  { value: 'dismissed', label: 'Ignoré' },
  { value: 'ignored', label: 'Ignoré' },
];

export function statusLabel(value: string): string {
  return VF_STATUS_OPTIONS.find((entry) => entry.value === value)?.label || value;
}

export function targetLabel(item: Pick<VfUpgradeItem, 'scope' | 'episode_number'>): string {
  if (item.scope === 'movie') return 'Film';
  if (item.scope === 'season') return 'Saison entière';
  if (item.scope === 'show') return 'Série complète';
  return `Épisode ${String(item.episode_number).padStart(2, '0')}`;
}

/** « Rechercher VF » tant qu'aucune release n'existe, sinon le nombre de releases. */
export function releaseButtonLabel(item: Pick<VfUpgradeItem, 'status' | 'release_count'>): string {
  if (item.status === 'waiting_release') return 'Rechercher VF';
  const count = item.release_count || 1;
  return `${count} release${count > 1 ? 's' : ''}`;
}

export function formatBackoff(backoff?: { misses: number; next_check_at?: string | null } | null, now = Date.now()): string {
  if (!backoff) return '';
  const nextCheck = backoff.next_check_at ? parseApiDate(backoff.next_check_at) : null;
  if (!nextCheck) return `${backoff.misses} recherche(s) sans résultat`;
  const diffMs = nextCheck.getTime() - now;
  if (diffMs <= 0) return `${backoff.misses} échec(s) — nouvelle tentative au prochain cycle`;
  const hours = Math.round(diffMs / 3_600_000);
  return `${backoff.misses} échec(s) — prochaine tentative dans ${hours < 1 ? '< 1h' : `~${hours}h`}`;
}

export function runStatusLabel(status: string): string {
  if (status === 'running') return 'En cours';
  if (status === 'success') return 'Terminé';
  /* « degraded » : le cycle s'est terminé mais toutes ses recherches ont échoué
     techniquement (indexeurs injoignables) -- à ne pas confondre avec un cycle qui
     n'a simplement rien trouvé. */
  if (status === 'degraded') return 'Indexeurs injoignables';
  return 'Échec';
}

export function formatRunDuration(startedAt?: string | null, finishedAt?: string | null, now = Date.now()): string {
  if (!startedAt) return '—';
  const start = parseApiDate(startedAt);
  const end = finishedAt ? parseApiDate(finishedAt).getTime() : now;
  const seconds = Math.max(0, Math.round((end - start.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${String(seconds % 60).padStart(2, '0')}s`;
}

export function audioStatusLabel(item: Pick<AuditItem, 'has_vf' | 'fr_is_default'>): string {
  if (!item.has_vf) return 'Absente (VO)';
  return item.fr_is_default ? 'Présente (par défaut)' : 'Piste secondaire';
}

export function audioRowClass(item: Pick<AuditItem, 'has_vf' | 'fr_is_default'>): string {
  if (!item.has_vf) return 'is-muted';
  return item.fr_is_default ? 'is-ok' : 'is-warning';
}

export function subtitleStatusLabel(status: SubtitleStatus): string {
  switch (status) {
    case 'ok': return 'Complets par défaut';
    case 'not_default': return 'Présents (inactifs)';
    case 'forced_default': return 'Présents (marqués forcés)';
    case 'forced_not_default': return 'Présents (forcés inactifs)';
    case 'absent': return 'Absents';
    case 'no_track': return 'Aucune piste (possiblement brûlés)';
    default: return 'Non analysé';
  }
}

export function subtitleRowClass(item: Pick<AuditItem, 'sub_fr_status'>): string {
  if (item.sub_fr_status === 'ok' || item.sub_fr_status === 'forced_default') return 'is-ok';
  if (item.sub_fr_status === 'not_default' || item.sub_fr_status === 'forced_not_default') return 'is-warning';
  if (item.sub_fr_status === 'absent') return 'is-danger';
  return 'is-muted';
}

export function forcedStatusLabel(status: ForcedStatus): string {
  switch (status) {
    case 'ok': return 'Activés par défaut';
    case 'not_default': return 'Présents mais inactifs';
    default: return 'Aucun';
  }
}

export function forcedRowClass(item: Pick<AuditItem, 'forced_fr_status'>): string {
  if (item.forced_fr_status === 'ok') return 'is-ok';
  if (item.forced_fr_status === 'not_default') return 'is-warning';
  return 'is-muted';
}

/** Un media peut etre realigne sur Plex s'il a une VF ou une piste mal activee. */
export function canFixStreams(item?: Pick<AuditItem, 'has_vf' | 'issues'> | null): boolean {
  if (!item) return false;
  return Boolean(
    item.has_vf ||
    item.issues?.includes('audio_secondary') ||
    item.issues?.includes('forced_sub_not_default') ||
    item.issues?.includes('sub_fr_not_default')
  );
}
