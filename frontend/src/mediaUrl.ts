export interface MediaDetailPathOptions {
  discover?: boolean;
}

export function mediaDetailPath(
  item: {
    _kind?: string;
    request_id?: number | string;
    library_id?: number | string;
    id?: number | string;
    media_type?: string;
    tmdb_id?: number | string;
    tvdb_id?: number | string;
    [key: string]: any;
  },
  kindHint?: string,
  options: MediaDetailPathOptions = {}
): string {
  const kind = kindHint || item._kind;
  const base = options.discover ? '/discover/media' : '/library/media';
  if (kind === 'request' || item.request_id) {
    return `${base}/request/${item.request_id || item.id}`;
  }
  if (kind === 'library' || item.library_id) {
    return `${base}/library/${item.library_id || item.id}`;
  }
  // Découvrir (pas encore suivi)
  const params = new URLSearchParams();
  if (item.media_type) params.set('media_type', item.media_type);
  let id = item.id;
  if (item.tmdb_id) {
    id = item.tmdb_id;
  } else if (item.tvdb_id) {
    id = item.tvdb_id;
    params.set('id_type', 'tvdb');
  }
  const qs = params.toString();
  return `/discover/media/discover/${id}${qs ? `?${qs}` : ''}`;
}

function parsePlexMetaKey(guid?: string | null): string | null {
  if (!guid) return null;
  if (typeof guid !== 'string') return null;
  if (guid.startsWith('http://') || guid.startsWith('https://')) return null;

  if (guid.startsWith('plex://')) {
    const parts = guid.replace('plex://', '').split('/');
    const id = parts[parts.length - 1];
    return `/library/metadata/${id}`;
  }
  if (guid.includes('://')) return null;
  if (guid.startsWith('/')) return guid;
  return `/library/metadata/${guid}`;
}

export function formatPlexWebUrl(guid?: string | null): string | null {
  if (typeof guid === 'string' && (guid.startsWith('http://') || guid.startsWith('https://'))) return guid;
  const metaKey = parsePlexMetaKey(guid);
  if (!metaKey) return null;
  return `https://app.plex.tv/desktop/#!/provider/tv.plex.provider.discover/details?key=${encodeURIComponent(metaKey)}`;
}

const PLEX_ANDROID_PACKAGE = 'com.plexapp.android';
const PLEX_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PLEX_ANDROID_PACKAGE}`;
const PLEX_APP_STORE_URL = 'https://apps.apple.com/app/plex/id383457673';

export function detectPlatform(): 'android' | 'ios' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  return 'desktop';
}

function buildPlexAppSchemeUrl(guid?: string | null): string | null {
  const metaKey = parsePlexMetaKey(guid);
  if (!metaKey) return null;
  return `plex://provider/tv.plex.provider.discover/details?key=${encodeURIComponent(metaKey)}`;
}

function buildAndroidIntentUrl(appUrl: string): string {
  const withoutScheme = appUrl.replace(/^plex:\/\//, '');
  const fallback = encodeURIComponent(PLEX_PLAY_STORE_URL);
  return `intent://${withoutScheme}#Intent;scheme=plex;package=${PLEX_ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`;
}

export function openPlexLink(guid?: string | null): void {
  const webUrl = formatPlexWebUrl(guid);
  if (!webUrl) return;

  const platform = detectPlatform();
  const appUrl = platform === 'android' || platform === 'ios' ? buildPlexAppSchemeUrl(guid) : null;

  if (platform === 'android') {
    if (!appUrl) {
      window.open(webUrl, '_blank', 'noopener');
      return;
    }
    window.location.href = buildAndroidIntentUrl(appUrl);
    return;
  }

  if (platform === 'ios') {
    if (!appUrl) {
      window.open(webUrl, '_blank', 'noopener');
      return;
    }

    let intercepted = false;
    const markIntercepted = () => {
      intercepted = true;
    };
    document.addEventListener('visibilitychange', markIntercepted, { once: true });
    window.addEventListener('pagehide', markIntercepted, { once: true });

    window.location.href = appUrl;

    setTimeout(() => {
      document.removeEventListener('visibilitychange', markIntercepted);
      if (!intercepted) {
        window.location.href = PLEX_APP_STORE_URL;
      }
    }, 1200);
    return;
  }

  window.open(webUrl, '_blank', 'noopener');
}
