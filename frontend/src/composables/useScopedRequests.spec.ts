import { effectScope } from 'vue';
import { describe, expect, it, vi } from 'vitest';
const api = vi.fn();
vi.mock('@/api', () => ({ api: (...args: any[]) => api(...args) }));
import { useScopedRequests } from './useScopedRequests';

describe('detail read lifecycle', () => {
  it('rejects late data after a scope is closed or its target changes', async () => {
    for (const dispose of [false, true]) {
      let release: (value: any) => void = () => {};
      api.mockReset().mockImplementation(() => new Promise(resolve => { release = resolve; }));
      const scope = effectScope();
      const requests = scope.run(() => useScopedRequests())!;
      const result = expect(requests.read('/api/downloads/clients/1/hash/files')).rejects.toMatchObject({ name: 'AbortError' });
      const signal = api.mock.calls[0][1].signal;
      if (dispose) scope.stop(); else requests.reset();
      expect(signal.aborted).toBe(true);
      release(['old result']); await result; scope.stop();
    }
  });
});
