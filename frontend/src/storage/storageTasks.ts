/* Taches de transfert du stockage : lecture des « jobs » du serveur pour les gabarits
   Suivre (en cours), Comprendre (historique) et Fiche (une tache). Fonctions pures. */
import type { TrackAction, TrackItem, TrackRecent, TrackState } from '@/components/templates/track/types';
import type { UnderstandDetail, UnderstandEvent, UnderstandOutcome } from '@/components/templates/understand/types';
import type { DetailAction, DetailAlert, DetailBadge } from '@/components/templates/detail/types';
import { transferMetrics } from '@/components/storage/transferMetrics';

export interface TaskContext {
  locationName: (id: number) => string;
  instanceName: (job: any) => string;
  status: (value: string) => string;
  gb: (value: any) => string;
  date: (value: any) => string;
  /** Adresse de la fiche d’une tâche (garde la vue courante). */
  taskTo: (id: number) => Record<string, any>;
}

const ISSUE_ITEMS = ['blocked', 'failed', 'deferred'];
const TERMINAL = ['completed', 'cancelled'];
const BLOCKED_JOBS = ['blocked', 'failed', 'cancel_blocked'];
const RUNNING_JOBS = ['running', 'finalizing', 'cancelling'];

export const isTerminal = (job: any) => TERMINAL.includes(job.status);
export const taskName = (job: any) => job.params?.name || `Tâche #${job.id}`;
export const issueItems = (job: any): any[] => (job.items || []).filter((item: any) => ISSUE_ITEMS.includes(item.status));

/** Etat de suivi d'une tache : ce qui demande d'agir d'abord. */
export function taskState(job: any): TrackState {
  if (job.status === 'completed') return 'completed';
  if (job.status === 'cancelled') return 'cancelled';
  if (BLOCKED_JOBS.includes(job.status) || issueItems(job).length) return 'blocked';
  if (RUNNING_JOBS.includes(job.status)) return 'running';
  if (['paused', 'stopped'].includes(job.status)) return 'paused';
  return 'waiting';
}

export function adviceFor(reason: string): string {
  if (/lecture|playing/i.test(reason)) return 'Attendre la fin de la lecture, puis reprendre.';
  if (/espace.*insuffisant|réserve.*insuffisante|capacity.*insufficient/i.test(reason)) return 'Libérer de la place à destination avant de réessayer.';
  if (/connexion|accès|accessible|rsync\/SSH/i.test(reason)) return 'Vérifier les services, les chemins et leurs accès avant de réessayer.';
  return 'Vérifier le motif et les chemins dans les détails avant de réessayer.';
}

/** Les motifs des titres a traiter, regroupes. */
export function issueReasons(job: any, status: (value: string) => string): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of issueItems(job)) {
    const reason = item.reason || status(item.status);
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return [...counts].map(([reason, count]) => ({ reason, count }));
}

/** Pause demandee ou en cours : l'action qui debloque ou suspend, selon l'etat. */
export function primaryCommand(job: any): { key: string; label: string } | null {
  if (isTerminal(job) || ['cancelling', 'cancel_blocked'].includes(job.status)) return null;
  if (job.status === 'draft') return { key: 'verify', label: 'Vérifier et lancer' };
  if (job.desired_state === 'run' && ['running', 'queued', 'finalizing'].includes(job.status)) return { key: 'pause', label: 'Mettre en pause' };
  if (['blocked', 'failed'].includes(job.status)) return { key: 'retry', label: 'Réessayer' };
  return { key: 'resume', label: 'Reprendre' };
}

const activeItem = (job: any) => (job.items || []).find((i: any) => ['prepared', 'copying', 'verifying', 'switching', 'plex_pending', 'cleaning', 'arr_pending'].includes(i.status));

/* Ce que la carte « en cours » sait du titre traite : fichier, episodes et saisons restants. */
function currentFacts(item: any, job: any): string[] {
  const facts: string[] = [];
  const progress = item.progress;
  if (item.status === 'copying' && progress?.file_size_bytes > 0) facts.push(`Fichier : ${Math.min(100, Math.round((progress.bytes || 0) / progress.file_size_bytes * 100))} %`);
  const counts = item.presentation?.remaining_counts;
  if (item.media_type === 'series' && job.params?.transfer_mode !== 'arr') {
    if (counts?.episodes != null) facts.push(`${counts.episodes} épisode(s) à finir`);
    if (counts?.seasons != null) facts.push(`${counts.seasons} saison(s) concernée(s)`);
  }
  return facts;
}

const rate = (value: number | null) => value ? `${(value / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo/s` : '';

/** Une tache en cours, pour le gabarit Suivre : l'action principale et l'annulation, le reste dans la fiche. */
export function taskTrackItem(job: any, ctx: TaskContext, busy = false): TrackItem {
  const state = taskState(job);
  const metrics = transferMetrics(job);
  const current = activeItem(job);
  const reasons = issueReasons(job, ctx.status);
  const command = primaryCommand(job);
  const actions: TrackAction[] = [];
  if (command) actions.push({ key: command.key, label: command.label, tone: 'primary', disabled: busy });
  if (!isTerminal(job) && job.status !== 'cancelling') actions.push({ key: 'cancel', label: job.status === 'cancel_blocked' ? 'Réessayer l’annulation' : 'Annuler', tone: 'danger', disabled: busy });
  const done = (job.items || []).filter((i: any) => i.status === 'completed').length;
  const tags = [`${done} / ${(job.items || []).length} titres`, ctx.gb(metrics.total)];
  return {
    key: String(job.id),
    state,
    title: taskName(job),
    subtitle: `${ctx.locationName(job.source_id)} → ${ctx.locationName(job.destination_id)} · ${ctx.instanceName(job)}`,
    media: current?.media ?? null,
    tags,
    progress: job.params?.transfer_mode === 'arr' || !metrics.total ? (job.items?.length ? done / job.items.length * 100 : null) : metrics.percent,
    step: ctx.status(current?.status || job.status),
    eta: metrics.seconds != null ? `≈ ${Math.max(1, Math.round(metrics.seconds / 60))} min` : undefined,
    note: current?.title && state === 'running' ? `${current.title}${metrics.rate ? ` · ${rate(metrics.rate)}` : ''}` : job.status === 'draft' ? 'Tâche enregistrée, aucun transfert lancé' : undefined,
    cause: state === 'blocked'
      ? {
        headline: job.error || (issueItems(job).length ? `${issueItems(job).length} titre(s) à traiter` : ctx.status(job.status)),
        reasons: reasons.map((r) => `${r.count} titre(s) : ${r.reason}`),
        hint: reasons[0] ? adviceFor(reasons[0].reason) : 'Consultez le détail de la tâche.',
      }
      : undefined,
    to: ctx.taskTo(job.id),
    actions,
    live: current ? { facts: [...tags, ...currentFacts(current, job)].map((label) => ({ key: label, label })) } : undefined,
  };
}

/** Les dernieres taches terminees, avant l'historique complet. */
export function taskRecent(job: any, ctx: TaskContext): TrackRecent {
  return {
    key: String(job.id),
    title: taskName(job),
    detail: `${ctx.status(job.status)} · ${ctx.gb(job.released_bytes || 0)} libérés`,
    failed: job.status === 'cancelled',
    to: ctx.taskTo(job.id),
  };
}

export const jobStart = (job: any) => (job.items || []).map((i: any) => i.progress?.started_at).filter(Boolean).sort()[0];
export const jobEnd = (job: any) => job.status === 'completed' ? (job.items || []).map((i: any) => i.progress?.finished_at).filter(Boolean).sort().at(-1) : null;

const OUTCOME: Record<string, UnderstandOutcome> = { completed: 'success', cancelled: 'warning' };

const iso = (value: any): string => {
  if (!value) return '';
  const text = String(value);
  return text.endsWith('Z') ? text : `${text}Z`;
};

/** Date de reference d'un evenement d'historique : la fin, sinon la derniere activite. */
const eventDate = (job: any) => iso(jobEnd(job) || job.updated_at || job.created_at) || '1970-01-01T00:00:00Z';

const episodeRecap = (job: any): string => {
  const series = (job.items || []).filter((i: any) => i.status === 'completed' && i.media_type === 'series');
  if (!series.length || !series.every((i: any) => i.presentation?.counts?.episodes != null)) return '';
  const sum = (key: string) => series.reduce((n: number, i: any) => n + i.presentation.counts[key], 0);
  return `${sum('episodes')} épisodes · ${sum('seasons')} saisons`;
};

export function taskEvent(job: any, ctx: TaskContext): UnderstandEvent {
  const done = (job.items || []).filter((i: any) => i.status === 'completed');
  const movies = done.filter((i: any) => i.media_type === 'movie').length;
  const series = done.filter((i: any) => i.media_type === 'series').length;
  return {
    key: String(job.id),
    at: eventDate(job),
    outcome: OUTCOME[job.status] || 'info',
    title: taskName(job),
    detail: [`${movies} film(s) · ${series} série(s)`, episodeRecap(job), `${ctx.gb(job.released_bytes || 0)} libérés`].filter(Boolean).join(' · '),
    tags: [ctx.status(job.status)],
    context: `${ctx.locationName(job.source_id)} → ${ctx.locationName(job.destination_id)}`,
  };
}

const averageRate = (job: any) => {
  const seconds = (job.items || []).reduce((n: number, i: any) => n + (i.progress?.copy_seconds || 0), 0);
  const bytes = (job.items || []).reduce((n: number, i: any) => n + (i.progress?.measured_copy_bytes || 0), 0);
  return seconds > 0 ? `${(bytes / seconds / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo/s` : 'Non mesuré';
};

export function taskDetail(job: any, ctx: TaskContext): UnderstandDetail {
  const start = jobStart(job), end = jobEnd(job);
  return {
    title: taskName(job),
    subtitle: `Tâche #${job.id} · ${ctx.instanceName(job)}`,
    outcome: OUTCOME[job.status] || 'info',
    cause: job.error || undefined,
    tags: [ctx.status(job.status)],
    comparison: [
      { label: 'Trajet', before: ctx.locationName(job.source_id), after: ctx.locationName(job.destination_id) },
      { label: 'Espace libéré', before: '—', after: ctx.gb(job.released_bytes || 0) },
      { label: 'Débit moyen (copie)', before: '—', after: averageRate(job) },
      { label: 'Début / fin', before: start ? ctx.date(start) : 'Non enregistré', after: end ? ctx.date(end) : 'Non enregistrée' },
    ],
    links: [{ label: 'Ouvrir la tâche', to: ctx.taskTo(job.id) }],
    action: { key: 'relaunch', label: 'Relancer' },
  };
}

/** En-tete de la fiche d'une tache. */
export function taskBadges(job: any, ctx: TaskContext): DetailBadge[] {
  const tone = job.status === 'completed' ? 'success' : BLOCKED_JOBS.includes(job.status) ? 'warning' : 'neutral';
  const badges: DetailBadge[] = [{ key: 'status', label: ctx.status(job.status), tone }];
  if (job.work?.label) badges.push({ key: 'work', label: job.work.label, tone: 'info' });
  return badges;
}

export function taskActions(job: any): DetailAction[] {
  const terminal = isTerminal(job);
  const command = primaryCommand(job);
  const actions: DetailAction[] = [];
  if (terminal) actions.push({ key: 'relaunch', label: 'Relancer' }, { key: 'edit', label: 'Modifier' });
  else if (command) actions.push({ key: command.key, label: command.label });
  if (job.status === 'draft') actions.push({ key: 'edit', label: 'Modifier', menu: true });
  if (!terminal && job.status !== 'cancelling') actions.push({ key: 'cancel', label: job.status === 'cancel_blocked' ? 'Réessayer l’annulation' : 'Annuler la tâche', menu: true });
  if (!terminal && !['cancelling', 'cancel_blocked', 'draft'].includes(job.status)) actions.push({ key: 'retry-items', label: 'Réessayer les titres en erreur', menu: true, disabled: job.status === 'running' });
  actions.push({ key: 'duplicate', label: 'Créer une copie', menu: true });
  actions.push({ key: 'remove', label: job.status === 'draft' ? 'Supprimer le brouillon' : 'Supprimer la tâche', menu: true, danger: true, separated: true });
  return actions;
}

export function taskAlert(job: any, ctx: TaskContext): DetailAlert | null {
  if (job.error) return { tone: 'danger', message: job.error };
  if (job.params?.delete_after_cancel) return { tone: 'info', message: 'Suppression demandée : en attente de l’annulation sûre et du nettoyage.' };
  const issues = issueItems(job).length;
  if (issues) return { tone: 'warning', message: `${issues} titre(s) à traiter. Les motifs et chemins sont dans l’onglet Titres.`, link: { label: 'Voir les titres', tab: 'titles' } };
  if (job.status === 'cancelling') return { tone: 'info', message: 'Arrêt de la copie et nettoyage des fichiers temporaires. Les copies complètes restent conservées.' };
  if (!isTerminal(job) && job.status !== 'draft' && job.desired_state !== 'run' && job.desired_state !== 'cancel') {
    return { tone: 'info', message: `${job.desired_state === 'pause' ? 'Pause' : 'Arrêt'} demandé : ${job.params?.transfer_mode === 'arr' ? 'les prochains titres sont suspendus ; une copie Arr déjà lancée peut continuer.' : 'les fichiers partiels restent conservés.'}` };
  }
  void ctx;
  return null;
}
