/**
 * Proxy d'images sécurisé et optimisé.
 */

// Plages privées RFC 1918 + loopback + lien-local.
const PRIVATE_IPV4 = /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/;
const LOCAL_SUFFIX = /\.(local|lan|home|internal|localdomain)$/i;

function isPrivateHost(hostname?: string | null): boolean {
  if (!hostname) return false;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || PRIVATE_IPV4.test(host)) return true;
  // IPv6 loopback et plage unique-local (fc00::/7).
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd')) return true;
  if (LOCAL_SUFFIX.test(host)) return true;
  // Nom d'hôte nu (« plex », « nas ») : résolvable seulement sur le réseau local.
  return !host.includes('.');
}

export interface ProxyUrlOptions {
  width?: number;
  quality?: number;
  forceProxy?: boolean;
}

export function proxyUrl(url: null, options?: ProxyUrlOptions): null;
export function proxyUrl(url: undefined, options?: ProxyUrlOptions): undefined;
export function proxyUrl(url: string, options?: ProxyUrlOptions): string;
export function proxyUrl(url?: string | null, options?: ProxyUrlOptions): string | null | undefined;
export function proxyUrl(url?: string | null, options: ProxyUrlOptions = {}): string | null | undefined {
  if (url === null) return null;
  if (url === undefined) return undefined;
  if (!url) return url;
  const width = options.width || 500;
  const quality = options.quality || 82;

  if (url.includes('/api/image-proxy')) {
    if (options.width) {
      try {
        const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
        const u = new URL(url, origin);
        u.searchParams.set('width', String(options.width));
        return u.pathname + u.search;
      } catch {
        return url;
      }
    }
    return url;
  }

  let parsed: URL;
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    parsed = new URL(url, origin);
  } catch {
    return url;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url;
  // Déjà servie par l'app elle-même : rien à proxifier.
  if (typeof window !== 'undefined' && parsed.origin === window.location.origin) return url;

  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const mixedContent = parsed.protocol === 'http:' && isHttps;
  if (!options.forceProxy && !mixedContent && !isPrivateHost(parsed.hostname)) return url;

  return `/api/image-proxy?url=${encodeURIComponent(url)}&width=${width}&quality=${quality}&format=webp`;
}
