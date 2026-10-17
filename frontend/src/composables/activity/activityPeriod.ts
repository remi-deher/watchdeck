/* Activité : la période d'analyse (choix proposés, libellé long) et la comparaison avec la
   période précédente. Données et fonctions pures. */
import { signedPercent } from '@/utils/format';

// « Tout » est demande comme un siecle (MAX_PERIOD_DAYS cote API) plutot que comme un
// parametre absent : le service garde un seul chemin de calcul, borne. Les libelles
// restent courts car le selecteur partage la rangee de la barre du haut.
export const ALL_TIME_DAYS = 36500;
export const periodOptions = [
  { value: 7, label: '7 j' },
  { value: 30, label: '30 j' },
  { value: 90, label: '90 j' },
  { value: 365, label: '1 an' },
  { value: 730, label: '2 a' },
  { value: 1095, label: '3 a' },
  { value: 1825, label: '5 a' },
  { value: 3650, label: '10 a' },
  { value: ALL_TIME_DAYS, label: 'Tout' },
];
export const periodChoices = periodOptions.map((option) => ({ value: String(option.value), label: option.label }));

/** « sur 36500 jours » n'a aucun sens a l'ecran : chaque periode a son libelle long. */
export function periodLabelOf(value: number): string {
  if (value >= ALL_TIME_DAYS) return 'tout l’historique';
  if (value >= 365 && value % 365 === 0) {
    const years = value / 365;
    return `${years} an${years > 1 ? 's' : ''}`;
  }
  return `${value} jours`;
}

export function comparisonLabel(value: number): string {return `${signedPercent(value)} vs période précédente`}
// Les cartes de tete portent la tendance : sans comparaison disponible, aucun chevron
// plutot qu'un « stable » qui affirmerait une mesure qu'on n'a pas faite.
export function trendOf(change?: number|null): {direction: string; label: string}|null {
  if(change==null)return null;
  return {direction:change>0?'up':change<0?'down':'stable',label:comparisonLabel(change)};
}
