import type { ApiRequestOptions } from '@/types/api';
import { humanizeError, messageForStatus } from '@/utils/apiError';

/** Erreur d'API portant le code HTTP, pour que l'appelant puisse decider sans reparser. */
/**
 * Rend lisible le motif renvoye par le serveur.
 *
 * `detail` n'est pas toujours une phrase : sur une requete mal formee, FastAPI renvoie
 * la liste des champs en cause. Affichee telle quelle, elle donnait « [object Object] »
 * a l'utilisateur -- un message qui ne dit rien et qu'on ne peut meme pas rapporter.
 */
function detailLisible(data: any): string {
  const detail = data?.detail ?? data?.message;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const phrases = detail
      .map((entree: any) => {
        if (typeof entree === 'string') return entree;
        const champ = Array.isArray(entree?.loc) ? entree.loc.filter((p: unknown) => p !== 'query' && p !== 'body').join('.') : '';
        const motif = entree?.msg || entree?.message || '';
        return [champ, motif].filter(Boolean).join(' : ');
      })
      .filter(Boolean);
    if (phrases.length) return phrases.join(' — ');
  }
  if (detail && typeof detail === 'object') {
    const motif = detail.msg || detail.message;
    if (typeof motif === 'string') return motif;
  }
  return '';
}

export class ApiError extends Error {
  status: number;
  retryAfterMs?: number;
  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export class ApiTimeoutError extends Error {
  constructor() { super('Le délai de réponse est dépassé. Réessayez dans un instant.'); this.name = 'TimeoutError'; }
}
export class ApiNetworkError extends Error {
  constructor(error: unknown) { super(humanizeError(error)); this.name = 'NetworkError'; }
}

export function requestTimeout(path: string, method = 'GET'): number {
  if (method.toUpperCase() !== 'GET') return 60_000;
  if (/\/(library-analytics|playback\/statistics)(?:[/?]|$)/.test(path)) return 180_000;
  if (/\/(?:media\/detail|discover\/(?:detail|person)|calendar|.*export)(?:[/?]|$)/.test(path)) return 60_000;
  return 20_000;
}

export function retryAfter(header: string | null | undefined): number | undefined {
  if (!header?.trim()) return undefined;
  const seconds = Number(header);
  const value = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(value) ? Math.max(0, value) : undefined;
}

export async function api<T = any>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { timeoutMs = requestTimeout(path, options.method), signal: caller, silent: _silent, ...init } = options;
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(caller?.reason);
  if (caller?.aborted) abort();
  else caller?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    if (!controller.signal.aborted) { timedOut = true; controller.abort(); }
  }, Math.max(1, timeoutMs));
  try {
    const headers = new Headers({ Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) });
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    const response = await fetch(path, {
      ...init, credentials: init.credentials ?? 'same-origin', signal: controller.signal,
      headers,
    });
    if (response.redirected && response.url.includes('/login')) {
      if (typeof window !== 'undefined') window.location.href = response.url;
      return null as unknown as T;
    }
    let data: any;
    try { data = await response.json(); }
    catch (error) { if (controller.signal.aborted) throw error; data = {}; }
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!response.ok) throw new ApiError(detailLisible(data) || messageForStatus(response.status), response.status, retryAfter(response.headers?.get('Retry-After')));
    return data as T;
  } catch (error: any) {
    if (timedOut) throw new ApiTimeoutError();
    if (caller?.aborted || error?.name === 'AbortError') throw new DOMException('Aborted', 'AbortError');
    if (error instanceof ApiError) throw error;
    throw new ApiNetworkError(error);
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener('abort', abort);
  }
}

/**
 * Lit un flux SSE ponctuel et appelle `onPayload` à chaque trame reçue.
 */
export async function streamEvents<T = any>(
  path: string,
  onPayload: (payload: T) => void,
  options: ApiRequestOptions = {},
): Promise<void> {
  const { signal: caller, timeoutMs = 180_000, silent: _silent, ...init } = options;
  const controller = new AbortController();
  let timedOut = false, finished = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const abort = () => controller.abort(caller?.reason);
  if (caller?.aborted) abort(); else caller?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    if (!controller.signal.aborted) { timedOut = true; controller.abort(); }
  }, Math.max(1, timeoutMs));
  try {
    const response = await fetch(path, {
      credentials: 'same-origin', headers: { Accept: 'text/event-stream' }, ...init, signal: controller.signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(detailLisible(data) || messageForStatus(response.status), response.status, retryAfter(response.headers?.get('Retry-After')));
    }
    if (!response.body) throw new Error('Flux non supporté par ce navigateur');
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) { finished = true; break; }
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('');
        if (data) try { onPayload(JSON.parse(data)); } catch { /* Ignore malformed frames. */ }
      }
    }
  } catch (error: any) {
    if (timedOut) throw new ApiTimeoutError();
    if (caller?.aborted || error?.name === 'AbortError') throw new DOMException('Aborted', 'AbortError');
    throw error;
  } finally {
    clearTimeout(timer); caller?.removeEventListener('abort', abort);
    if (!finished) void reader?.cancel().catch(() => {});
  }
}
