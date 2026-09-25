import { computed, watch } from 'vue';
import { usePreference } from './usePreference';

export type ThemeChoice = 'system' | 'dark' | 'light';

export const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Système' },
  { value: 'dark', label: 'Sombre' },
  { value: 'light', label: 'Clair' },
];

/* Couleur de la barre d'etat mobile : le fond (`--bg`) de chaque theme. */
const THEME_COLORS = { dark: '#0c0e14', light: '#f4f2ed' } as const;

const choice = usePreference<ThemeChoice>('theme', 'system');
const systemLight = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: light)')
  : null;

function effectiveTheme(value: ThemeChoice): 'dark' | 'light' {
  if (value !== 'system') return value;
  return systemLight?.matches ? 'light' : 'dark';
}

/** Pose le theme sur <html>. index.html fait la meme chose avant le premier rendu,
 *  pour eviter un flash du mauvais theme : les deux doivent rester d'accord. */
export function applyTheme(value: ThemeChoice): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (value === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', value);
  const color = THEME_COLORS[effectiveTheme(value)];
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', color));
}

let installed = false;
function install(): void {
  if (installed) return;
  installed = true;
  watch(choice, applyTheme, { immediate: true });
  systemLight?.addEventListener?.('change', () => { if (choice.value === 'system') applyTheme('system'); });
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
    resolved,
    setTheme: (value: ThemeChoice) => { choice.value = value; },
    /** Bascule rapide sombre <-> clair (quitte le mode systeme). */
    toggle: () => { choice.value = resolved.value === 'dark' ? 'light' : 'dark'; },
  };
}
