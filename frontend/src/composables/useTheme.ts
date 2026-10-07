import { computed, ref, watch } from 'vue';
import { usePreference } from './usePreference';

export type ThemeChoice = 'system' | 'dark' | 'light';

export const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Système' },
  { value: 'dark', label: 'Sombre' },
  { value: 'light', label: 'Clair' },
];

/* Couleur de la barre d'etat mobile : le fond (`--bg`) de chaque theme. */
const THEME_COLORS = { dark: '#0c0e14', light: '#f4f2ed' } as const;

export const PALETTE_OPTIONS = [
  { value: 'cinema', label: 'Cinéma' },
  { value: 'mint', label: 'Menthe' },
  { value: 'ocean', label: 'Océan' },
  { value: 'lavender', label: 'Lavande' },
  { value: 'graphite', label: 'Graphite' },
] as const;
export type ThemePalette = typeof PALETTE_OPTIONS[number]['value'];
const storedPalette = usePreference<string>('palette', 'cinema');
const palette = computed<ThemePalette>({
  get: () => PALETTE_OPTIONS.some(p => p.value === storedPalette.value) ? storedPalette.value as ThemePalette : 'cinema',
  set: value => { storedPalette.value = value; },
});

const choice = usePreference<ThemeChoice>('theme', 'system');
const systemLight = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: light)')
  : null;

const systemIsLight = ref(systemLight?.matches ?? false);

function effectiveTheme(value: ThemeChoice): 'dark' | 'light' {
  if (value === 'dark' || value === 'light') return value;
  return systemIsLight.value ? 'light' : 'dark';
}

/** Pose le theme sur <html>. index.html fait la meme chose avant le premier rendu,
 *  pour eviter un flash du mauvais theme : les deux doivent rester d'accord. */
export function applyTheme(value: ThemeChoice): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (value === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', value);
  root.setAttribute('data-palette', palette.value);
  const color = getComputedStyle(root).getPropertyValue('--bg').trim() || THEME_COLORS[effectiveTheme(value)];
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', color));
}

let installed = false;
function install(): void {
  if (installed) return;
  installed = true;
  watch([choice, palette], () => applyTheme(choice.value), { immediate: true, flush: 'sync' });
  systemLight?.addEventListener?.('change', event => { systemIsLight.value = event.matches; if (choice.value === 'system') applyTheme('system'); });
}

/**
 * Theme de l'interface, choisi par l'utilisateur sur cet appareil.
 * Singleton : le rail, le menu mobile, la palette de commandes et le profil lisent le
 * meme choix.
 */
export function useTheme() {
  install();
  const resolved = computed(() => effectiveTheme(choice.value));
  return {
    choice,
    palette,
    resolved,
    setTheme: (value: ThemeChoice) => { choice.value = value; },
    /** Bascule rapide sombre <-> clair (quitte le mode systeme). */
    toggle: () => { choice.value = resolved.value === 'dark' ? 'light' : 'dark'; },
  };
}
