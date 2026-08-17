import { describe, expect, it } from 'vitest';
import { ref } from 'vue';

describe('vff.updated in-place update', () => {
  it('patches vffStatus in-place without triggering full API reload', () => {
    const vffStatus = ref({ status: 'idle', processed: 0, total: 100 });
    const detail = { status: 'scanning', processed: 25, total: 100 };

    vffStatus.value = { ...vffStatus.value, ...detail };

    expect(vffStatus.value.status).toBe('scanning');
    expect(vffStatus.value.processed).toBe(25);
  });
});
