// Formatage fr-FR partagé par toute l'app.
import { differenceInMinutes, format as formatDateFns, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

const LOCALE = 'fr-FR';
/* Le serveur stocke ses instants en UTC sans fuseau (« 2026-09-24T18:10:32 »). Lue
   telle quelle, une telle date passe pour une heure LOCALE : toutes les heures
   s'affichaient avec une a deux heures de retard (l'ecart d'heure d'ete). Une date avec
   heure mais sans fuseau est donc lue en UTC ; une date seule (« 2026-09-24 », sortie
   d'un film) reste un jour civil, et une valeur qui porte deja son fuseau est respectee. */
const API_DATETIME_WITHOUT_ZONE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
export function parseApiDate(value: string | number | Date): Date {
  if (typeof value !== 'string') return new Date(value);
  const text = value.trim();
  return parseISO(API_DATETIME_WITHOUT_ZONE.test(text) ? `${text.replace(' ', 'T')}Z` : text);
}
const asDate = parseApiDate;
const renderDate = (value: string | number | Date, pattern: string): string => formatDateFns(asDate(value), pattern, { locale: fr });

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Date + heure, format long (« 4 août 2026 à 14:30 »). Le plus courant dans l'app. */
export function formatDateTime(value?: string | number | Date | null, empty = '-'): string {
  return value ? renderDate(value, 'd MMM yyyy, HH:mm') : empty;
}

/** Date + heure, format compact (« 04/08/2026 14:30 ») — tableaux et journaux. */
export function formatDateTimeShort(value?: string | number | Date | null, empty = '-'): string {
  return value ? renderDate(value, 'dd/MM/yyyy HH:mm') : empty;
}

/** Date + heure à la seconde — suivi d'exécution des tâches planifiées. */
export function formatDateTimeSeconds(value?: string | number | Date | null, empty = '-'): string {
  return value ? renderDate(value, 'dd/MM/yyyy HH:mm:ss') : empty;
}

/** Date relative courte (« à l'instant », « il y a 5 min », « il y a 3 h », « il y a 2 j »). */
export function formatRelativeDate(value?: string | number | Date | null, empty = '-'): string {
  if (!value) return empty;
  const minutes = differenceInMinutes(new Date(), asDate(value));
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days} j`;
  return formatDateShort(value);
}

/** Date seule, format long (« 4 août 2026 »). */
export function formatDate(value?: string | number | Date | null, empty = '-'): string {
  return value ? renderDate(value, 'd MMM yyyy') : empty;
}

/** Date seule avec mois non abrégé (« 4 août 2026 »). */
export function formatDateLong(value?: string | number | Date | null, empty = '-'): string {
  return value ? renderDate(value, 'd MMMM yyyy') : empty;
}

/** Date seule, format compact (« 04/08/2026 »). */
export function formatDateShort(value?: string | number | Date | null, empty = '-'): string {
  return value ? renderDate(value, 'dd/MM/yyyy') : empty;
}

/** Jour/mois d'une date nue (« 04/08 ») — axes de graphiques. */
export function formatDayMonth(value?: string | null, empty = ''): string {
  return value ? renderDate(value, 'dd/MM') : empty;
}

/** Date nue en clair (« mardi 4 août ») — infobulles et en-têtes de calendrier. */
export function formatLongDay(
  value?: string | number | Date | null,
  options: { weekday?: 'long'; day?: 'numeric'; month?: 'long' | 'short'; year?: 'numeric' } = { weekday: 'long', day: 'numeric', month: 'long' }
): string {
  if (!value) return '';
  const year = options.year ? ' yyyy' : '';
  const pattern = options.weekday ? `EEEE d MMMM${year}` : options.month === 'short' ? `d MMM${year}` : `d MMMM${year}`;
  return renderDate(value, pattern);
}

/** Date en clair sans jour de semaine (« 4 août 2026 ») — sorties à venir. */
export function formatReleaseDate(value?: string | number | Date | null, empty = '-'): string {
  return value ? renderDate(value, 'd MMM yyyy') : empty;
}

/** Heure seule (« 14:30 »). */
export function formatTime(value?: string | number | Date | null, empty = '-'): string {
  return value ? renderDate(value, 'HH:mm') : empty;
}

/** Date d'épisode, avec heure seulement lorsqu'elle est fournie. */
export function formatAirDate(value?: string | null): string {
  if (!value) return '';
  const date = asDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const datePart = renderDate(date, 'dd MMM yyyy');
  return value.includes('T') ? `${datePart} a ${renderDate(date, 'HH:mm')}` : datePart;
}

/** Mois et année (« août 2026 ») — en-tête du calendrier. */
export function formatMonthYear(value?: string | number | Date | null): string {
  return value ? renderDate(value, 'MMMM yyyy') : '';
}

// ---------------------------------------------------------------------------
// Durées
// ---------------------------------------------------------------------------

/** Durée en minutes puis heures, sans « 0 min » superflu (« 45 min », « 2 h », « 2 h 5 min »). */
export function formatDuration(ms?: number | null): string {
  const minutes = Math.round((ms || 0) / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h${rest ? ` ${rest} min` : ''}`;
}

/** Idem, mais les minutes sont toujours affichées (« 2 h 0 min ») — historique de lectures. */
export function formatDurationExact(ms?: number | null): string {
  const minutes = Math.round((ms || 0) / 60000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** Durée exprimée en heures décimales (« 3,4 h ») — classements par temps cumulé. */
export function formatDurationHours(ms?: number | null): string {
  const hours = (ms || 0) / 3600000;
  return hours < 1 ? `${Math.round(hours * 60)} min` : `${formatNumber(hours)} h`;
}

/** Durée arrondie à l'heure entière (« 1 240 h ») — volumes cumulés des insights. */
export function formatDurationRoundHours(ms?: number | null): string {
  return `${formatInteger(Math.round((ms || 0) / 3600000))} h`;
}

/** Durée technique courte (« 840 ms », « 2.4 s ») — temps d'exécution d'une tâche. */
export function formatElapsed(ms?: number | null, empty = '-'): string {
  if (ms == null) return empty;
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

// ---------------------------------------------------------------------------
// Tailles, débits, nombres
// ---------------------------------------------------------------------------

/** Taille en Go/To (« 42.5 Go », « 1.3 To »). */
export function formatBytes(bytes?: number | null): string {
  if (!bytes) return '0 Go';
  const gigabytes = bytes / (1024 * 1024 * 1024);
  return gigabytes > 1024 ? `${(gigabytes / 1024).toFixed(1)} To` : `${gigabytes.toFixed(1)} Go`;
}

/** Taille sur l'échelle complète (« 512 Ko », « 4,2 Go ») — inventaire des fichiers. */
export function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${formatNumber(bytes / 1024 ** exponent)} ${units[exponent]}`;
}

/** Débit converti de kb/s en Mb/s (« 12,4 Mb/s »). */
export function formatBandwidth(kbps?: number | null, empty = '—'): string {
  return kbps ? `${formatNumber(kbps / 1000)} Mb/s` : empty;
}

/** Nombre localisé, au plus une décimale. */
export function formatNumber(value?: number | string | null): string {
  return Number(value || 0).toLocaleString(LOCALE, { maximumFractionDigits: 1 });
}

/** Nombre localisé avec séparateur de milliers, sans arrondi imposé (« 12 480 »). */
export function formatInteger(value?: number | string | null): string {
  return Number(value || 0).toLocaleString(LOCALE);
}

/** Pourcentage signé (« +12,5 % », « -3 % ») — comparaisons de période. */
export function signedPercent(value?: number | string | null): string {
  const number = Number(value || 0);
  return `${number > 0 ? '+' : ''}${formatNumber(number)} %`;
}

/** Durée d’un cycle, en secondes puis minutes, à partir de ses instants. */
export function formatRunDuration(startedAt?: string | null, finishedAt?: string | null, now = Date.now()): string {
  if (!startedAt) return '—';
  const seconds = Math.max(0, Math.round(((finishedAt ? parseApiDate(finishedAt).getTime() : now) - parseApiDate(startedAt).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
}

/** Compte à rebours d’une tâche, exprimé en secondes. */
export function formatCountdown(seconds?: number | null): string {
  if (seconds == null) return '-';
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)} min`;
}

export function timecode(ms: number | null | undefined): string {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

export function formatTorrentBytes(value: number): string {
  const bytes = Number(value || 0);
  if (!bytes) return '—';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const rank = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** rank).toFixed(rank > 2 ? 1 : 0)} ${units[rank]}`;
}

export function formatEtaSeconds(value: number): string {
  const seconds = Number(value || 0);
  if (!seconds || seconds >= 8640000) return '—';
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export function formatTimestamp(val: number | string): string {
  if (!val) return '—';
  let date: number | string = val;
  if (typeof val === 'number') {
    date = val > 1e11 ? val : val * 1000;
  }
  return formatDateTime(date);
}

export function formatPreciseBytes(bytes: number): string {
  if (!bytes) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0)} ${units[i]}`;
}

export function formatByteRate(bytesPerSec: number): string {
  if (!bytesPerSec) return '0 o/s';
  const units = ['o/s', 'Ko/s', 'Mo/s', 'Go/s'];
  const i = Math.min(Math.floor(Math.log(bytesPerSec) / Math.log(1024)), units.length - 1);
  return `${(bytesPerSec / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

export function formatImportSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let value = bytes, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1).replace('.', ',')} ${units[unit]}`;
}

export function formatSeconds(value: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(value) || 0));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min ${String(total % 60).padStart(2, '0')}`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

export function formatBuffer(ms: number | null | undefined): string {
  const seconds = Math.max(0, Math.round((ms || 0) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes >= 10 || !rest) return `${minutes} min`;
  return `${minutes} min ${rest} s`;
}

export function formatTransferDuration(seconds: number | null) {
  if (seconds == null) return '—';
  const minutes = Math.ceil(seconds / 60);
  return seconds<60?`${Math.ceil(seconds)} s`:minutes<60?`${minutes} min`:`${Math.floor(minutes/60)} h${minutes%60?` ${minutes%60} min`:''}`;
}

export const formatStorageDuration = (seconds:number)=>seconds<60?`${Math.ceil(seconds)} s`:seconds<3600?`${Math.ceil(seconds/60)} min`:`${Math.floor(seconds/3600)} h ${Math.ceil(seconds%3600/60)} min`;

/** Heure à la seconde pour les contrôles et événements techniques. */
export function formatTimeSeconds(value?: string | number | Date | null): string {
  return value ? renderDate(value, 'HH:mm:ss') : '';
}

export function formatUptime(startedAt: string | undefined, now: Date): string {
  if (!startedAt) return '';
  const minutes = Math.floor((now.getTime() - parseApiDate(startedAt).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return '';
  if (minutes < 60) return `actif depuis ${Math.max(1, minutes)} min`;
  if (minutes < 48 * 60) return `actif depuis ${Math.floor(minutes / 60)} h`;
  return `actif depuis ${Math.floor(minutes / 1440)} j`;
}

export function formatCheckedAgo(checkedAt: Date, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - checkedAt.getTime()) / 1000));
  if (seconds < 60) return 'Vérifié à l’instant';
  if (seconds < 3600) return `Vérifié il y a ${Math.floor(seconds / 60)} min`;
  return `Vérifié il y a ${Math.floor(seconds / 3600)} h`;
}

/** Volume décimal utilisé par l’inventaire des stockages. */
export function formatDecimalGigabytes(bytes: number): string {
  return `${(bytes / 1e9).toFixed(2)} Go`;
}

export function formatNextRun(next: Date, now: Date): string {
  const minutes = Math.round((next.getTime() - now.getTime()) / 60000);
  if (minutes <= 0) return 'imminente';
  if (minutes < 60) return `dans ${minutes} min`;
  if (minutes < 24 * 60 && next.getDate() === now.getDate()) return `dans ${Math.round(minutes / 60)} h`;
  const time = formatTime(next);
  return minutes < 48 * 60 ? `demain ${time}` : formatLongDay(next, { day: 'numeric', month: 'short' }) + ` ${time}`;
}
