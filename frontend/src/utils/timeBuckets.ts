/* Regroupement d'une série quotidienne.
 *
 * Les périodes de l'activité vont jusqu'à tout l'historique : un point par jour finit
 * par se compter en milliers, ce qui rendait les graphiques illisibles — et, avec une
 * largeur minimale par barre, débordait la grille de plusieurs milliers de pixels.
 * Au-delà de quelques mois on passe donc à la semaine, puis au mois. */
import { addDays, addMonths, eachDayOfInterval, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';

export type Grain = 'day' | 'week' | 'month';

export interface DailyValue {
  date: string;
  value: number;
}

export interface BucketedPoint {
  key: string;
  label: string;
  fullLabel: string;
  value: number;
}

/** Date civile locale, sans conversion UTC. */
export function localIso(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function monthBounds(date: Date): { start: Date; end: Date } {
  const start = startOfMonth(date);
  return { start, end: addMonths(start, 1) };
}

export interface CalendarDay {
  /** Date civile locale « AAAA-MM-JJ », clé des événements du jour. */
  date: string;
  /** Quantième affiché dans la cellule. */
  day: number;
  /** Faux pour les jours de débord, appartenant au mois précédent ou suivant. */
  current: boolean;
}

/** Six semaines de lundi à dimanche : la hauteur de la grille ne saute pas d'un mois
 *  à l'autre, et tout mois tient, y compris un février bissextile commençant un
 *  dimanche. */
const MONTH_GRID_CELLS = 42;

/**
 * Grille mensuelle, de la semaine du 1er à la semaine du dernier jour.
 *
 * Passe par `eachDayOfInterval` plutôt que par un décalage calculé à la main : autour
 * des changements d'heure, avancer d'un jour n'est pas ajouter vingt-quatre heures, et
 * une date construite ainsi pouvait tomber la veille au soir — donc porter la clé ISO
 * du mauvais jour.
 */
export function buildMonthGrid(month: Date): CalendarDay[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end: addDays(start, MONTH_GRID_CELLS - 1) });
  return days.map((date) => ({
    date: localIso(date),
    day: date.getDate(),
    current: isSameMonth(date, month),
  }));
}

export function grainFor(count: number): Grain {
  if (count > 750) return 'month';
  if (count > 120) return 'week';
  return 'day';
}

/** Début de la tranche à laquelle appartient une date (lundi pour la semaine). */
export function bucketStart(date: string, grain: Grain): string {
  if (grain === 'day') return date;
  let parsed = parseISO(date);
  if (Number.isNaN(parsed.getTime())) return date;
  if (grain === 'month') parsed.setDate(1);
  else parsed = startOfWeek(parsed, { weekStartsOn: 1 });
  return localIso(parsed);
}

export function monthLabel(date: string): string {
  return format(parseISO(date), 'MMM yy', { locale: fr });
}

/**
 * Regroupe une série quotidienne selon sa densité.
 *
 * `aggregate` vaut « sum » pour un décompte (des lectures s'additionnent) et « max »
 * pour un pic (deux flux simultanés lundi et deux mardi ne font pas quatre).
 */
export function bucketDaily(
  rows: DailyValue[],
  options: { aggregate?: 'sum' | 'max'; shortDate: (date: string) => string }
): { grain: Grain; points: BucketedPoint[] } {
  const grain = grainFor(rows.length);
  const buckets = new Map<string, number>();
  for (const row of rows) {
    const key = bucketStart(row.date, grain);
    const previous = buckets.get(key);
    const value = Number(row.value || 0);
    buckets.set(key, previous == null ? value : options.aggregate === 'max' ? Math.max(previous, value) : previous + value);
  }
  const points = [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, value]) => ({
      key: date,
      label: grain === 'month' ? monthLabel(date) : options.shortDate(date),
      fullLabel: grain === 'week' ? `Semaine du ${date}` : date,
      value,
    }));
  return { grain, points };
}
