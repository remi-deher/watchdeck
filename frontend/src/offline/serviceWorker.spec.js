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
  return { request, fetch, errorResponse, listeners, cache };
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


describe('first controlled document shell', () => {
  it('primes authenticated HTML after the first installation', async () => {
    const sw = worker();
    const html = { status: 200 };
    sw.fetch.mockResolvedValueOnce({ ok: true, headers: new Headers({'content-type':'text/html'}), clone: () => html });
    const event = { source: {url:'https://watchdeck.test/library'}, data: {type:'WATCHDECK_CACHE_SHELL',url:'https://watchdeck.test/library'}, waitUntil:vi.fn() };
    sw.listeners.message(event);
    await event.waitUntil.mock.calls[0][0];
    expect(sw.cache.put).toHaveBeenCalledWith('/__app-shell', html);
  });
  it('rejects third-party URLs and public login documents', () => {
    const sw = worker();
    for (const url of ['https://other.test/library','https://watchdeck.test/login']) {
      sw.listeners.message({ source: {url:'https://watchdeck.test/library'}, data: {type:'WATCHDECK_CACHE_SHELL',url}, waitUntil:vi.fn() });
    }
    expect(sw.fetch).not.toHaveBeenCalled();
  });
});

describe('poster cache write queue', () => {
  function imageCache() {
    const entries = new Map();
    let peak = 0;
    const cache = {
      keys: vi.fn(async () => [...entries.keys()]),
      match: vi.fn(async key => entries.get(key)),
      delete: vi.fn(async key => entries.delete(key)),
      put: vi.fn(async (key, value) => { entries.set(key, value); peak = Math.max(peak, entries.size); }),
    };
    const context = { self: { addEventListener() {} }, Promise };
    runInNewContext(source, context);
    return { entries, cache, peak: () => peak, write: (key, value = {}) => context.conserverAffiche(cache, key, value) };
  }
  it('bounds concurrent writes at 600, scanning once per 32 writes', async () => {
    const sw = imageCache();
    await Promise.all(Array.from({ length: 1000 }, (_, i) => sw.write(`poster-${i}`)));
    expect(sw.entries.size).toBe(600);
    expect(sw.peak()).toBe(600);
    expect(sw.cache.keys).toHaveBeenCalledTimes(32);
    expect(sw.entries.has('poster-399')).toBe(false);
    expect(sw.entries.has('poster-999')).toBe(true);
  });
  it('revalidates without evicting other posters and tolerates logout purges', async () => {
    const sw = imageCache();
    await Promise.all(Array.from({ length: 600 }, (_, i) => sw.write(`poster-${i}`)));
    await sw.write('poster-599', { fresh: true });
    expect(sw.cache.delete).not.toHaveBeenCalled();
    expect(sw.entries.get('poster-599')).toEqual({ fresh: true });
    sw.entries.clear();
    await Promise.all(Array.from({ length: 700 }, (_, i) => sw.write(`next-${i}`)));
    expect(sw.peak()).toBe(600);
    expect(sw.entries.size).toBe(600);
    expect(sw.entries.has('next-699')).toBe(true);
  });
  it('recovers after a failed storage write', async () => {
    const sw = imageCache();
    sw.cache.put.mockRejectedValueOnce(new Error('Quota exceeded'));
    await expect(sw.write('failed')).rejects.toThrow('Quota exceeded');
    await sw.write('ok');
    expect(sw.entries.has('ok')).toBe(true);
  });
});
