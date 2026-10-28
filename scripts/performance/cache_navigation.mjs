/** Real SPA navigation: record counts and sizes, never cached account payloads. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const output = process.env.WATCHDECK_PERF_RESULTS || 'docs/performance-results/lot5';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext();
const result = { scope: '36 distinct library filters in one authenticated SPA, real QueryClient and IndexedDB', samples: [] };
try {
  const login = await context.request.post('http://127.0.0.1:8765/api/auth/login', { data: { username: 'benchmark', password: 'benchmark-local-only' } });
  if (!login.ok()) throw new Error(`login ${login.status()}`);
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:8765/library?type=movie&query=Film');
  await page.locator('.poster-card').first().waitFor({ timeout: 30000 });
  for (let i = 0; i < 36; i++) {
    const term = String(i).padStart(4, '0');
    const response = page.waitForResponse(r => {
      const u = new URL(r.url());
      return u.pathname === '/api/library' && u.searchParams.get('query') === term && r.status() === 200;
    }, { timeout: 30000 });
    await page.evaluate(term => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push({ path: '/library', query: { type: 'movie', query: term } }), term);
    await response;
    await page.waitForTimeout(50);
    if (i % 6 === 5) result.samples.push(await page.evaluate(() => {
      const provides = document.querySelector('#app').__vue_app__._context.provides;
      const client = Reflect.ownKeys(provides).map(key => provides[key]).find(value => typeof value?.getQueryCache === 'function');
      const queries = client.getQueryCache().getAll();
      const roots = {}, inactiveRoots = {};
      let protectedQueries = 0;
      for (const q of queries) {
        const root = String(q.queryKey[0]); roots[root] = (roots[root] || 0) + 1;
        if (q.getObserversCount() > 0 || q.state.fetchStatus !== 'idle') protectedQueries++;
        else inactiveRoots[root] = (inactiveRoots[root] || 0) + 1;
      }
      return { queries: queries.length, protectedQueries, inactiveRoots, roots, dataBytes: queries.reduce((n,q) => n + new TextEncoder().encode(JSON.stringify(q.state.data)).length, 0), sessionSnapshots: Object.keys(sessionStorage).filter(k => k.startsWith('watchdeck:swr:')).length };
    }));
  }
  await page.waitForTimeout(2200);
  result.persisted = await page.evaluate(async () => new Promise((resolve, reject) => {
    const open = indexedDB.open('watchdeck'); open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('cache'), read = tx.objectStore('cache').getAll();
      read.onerror = () => reject(read.error);
      read.onsuccess = () => {
        const snapshots = read.result.filter(v => typeof v === 'string');
        resolve({ bytes: snapshots.reduce((n,v) => n + new TextEncoder().encode(v).length, 0), queries: snapshots.reduce((n,v) => n + (JSON.parse(v).clientState?.queries?.length || 0), 0) });
      };
      tx.oncomplete = () => db.close();
    };
  }));
  if (result.samples.some(v => (v.inactiveRoots.library || 0) > 24 || (v.queries - v.protectedQueries) > 120)) throw new Error('Inactive query budget exceeded');
  if (result.persisted.bytes > 8 * 1024 * 1024 || result.persisted.queries > 60) throw new Error('Persistence budget exceeded');
} finally {
  await context.close(); await browser.close(); await mkdir(output, { recursive: true });
  await writeFile(`${output}/cache-navigation.json`, JSON.stringify(result, null, 2) + '\n');
}
