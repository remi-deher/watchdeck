import { useTheme } from '@/composables/useTheme';
import { ArcElement, CategoryScale, Chart, DoughnutController, Filler, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip } from 'chart.js';

Chart.register(ArcElement, CategoryScale, DoughnutController, Filler, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip);

export { Chart };

const { resolved: theme } = useTheme();

/* Le canvas ne lit pas les variables CSS : on les resout ici. Lire `theme` rend le
   calcul reactif, si bien qu'un graphique se redessine quand le theme change. */
function cssVar(name: string): string {
  void theme.value;
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Encre du theme a l'opacite voulue (grilles, graduations). */
export function chartInk(alpha: number): string {
  const ink = cssVar('--ink') || '226 232 245';
  return `rgba(${ink.split(/\s+/).join(', ')}, ${alpha})`;
}

export function chartColor(value: string | undefined, fallback = '#e5a00d'): string {
  void theme.value;
  if (!value) return fallback;
  const match = value.match(/^var\((--[^,)]+)/);
  if (!match || typeof document === 'undefined') return value;
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || fallback;
}

export const chartPalette = ['#e5a00d', '#38bdf8', '#4ade80', '#c084fc', '#fb7185', '#facc15', '#2dd4bf', '#f97316', '#a3a3a3'];

/** Couleur des libelles d'axes : le texte secondaire du theme. */
export function chartMuted(): string {
  return cssVar('--muted') || '#9aa4ba';
}
