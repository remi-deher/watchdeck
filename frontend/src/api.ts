import type { ApiRequestOptions } from '@/types/api';

export async function api<T = any>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  if (response.redirected && response.url.includes('/login')) {
    if (typeof window !== 'undefined') {
      window.location.href = response.url;
    }
    return null as unknown as T;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.message || `HTTP ${response.status}`);
  }
  return data as T;
}

/**
 * Lit un flux SSE ponctuel et appelle `onPayload` à chaque trame reçue.
 */
export async function streamEvents<T = any>(
  path: string,
  onPayload: (payload: T) => void,
  options: RequestInit = {}
): Promise<void> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { Accept: 'text/event-stream' },
    ...options,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || `HTTP ${response.status}`);
  }
  if (!response.body) throw new Error('Flux non supporté par ce navigateur');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('');
        if (!data) continue;
        try {
          onPayload(JSON.parse(data));
        } catch {
          /* Trame illisible : on continue */
        }
      }
    }
  } finally {
    if (!finished) reader.cancel().catch(() => {});
  }
}

export function cachedResource<T = any>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): { cached: T | null; fresh: boolean; refresh: Promise<T> } {
  const now = Date.now();
  let cached: { savedAt: number; data: T } | null = null;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    cached = raw ? JSON.parse(raw) : null;
  } catch {
    cached = null;
  }
  const fresh = Boolean(cached && now - cached.savedAt < ttlMs);
  const refresh = loader().then((data) => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
      }
    } catch {
      /* Quota dépassé */
    }
    return data;
  });
  return { cached: cached?.data || null, fresh, refresh };
}
