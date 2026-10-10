import { mount } from '@vue/test-utils';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { defineComponent, h } from 'vue';
import { expect, it, vi } from 'vitest';
import { useVfAudit, VF_AUDIT_KEY } from './useVfAudit';

it('relit la projection serveur après une correction sans modifier son état localement', () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  const before = { items: [{ id: 7, media_type: 'movie', has_vf: true, availability: { languages: { fr_is_default: false } } }] };
  queryClient.setQueryData(VF_AUDIT_KEY, before);
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
  let audit;
  const host = mount(defineComponent({ setup() { audit = useVfAudit(vi.fn()); return () => h('div'); } }), { global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
  audit.applyStreamsFixInPlace(7, { fr_is_default: true });
  expect(queryClient.getQueryData(VF_AUDIT_KEY)).toEqual(before);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: VF_AUDIT_KEY });
  host.unmount(); queryClient.clear();
});

it('ne conserve pas des problèmes devenus obsolètes après un alignement', () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  const before = { items: [{ id: 7, media_type: 'movie', problems: [{ kind: 'audio_secondary', fixable: true }] }] };
  queryClient.setQueryData(VF_AUDIT_KEY, before);
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
  let audit;
  const host = mount(defineComponent({ setup() { audit = useVfAudit(vi.fn()); return () => h('div'); } }), { global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
  audit.applyStreamsFixInPlace(7, { fr_is_default: true });
  expect(queryClient.getQueryData(VF_AUDIT_KEY)).toEqual(before);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: VF_AUDIT_KEY });
  host.unmount(); queryClient.clear();
});
