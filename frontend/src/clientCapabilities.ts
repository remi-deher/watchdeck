import { api } from '@/api';

export interface ClientCapabilities {
  viewport: { width: number; height: number; visualWidth: number; visualHeight: number; dpr: number };
  safeArea: { top: number; right: number; bottom: number; left: number };
  orientation: string;
  pointer: 'coarse' | 'fine' | 'none';
  hover: boolean;
  standalone: boolean;
  reducedMotion: boolean;
  horizontalSegments: number;
  safeAreaSupported: boolean;
}

const px = (value: string): number => Math.max(0, Math.round(Number.parseFloat(value) || 0));
const media = (query: string): boolean => typeof window.matchMedia === 'function' && window.matchMedia(query).matches;

export function collectClientCapabilities(): ClientCapabilities {
  const styles = getComputedStyle(document.documentElement);
  const viewport = window.visualViewport;
  return {
    viewport: {
      width: Math.round(window.innerWidth),
      height: Math.round(window.innerHeight),
      visualWidth: Math.round(viewport?.width ?? window.innerWidth),
      visualHeight: Math.round(viewport?.height ?? window.innerHeight),
      dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
    },
    safeArea: {
      top: px(styles.getPropertyValue('--safe-top')),
      right: px(styles.getPropertyValue('--safe-right')),
      bottom: px(styles.getPropertyValue('--safe-bottom')),
      left: px(styles.getPropertyValue('--safe-left')),
    },
    orientation: window.screen.orientation?.type || (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'),
    pointer: media('(pointer: coarse)') ? 'coarse' : media('(pointer: fine)') ? 'fine' : 'none',
    hover: media('(hover: hover)'),
    standalone: media('(display-mode: standalone)') || Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
    reducedMotion: media('(prefers-reduced-motion: reduce)'),
    horizontalSegments: media('(horizontal-viewport-segments: 2)') ? 2 : 1,
    safeAreaSupported: typeof CSS !== 'undefined' && CSS.supports?.('padding-top: env(safe-area-inset-top)'),
  };
}

const REPORT_KEY = 'watchdeck:client-capabilities:v1';

/**
 * Un onglet masque (ouvert en arriere-plan, prerendu, ou PWA demarree ecran eteint)
 * rapporte `innerWidth`/`innerHeight` a 0 tant qu'il n'a pas ete affiche. Le schema
 * serveur exige des dimensions >= 1 : envoyer ce releve-la produit un 422 et perd le
 * diagnostic de layout. On attend donc une mesure reelle plutot que de relacher la
 * validation, qui accepterait alors des profils faux.
 */
export function hasMeasurableViewport(capabilities: ClientCapabilities): boolean {
  const { width, height, visualWidth, visualHeight } = capabilities.viewport;
  return width >= 1 && height >= 1 && visualWidth >= 1 && visualHeight >= 1;
}

export async function reportClientCapabilities(): Promise<void> {
  try {
    if (sessionStorage.getItem(REPORT_KEY)) return;
    const capabilities = collectClientCapabilities();
    if (!hasMeasurableViewport(capabilities)) {
      // Reessai unique au premier affichage : `visibilitychange` est le seul moment ou
      // l'onglet est garanti mesure.
      document.addEventListener('visibilitychange', function retry() {
        if (document.visibilityState !== 'visible') return;
        document.removeEventListener('visibilitychange', retry);
        void reportClientCapabilities();
      });
      return;
    }
    await api('/api/client-capabilities', { method: 'POST', body: JSON.stringify(capabilities) });
    sessionStorage.setItem(REPORT_KEY, '1');
  } catch {
    // Le diagnostic ne doit jamais bloquer l'interface ni l'authentification.
  }
}
