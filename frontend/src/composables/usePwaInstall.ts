import { ref } from 'vue';

const deferredPrompt = ref<any>(null);
const canInstall = ref(false);
const isInstalled = ref(false);
const isIos = ref(false);
const isDismissed = ref(false);

const DISMISS_KEY = 'watchdeck_pwa_dismissed';

if (typeof window !== 'undefined') {
  const checkInstalled = (): boolean => {
    const isStandaloneMedia =
      typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)').matches : false;
    const isNavStandalone = Boolean((window.navigator as any)?.standalone);
    const isAndroidApp = Boolean(document?.referrer?.includes('android-app://'));

    return isStandaloneMedia || isNavStandalone || isAndroidApp;
  };
  isInstalled.value = checkInstalled();

  const ua = (window.navigator?.userAgent || '').toLowerCase();
  isIos.value = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;

  try {
    isDismissed.value = sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    isDismissed.value = false;
  }

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt.value = e;
    canInstall.value = true;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt.value = null;
    canInstall.value = false;
    isInstalled.value = true;
  });
}

export function usePwaInstall() {
  async function promptInstall(): Promise<boolean> {
    if (!deferredPrompt.value) return false;
    try {
      await deferredPrompt.value.prompt();
      const choice = await deferredPrompt.value.userChoice;
      if (choice.outcome === 'accepted') {
        isInstalled.value = true;
        canInstall.value = false;
      }
      deferredPrompt.value = null;
      return choice.outcome === 'accepted';
    } catch (e) {
      console.warn('[PWA] Erreur prompt install:', e);
      return false;
    }
  }

  function dismiss(): void {
    isDismissed.value = true;
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {}
  }

  return {
    canInstall,
    isInstalled,
    isIos,
    isDismissed,
    promptInstall,
    dismiss,
  };
}
