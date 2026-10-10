<template>
  <UiBadge class="language-tag" :class="value.variant" :tone="value.tone">{{ value.label }}</UiBadge>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import { vfLanguageState } from '@/utils/labels';
import { audioStatusLabel, audioRowClass, subtitleStatusLabel, subtitleRowClass, forcedStatusLabel, forcedRowClass } from '@/utils/vfUpgradeLabels';
import type { AuditItem } from '@/composables/vf/types';

const props = withDefaults(defineProps<{
  state: Partial<Pick<AuditItem, 'has_vf' | 'fr_is_default' | 'sub_fr_status' | 'forced_fr_status'>> & { vf_granularity?: string | null };
  kind?: 'language' | 'audio' | 'subtitles' | 'forced';
}>(), { kind: 'language' });
const tones: Record<string, string> = { vf: 'success', vo: 'danger', mixed: 'warning', 'vf-secondary': 'warning', 'is-ok': 'success', 'is-warning': 'warning', 'is-danger': 'danger', 'is-muted': 'neutral' };
const value = computed(() => {
  const s = props.state;
  if (props.kind === 'language') {
    const { label, variant } = vfLanguageState(s);
    return { label, variant, tone: tones[variant] || 'neutral' };
  }
  const label = props.kind === 'audio' ? audioStatusLabel(s) : props.kind === 'subtitles' ? subtitleStatusLabel(s.sub_fr_status) : forcedStatusLabel(s.forced_fr_status);
  const variant = props.kind === 'audio' ? audioRowClass(s) : props.kind === 'subtitles' ? subtitleRowClass(s) : forcedRowClass(s);
  return { label, variant, tone: tones[variant] || 'neutral' };
});
</script>
