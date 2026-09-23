import { ArcElement, CategoryScale, Chart, DoughnutController, Filler, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip } from 'chart.js';

Chart.register(ArcElement, CategoryScale, DoughnutController, Filler, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip);

export { Chart };

export function chartColor(value: string | undefined, fallback = '#e5a00d'): string {
  if (!value) return fallback;
  const match = value.match(/^var\((--[^,)]+)/);
  if (!match || typeof document === 'undefined') return value;
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || fallback;
}

export const chartPalette = ['#e5a00d', '#38bdf8', '#4ade80', '#c084fc', '#fb7185', '#facc15', '#2dd4bf', '#f97316', '#a3a3a3'];
