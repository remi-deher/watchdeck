/* Regroupement d'une série quotidienne.
 *
 * Les périodes de l'activité vont jusqu'à tout l'historique : un point par jour finit
 * par se compter en milliers, ce qui rendait les graphiques illisibles — et, avec une
 * largeur minimale par barre, débordait la grille de plusieurs milliers de pixels.
 * Au-delà de quelques mois on passe donc à la semaine, puis au mois. */

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

export function grainFor(count: number): Grain {
  if (count > 750) return 'month';
  if (count > 120) return 'week';
  return 'day';
}

/** Début de la tranche à laquelle appartient une date (lundi pour la semaine). */
export function bucketStart(date: string, grain: Grain): string {
  if (grain === 'day') return date;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  if (grain === 'month') parsed.setDate(1);
  else parsed.setDate(parsed.getDate() - ((parsed.getDay() + 6) % 7));
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${parsed.getFullYear()}-${month}-${day}`;
}

export function monthLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
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
