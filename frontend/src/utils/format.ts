// Formatage fr-FR partagé par toute l'app.

const LOCALE = 'fr-FR';

const dateTimeFormatter = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, options);

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Date + heure, format long (« 4 août 2026 à 14:30 »). Le plus courant dans l'app. */
export function formatDateTime(value?: string | number | Date | null, empty = '-'): string {
  return value ? dateTimeFormatter({ dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : empty;
}

/** Date + heure, format compact (« 04/08/2026 14:30 ») — tableaux et journaux. */
export function formatDateTimeShort(value?: string | number | Date | null, empty = '-'): string {
  return value ? dateTimeFormatter({ dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : empty;
}

/** Date + heure à la seconde — suivi d'exécution des tâches planifiées. */
export function formatDateTimeSeconds(value?: string | number | Date | null, empty = '-'): string {
  return value ? dateTimeFormatter({ dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : empty;
}

/** Date relative courte (« à l'instant », « il y a 5 min », « il y a 3 h », « il y a 2 j »). */
export function formatRelativeDate(value?: string | number | Date | null, empty = '-'): string {
  if (!value) return empty;
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
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
  return value ? dateTimeFormatter({ dateStyle: 'medium' }).format(new Date(value)) : empty;
}

/** Date seule, format compact (« 04/08/2026 »). */
export function formatDateShort(value?: string | number | Date | null, empty = '-'): string {
  return value ? dateTimeFormatter({ dateStyle: 'short' }).format(new Date(value)) : empty;
}

const atNoon = (day: string | number | Date) => new Date(`${day}T12:00:00`);

/** Jour/mois d'une date nue (« 04/08 ») — axes de graphiques. */
export function formatDayMonth(value?: string | null, empty = ''): string {
  return value ? dateTimeFormatter({ day: '2-digit', month: '2-digit' }).format(atNoon(value)) : empty;
}

/** Date nue en clair (« mardi 4 août ») — infobulles et en-têtes de calendrier. */
export function formatLongDay(
  value?: string | null,
  options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }
): string {
  return value ? dateTimeFormatter(options).format(atNoon(value)) : '';
}

/** Date en clair sans jour de semaine (« 4 août 2026 ») — sorties à venir. */
export function formatReleaseDate(value?: string | number | Date | null, empty = '-'): string {
  return value ? dateTimeFormatter({ day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : empty;
}

/** Heure seule (« 14:30 »). */
export function formatTime(value?: string | number | Date | null, empty = '-'): string {
  return value ? dateTimeFormatter({ hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : empty;
}

/** Mois et année (« août 2026 ») — en-tête du calendrier. */
export function formatMonthYear(value?: string | number | Date | null): string {
  return value ? dateTimeFormatter({ month: 'long', year: 'numeric' }).format(new Date(value)) : '';
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
