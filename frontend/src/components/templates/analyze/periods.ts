/* Les periodes par defaut du gabarit « Analyser ». */
import type { AnalyzePeriod } from './types';

export const ANALYZE_PERIODS: Array<{ value: AnalyzePeriod | string | number; label: string }> = [
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '1y', label: '1 an' },
  { value: '5y', label: '5 ans' },
  { value: '10y', label: '10 ans' },
  { value: 'all', label: 'Tout' },
];
