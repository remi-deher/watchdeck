import {beforeEach, describe, expect, it, vi} from 'vitest';
import {calculatePreview} from './previewJob';
const {api} = vi.hoisted(() => ({api: vi.fn()}));
vi.mock('@/api', () => ({api}));

describe('background preview', () => {
  beforeEach(() => api.mockReset());
  it('fetches a completed preview through short requests', async () => {
    api.mockResolvedValueOnce({id:'job'}).mockResolvedValueOnce({status:'completed',result:{items:[]}});
    const progress=vi.fn();
    expect(await calculatePreview({goal_gb:100}, progress)).toEqual({items:[]});
    expect(api.mock.calls[1][0]).toBe('/api/storage/preview/job');
    expect(progress).toHaveBeenCalledWith(expect.any(Number),'Calcul en cours…');
  });
  it('shows the reported failure', async () => {
    api.mockResolvedValueOnce({id:'job'}).mockResolvedValueOnce({status:'failed',error:'Correspondance absente'});
    await expect(calculatePreview({}, vi.fn())).rejects.toThrow('Correspondance absente');
  });
  it('keeps polling while the preview is running', async () => {
    vi.useFakeTimers();
    try {
      api.mockResolvedValueOnce({id:'job'}).mockResolvedValueOnce({status:'running'}).mockResolvedValueOnce({status:'completed',result:{items:[]}});
      const pending=calculatePreview({}, vi.fn());
      await vi.advanceTimersByTimeAsync(1000);
      expect(await pending).toEqual({items:[]});
    } finally { vi.useRealTimers(); }
  });
});
