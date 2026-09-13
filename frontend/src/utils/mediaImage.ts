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

/* Hotes dont les URL d'affiches expirent : `metadata-static.plex.tv` finit par repondre
   403 AccessDenied sur des objets qu'il servait auparavant. Le proxy garde une copie sur
   disque, donc une affiche deja vue continue de s'afficher apres la disparition de la
   source -- ce que le chargement direct ne peut pas faire. Celles qui n'ont jamais ete
   mises en cache tombent, elles, sur le repli du composant. */
const ALWAYS_PROXY_HOSTS = new Set(['metadata-static.plex.tv']);

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
  const hotlinkProtected = ALWAYS_PROXY_HOSTS.has(parsed.hostname.toLowerCase());
  if (!options.forceProxy && !mixedContent && !hotlinkProtected && !isPrivateHost(parsed.hostname)) return url;

  return `/api/image-proxy?url=${encodeURIComponent(url)}&width=${width}&quality=${quality}&format=webp`;
}

/* Echelle officielle des affiches TMDB. Toute autre valeur renvoie une 404 : on ne peut
   pas demander « w400 », il faut se caler sur un barreau existant. */
const TMDB_POSTER_WIDTHS = [92, 154, 185, 342, 500, 780];
const TMDB_PATH = /\/t\/p\/(w\d+|original)\//;

/**
 * Construit le `srcset` correspondant a une affiche.
 *
 * `sizes` etait declare sur les `<img>` sans aucun `srcset` en face : la specification
 * HTML rend alors l'attribut inoperant, et un telephone telechargeait la meme image que
 * l'ecran 1440. On decline donc chaque source sur plusieurs largeurs -- les barreaux
 * TMDB pour les affiches servies en direct, le parametre `width` du proxy pour les
 * autres -- et le navigateur choisit selon `sizes` et la densite de l'ecran.
 *
 * Renvoie `undefined` quand la source ne sait pas se redimensionner : mieux vaut pas de
 * `srcset` du tout qu'un `srcset` dont toutes les entrees pointent la meme image.
 */
export function srcSetFor(url?: string | null, options: ProxyUrlOptions = {}): string | undefined {
  if (!url) return undefined;
  const base = proxyUrl(url, options);
  if (!base) return undefined;

  if (base.includes('/api/image-proxy')) {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
      const parsed = new URL(base, origin);
      return TMDB_POSTER_WIDTHS.map((width) => {
        const variant = new URL(parsed.toString());
        variant.searchParams.set('width', String(width));
        return `${variant.pathname}${variant.search} ${width}w`;
      }).join(', ');
    } catch {
      return undefined;
    }
  }

  if (!TMDB_PATH.test(base)) return undefined;
  return TMDB_POSTER_WIDTHS.map((width) => `${base.replace(TMDB_PATH, `/t/p/w${width}/`)} ${width}w`).join(', ');
}
