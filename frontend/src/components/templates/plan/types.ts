/* Gabarit « Anticiper » : evenements, etats et periode. */
import { addDays, startOfWeek } from 'date-fns';
import { monthBounds } from '@/utils/timeBuckets';

export type PlanView = 'agenda' | 'week' | 'month';

export interface PlanEvent {
  key: string;
  /** Date (ISO) ; minuit pile = sans heure. */
  date: string;
  title: string;
  subtitle?: string;
  /** Cle de l'etat (`PlanState.key`). */
  state: string;
  /** Icone du type (sortie cinema, streaming, physique, episode…). */
  icon?: any;
  poster?: string | null;
  [key: string]: any;
}

export interface PlanState {
  key: string;
  label: string;
  /** Couleur (variable CSS), partagee par la legende, la grille et la semaine. */
  color: string;
  /** Rappele en toutes lettres dans la semaine (« En retard »). */
  emphasize?: boolean;
}

/** La periode a charger pour une vue et une date. */
export function periodBounds(view: PlanView, cursor: Date): { start: Date; end: Date } {
  if (view === 'week') {
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    return { start, end: addDays(start, 7) };
  }
  return monthBounds(cursor);
}

