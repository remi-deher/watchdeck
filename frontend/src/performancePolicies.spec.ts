import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/vue-query';
import { api, ApiError, requestTimeout } from '@/api';
import { shouldRetry, retryDelay } from '@/queryClient';
import { CACHE_BUDGETS, enforceQueryBudgets } from '@/queryBudgets';
import { clearCache, readCache, syncCacheOwner, writeCache, SWR_LIMITS } from '@/cache';
import { invalidateRealtime } from '@/realtimeInvalidation';

function pendingFetch(_url: unknown, options: RequestInit) {
  return new Promise<Response>((_resolve, reject) => {
    if (options.signal?.aborted) reject(new DOMException('Aborted', 'AbortError'));
    options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); clearCache(); sessionStorage.clear(); });

describe('deadlines, cancellation and retries', () => {
  it('distinguishes deadline from caller cancellation and clears timers', async () => {
    vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn(pendingFetch));
    const timed = expect(api('/api/library', { timeoutMs: 50 })).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(50); await timed;
    const controller = new AbortController();
    const cancelled = expect(api('/api/media/detail', { signal: controller.signal, timeoutMs: 100 })).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await cancelled;
    expect(vi.getTimerCount()).toBe(0);
    expect(requestTimeout('/api/playback/statistics')).toBeGreaterThan(requestTimeout('/api/library'));
  });
  it('keeps the deadline while reading the response body', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, options) => Promise.resolve({ ok: true,
      json: () => pendingFetch('', options) })));
    const done = expect(api('/api/library', { timeoutMs: 20 })).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(20); await done;
  });
  it('preserves HTTP status and Retry-After without retrying permanent failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail":"Patientez"}', {status:429, headers:{'Retry-After':'7'}})));
    const error = await api('/api/library').catch(error => error);
    expect(error).toMatchObject({status:429,retryAfterMs:7000});
    expect(retryDelay(0,error)).toBe(7000);
    for (const status of [400,401,403,404,409,422]) expect(shouldRetry(0,new ApiError('x',status))).toBe(false);
    expect(shouldRetry(0,new DOMException('Aborted','AbortError'))).toBe(false);
    expect(shouldRetry(0,new ApiError('x',503))).toBe(true);
    expect(shouldRetry(2,new ApiError('x',503))).toBe(false);
    expect(shouldRetry(0,new ApiError('x',429,60000))).toBe(false);
  });
  it('aborts transport when the final query observer leaves a detail', async () => {
    const fetch = vi.fn(pendingFetch); vi.stubGlobal('fetch', fetch);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const observer = new QueryObserver(client, { queryKey: ['media', 'detail', 1], queryFn: ({ signal }) => api('/api/media/detail', { signal }) });
    const stop = observer.subscribe(() => {});
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const signal = fetch.mock.calls[0][1].signal;
    stop(); expect(signal?.aborted).toBe(true); client.clear();
  });
  it('merges custom headers and strips client-only options', async () => {
    const fetch = vi.fn(async (_path: string, _options: RequestInit) => new Response('{}')); vi.stubGlobal('fetch',fetch);
    await api('/api/test',{ timeoutMs:100, silent:true, headers:new Headers({Accept:'application/test'}) });
    const options=fetch.mock.calls[0][1] as any;
    expect(options.headers.get('Accept')).toBe('application/test');
    expect(options.timeoutMs).toBeUndefined(); expect(options.silent).toBeUndefined();
  });
});

describe('bounded caches and invalidations', () => {
  it('bounds inactive variants and retained pages while protecting an observed query', () => {
    vi.useFakeTimers();
    const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
    const observer=new QueryObserver(client,{queryKey:['library','visible'],enabled:false});
    const stop=observer.subscribe(()=>{});
    client.setQueryData(['library','visible'],{large:'keep'});
    for(let i=0;i<200;i++){vi.setSystemTime(1000+i);client.setQueryData(['library',i],{page:i});}
    client.setQueryData(['media','pages'],{pages:[1,2,3,4,5],pageParams:[0,1,2,3,4]});
    enforceQueryBudgets(client);
    expect(client.getQueryData(['library','visible'])).toEqual({large:'keep'});
    expect(client.getQueryCache().getAll().filter(q=>q.queryKey[0]==='library').length).toBeLessThanOrEqual(CACHE_BUDGETS.perDomain);
    expect((client.getQueryData(['media','pages']) as any).pages).toEqual([1,2,3]);
    stop();client.clear();
  });
  it('bounds SWR variants and avoids a second durable copy of library data', () => {
    for(let i=0;i<100;i++) writeCache(`library:${i}`,{value:i});
    expect(readCache('library:0')).toBeNull(); expect(readCache('library:99')).toEqual({value:99});
    expect(Object.keys(sessionStorage).filter(k=>k.startsWith('watchdeck:swr:library'))).toEqual([]);
    writeCache('oversize','x'.repeat(SWR_LIMITS.entryBytes+1)); expect(readCache('oversize')).toBeNull();
  });
  it('purges the memory owner even when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked');});
    syncCacheOwner({id:'a'});writeCache('private',{id:1},{persist:false});syncCacheOwner({id:'b'});
    expect(readCache('private')).toBeNull();vi.restoreAllMocks();
  });
  it('collapses nested invalidations into one read per domain', async () => {
    vi.useFakeTimers();
    const client=new QueryClient();const invalidate=vi.spyOn(client,'invalidateQueries').mockResolvedValue();
    const waits=[];
    for(let i=0;i<50;i++) waits.push(invalidateRealtime(client,['library','items',i]));
    waits.push(invalidateRealtime(client,['library']));
    await vi.advanceTimersByTimeAsync(60);await Promise.all(waits);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({queryKey:['library']},{cancelRefetch:false});
    client.clear();
  });
});
