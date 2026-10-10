<template>
  <UiBadge class="language-tag" :class="value.variant" :tone="value.tone">{{ value.label }}</UiBadge>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import { vfLanguageState } from '@/utils/labels';
import { audioStatusLabel, audioRowClass, subtitleStatusLabel, subtitleRowClass, forcedStatusLabel, forcedRowClass } from '@/utils/vfUpgradeLabels';
import type { MediaAvailability } from "@/types/media";
import type { AuditItem } from '@/composables/vf/types';

const props = withDefaults(defineProps<{
  state: Partial<Pick<AuditItem, 'has_vf' | 'fr_is_default' | 'sub_fr_status' | 'forced_fr_status'>> & { vf_granularity?: string | null; availability?: MediaAvailability };
  kind?: 'language' | 'audio' | 'subtitles' | 'forced';
}>(), { kind: 'language' });
const tones: Record<string, string> = { vf: 'success', vo: 'danger', mixed: 'warning', 'vf-secondary': 'warning', 'is-ok': 'success', 'is-warning': 'warning', 'is-danger': 'danger', 'is-muted': 'neutral' };
const value = computed(() => {
  const source = props.state.availability?.languages;
  const s = source ? {
    ...source,
    has_vf: source.has_vf ?? undefined,
    fr_is_default: source.fr_is_default ?? undefined,
    sub_fr_status: source.sub_fr_status === 'default' ? 'ok' as const : source.sub_fr_status,
    forced_fr_status: source.forced_fr_status === 'none' || source.forced_fr_status === 'absent' ? null : source.forced_fr_status,
  } : props.state;
  if (props.kind === 'language') {
    const { label, variant } = vfLanguageState(s);
    return { label, variant, tone: tones[variant] || 'neutral' };
  }
  const label = props.kind === 'audio' ? audioStatusLabel(s) : props.kind === 'subtitles' ? subtitleStatusLabel(s.sub_fr_status) : forcedStatusLabel(s.forced_fr_status);
  const variant = props.kind === 'audio' ? audioRowClass(s) : props.kind === 'subtitles' ? subtitleRowClass(s) : forcedRowClass(s);
  return { label, variant, tone: tones[variant] || 'neutral' };
});
</script>
