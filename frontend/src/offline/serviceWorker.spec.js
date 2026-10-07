import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

function worker(cachedResponse) {
  const listeners = {};
  const cache = { match: vi.fn().mockResolvedValue(cachedResponse), put: vi.fn() };
  const fetch = vi.fn().mockRejectedValue(new Error('Network unavailable'));
  const errorResponse = { type: 'error' };
  runInNewContext(source, {
    self: { location: { origin: 'https://watchdeck.test' }, addEventListener: (name, fn) => { listeners[name] = fn; } },
    URL, fetch, caches: { open: vi.fn().mockResolvedValue(cache) },
    Response: { error: () => errorResponse },
  });
  const request = (url) => {
    const event = { request: { url, method: 'GET' }, respondWith: vi.fn(), waitUntil: vi.fn() };
    listeners.fetch(event);
    return event;
  };
  return { request, fetch, errorResponse };
}

describe('service worker network failures', () => {
  it.each(['https://fonts.googleapis.com/css2?family=Inter', 'https://fonts.gstatic.com/font.woff2', 'https://other.test/icon.png'])(
    'leaves third-party loading to the browser: %s', (url) => {
      const sw = worker();
      expect(sw.request(url).respondWith).not.toHaveBeenCalled();
      expect(sw.fetch).not.toHaveBeenCalled();
    },
  );

  it('leaves hashed chunks to the HTTP cache', () => {
    const sw = worker();
    expect(sw.request('https://watchdeck.test/vue/assets/index-hash.js').respondWith).not.toHaveBeenCalled();
  });

  it('returns a valid network error response when a stable asset has no fallback', async () => {
    const sw = worker();
    const event = sw.request('https://watchdeck.test/vue/icon.svg');
    await expect(event.respondWith.mock.calls[0][0]).resolves.toBe(sw.errorResponse);
  });

  it('keeps a cached asset available during a network failure', async () => {
    const cached = { status: 200 };
    const sw = worker(cached);
    const event = sw.request('https://watchdeck.test/vue/icon.svg');
    await expect(event.respondWith.mock.calls[0][0]).resolves.toBe(cached);
  });
});
