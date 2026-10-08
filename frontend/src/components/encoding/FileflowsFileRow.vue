<template>
  <!-- Un fichier suivi par FileFlows : ou il en est, avec quel flow, et ce qu'on peut y faire. -->
  <article class="ff-row" :class="{ 'is-failed': file.status === FILEFLOWS_STATUS.failed }">
    <UiCheckbox v-if="selectable" :model-value="selected" :aria-label="`Sélectionner ${fileBaseName(file.name)}`" @update:model-value="emit('toggle', file.uid)" />
    <div class="ff-main">
      <strong :title="file.name">{{ fileBaseName(file.name) }}</strong>
      <span class="ff-meta">
        <RouterLink v-if="file.media && showMedia" :to="mediaLink" class="ff-media" @click="ouvrirFicheAuClic($event, mediaLink)">{{ mediaLabel }}</RouterLink>
        <span v-if="file.library">{{ file.library }}</span>
        <span v-if="file.flow">{{ file.flow }}</span>
      </span>
      <span v-if="file.failure_reason" class="ff-reason">{{ file.failure_reason }}</span>
    </div>
    <dl class="ff-stats">
      <div v-if="file.duration"><dt>Durée</dt><dd>{{ file.duration }}</dd></div>
      <div v-if="change != null"><dt>Taille</dt><dd :class="{ 'is-smaller': change < 0 }">{{ change > 0 ? '+' : '' }}{{ change }} %</dd></div>
      <div v-if="file.date"><dt>Date</dt><dd>{{ formatDateTimeShort(file.date) }}</dd></div>
    </dl>
    <UiBadge :tone="fileStatusTone(file.status)" dot>{{ file.status_label }}</UiBadge>
    <div class="ff-actions">
      <UiButton size="sm" @click="emit('log', file)"><ScrollText />Journal</UiButton>
      <UiButton v-if="canReprocess" size="sm" :loading="busy" @click="emit('reprocess', file)"><RotateCcw />Relancer</UiButton>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RotateCcw, ScrollText } from '@lucide/vue';
import { FILEFLOWS_STATUS, fileBaseName, fileStatusTone, sizeChange, type FileflowsFile } from '@/composables/useFileflows';
import { useOuvrirFiche } from '@/composables/useMediaOverlay';
import { formatDateTimeShort } from '@/utils/format';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiCheckbox from '@/components/ui/UiCheckbox.vue';

const props = withDefaults(defineProps<{ file: FileflowsFile; selectable?: boolean; selected?: boolean; busy?: boolean; showMedia?: boolean }>(), {
  selectable: false, selected: false, busy: false, showMedia: true,
});
const emit = defineEmits<{ (e: 'toggle', uid: string): void; (e: 'log', file: FileflowsFile): void; (e: 'reprocess', file: FileflowsFile): void }>();

const { auClic: ouvrirFicheAuClic } = useOuvrirFiche();
const mediaLink = computed(() => `/library/media/library/${props.file.media?.id}`);
const mediaLabel = computed(() => {
  const media = props.file.media;
  return media?.year ? `${media.title} (${media.year})` : media?.title || '';
});
const change = computed(() => sizeChange(props.file));
/* Un fichier deja en file ou en cours ne se relance pas (FileFlows l'ignorerait). */
const canReprocess = computed(() => props.file.status !== FILEFLOWS_STATUS.queued && props.file.status !== FILEFLOWS_STATUS.processing);
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.ff-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.ff-row:not(:has(.ui-checkbox)) { grid-template-columns: minmax(0, 1fr) auto auto auto; }
.ff-row.is-failed { border-color: color-mix(in srgb, var(--red) 45%, var(--border)); }
.ff-main { display: grid; gap: 2px; min-width: 0; }
.ff-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ff-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; color: var(--muted); font-size: var(--fs-xs); }
.ff-media { color: var(--accent); font-weight: 650; text-decoration: none; }
.ff-media:hover { text-decoration: underline; }
.ff-reason { color: var(--red-text); font-size: var(--fs-xs); overflow-wrap: anywhere; }
.ff-stats { display: flex; gap: var(--space-3); margin: 0; }
.ff-stats dt { color: var(--muted); font-size: var(--fs-xs); }
.ff-stats dd { margin: 0; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ff-stats .is-smaller { color: var(--green-text); }
.ff-actions { display: flex; gap: var(--space-2); }
@include bp.until(tablet) {
  .ff-row, .ff-row:not(:has(.ui-checkbox)) { grid-template-columns: auto minmax(0, 1fr) auto; }
  .ff-row:not(:has(.ui-checkbox)) { grid-template-columns: minmax(0, 1fr) auto; }
  .ff-stats, .ff-actions { grid-column: 1 / -1; }
  .ff-stats { flex-wrap: wrap; }
}
</style>
