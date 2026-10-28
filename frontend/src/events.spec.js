import { mount } from '@vue/test-utils';
import { h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useRealtime } from './events';

describe('useRealtime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces different targets into a domain refresh', async () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const Host = {
      setup() {
        useRealtime(['request.updated'], callback, {
          debounceMs: 100,
          refreshOnVisible: false,
        });
        return () => h('div');
      },
    };
    const wrapper = mount(Host);

    window.dispatchEvent(new CustomEvent('watchdeck:request.updated', { detail: { request_id: 1 } }));
    window.dispatchEvent(new CustomEvent('watchdeck:request.updated', { detail: { request_id: 2 } }));
    await vi.advanceTimersByTimeAsync(99);
    expect(callback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(undefined, undefined);

    wrapper.unmount();
  });
  it('flushes a continuous stream within the maximum wait window', async () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const wrapper = mount({ setup() { useRealtime(['request.updated'], callback, { debounceMs:120, maxWaitMs:500, refreshOnVisible:false }); return () => h('div'); } });
    for (let i=0;i<15;i++) {
      window.dispatchEvent(new CustomEvent('watchdeck:request.updated', {detail:{request_id:i}}));
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(callback).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(undefined, undefined);
    wrapper.unmount();
  });

});
