<template>
  <!-- Un fichier suivi par FileFlows : ou il en est, avec quel flow, et ce qu'on peut y faire. -->
  <article class="ff-row" :class="{ 'is-failed': file.status === FILEFLOWS_STATUS.failed }">
    <UiCheckbox v-if="selectable" :model-value="selected" :aria-label="`Sélectionner ${fileBaseName(file.name)}`" @update:model-value="emit('toggle', file.uid)" />
    <div class="ff-main">
      <strong :title="file.name"><span v-if="position" class="ff-position">{{ position }}</span>{{ fileBaseName(file.name) }}<span v-if="file.relaunched" class="ff-relaunched">relancé</span></strong>
      <span class="ff-meta">
        <RouterLink v-if="file.media && showMedia" :to="mediaLink" class="ff-media" @click="ouvrirFicheAuClic($event, mediaLink)">{{ mediaLabel }}</RouterLink>
        <span v-if="file.library">{{ file.library }}</span>
        <span v-if="file.flow">{{ file.flow }}</span>
      </span>
      <span v-if="file.failure_reason" class="ff-reason">{{ file.failure_reason }}</span>
    </div>
    <dl class="ff-stats">
      <!-- Duree de traitement reelle : FileFlows compte aussi l'attente du disque (verrou). -->
      <div v-if="timing" :title="`Total FileFlows : ${formatSeconds(timing.total_seconds)}`">
        <dt>Traitement</dt>
        <dd>{{ formatSeconds(timing.processing_seconds) }}<small v-if="timing.kind" class="ff-wait">{{ PROCESSING_KIND_LABELS[timing.kind] }}</small><small v-if="timing.wait_seconds >= 1" class="ff-wait">+ {{ formatSeconds(timing.wait_seconds) }} d'attente disque</small></dd>
      </div>
      <div v-else-if="file.duration"><dt>Durée</dt><dd>{{ file.duration }}</dd></div>
      <div v-if="change != null"><dt>Taille</dt><dd :class="{ 'is-smaller': change < 0 }">{{ change > 0 ? '+' : '' }}{{ change }} %</dd></div>
      <div v-if="file.date"><dt>Date</dt><dd>{{ formatDateTimeShort(file.date) }}</dd></div>
    </dl>
    <UiBadge :tone="fileStatusTone(file.status)" dot>{{ file.status_label }}</UiBadge>
    <div class="ff-actions">
      <UiButton v-if="timing?.steps.length" size="sm" :aria-expanded="showSteps" @click="showSteps = !showSteps"><ListTree />Étapes</UiButton>
      <UiButton size="sm" @click="emit('log', file)"><ScrollText />Journal</UiButton>
      <UiButton v-if="canReprocess" size="sm" :loading="busy" @click="emit('reprocess', file)"><RotateCcw />Relancer</UiButton>
      <UiButton v-if="file.status === FILEFLOWS_STATUS.queued && position !== 1" size="sm" aria-label="Mettre en tête de file" title="Mettre en tête de file" @click="emit('top', file)"><ArrowUpToLine /></UiButton>
    </div>
    <ol v-if="showSteps && timing" class="ff-steps">
      <li v-for="(step, index) in timing.steps" :key="index" :class="{ 'is-wait': step.name.startsWith('0. Verrou') }">
        <span>{{ step.name }}</span>
        <span class="ff-step-bar" :style="{ '--share': `${share(step.seconds)}%` }" aria-hidden="true" />
        <strong>{{ formatSeconds(step.seconds) }}</strong>
      </li>
    </ol>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowUpToLine, ListTree, RotateCcw, ScrollText } from '@lucide/vue';
import { FILEFLOWS_STATUS, PROCESSING_KIND_LABELS, fileBaseName, fileStatusTone, formatSeconds, sizeChange, type FileflowsFile } from '@/composables/useFileflows';
import { useOuvrirFiche } from '@/composables/useMediaOverlay';
import { formatDateTimeShort } from '@/utils/format';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiCheckbox from '@/components/ui/UiCheckbox.vue';

const props = withDefaults(defineProps<{ file: FileflowsFile; selectable?: boolean; selected?: boolean; busy?: boolean; showMedia?: boolean; position?: number | null }>(), {
  selectable: false, selected: false, busy: false, showMedia: true, position: null,
});
const emit = defineEmits<{
  (e: 'toggle', uid: string): void;
  (e: 'log', file: FileflowsFile): void;
  (e: 'reprocess', file: FileflowsFile): void;
  (e: 'top', file: FileflowsFile): void;
}>();

const { auClic: ouvrirFicheAuClic } = useOuvrirFiche();
const mediaLink = computed(() => `/library/media/library/${props.file.media?.id}`);
const mediaLabel = computed(() => {
  const media = props.file.media;
  return media?.year ? `${media.title} (${media.year})` : media?.title || '';
});
const change = computed(() => sizeChange(props.file));
const timing = computed(() => props.file.timing || null);
const showSteps = ref(false);
/* Part de chaque etape dans le total, pour reperer d'un coup d'oeil ce qui coute cher. */
function share(seconds: number): number {
  const total = timing.value?.total_seconds || 0;
  return total ? Math.max(1, Math.round((seconds / total) * 100)) : 0;
}
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
.ff-position { margin-right: 8px; color: var(--muted); font-variant-numeric: tabular-nums; font-weight: 500; }
.ff-relaunched { margin-left: 8px; padding: 1px 7px; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); font-size: var(--fs-xs); font-weight: 650; }
.ff-media:hover { text-decoration: underline; }
.ff-reason { color: var(--red-text); font-size: var(--fs-xs); overflow-wrap: anywhere; }
.ff-stats { display: flex; gap: var(--space-3); margin: 0; }
.ff-stats dt { color: var(--muted); font-size: var(--fs-xs); }
.ff-stats dd { margin: 0; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ff-stats .is-smaller { color: var(--green-text); }
.ff-actions { display: flex; gap: var(--space-2); }
.ff-wait { display: block; color: var(--muted); font-size: var(--fs-xs); font-weight: 500; }
.ff-steps { display: grid; grid-column: 1 / -1; gap: 4px; margin: 0; padding: var(--space-2) var(--space-3); border-radius: var(--inset-radius); background: var(--surface-2); list-style: none; font-size: var(--fs-xs); }
.ff-steps li { display: grid; grid-template-columns: minmax(0, 14rem) minmax(0, 1fr) 5.5rem; align-items: center; gap: var(--space-2); }
.ff-steps li > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ff-steps strong { text-align: right; font-variant-numeric: tabular-nums; }
.ff-step-bar { height: 6px; border-radius: var(--radius-pill); background: linear-gradient(90deg, var(--accent) var(--share), transparent var(--share)); }
.ff-steps .is-wait { color: var(--muted); }
.ff-steps .is-wait .ff-step-bar { background: linear-gradient(90deg, var(--border) var(--share), transparent var(--share)); }
@include bp.until(tablet) {
  .ff-row, .ff-row:not(:has(.ui-checkbox)) { grid-template-columns: auto minmax(0, 1fr) auto; }
  .ff-row:not(:has(.ui-checkbox)) { grid-template-columns: minmax(0, 1fr) auto; }
  .ff-stats, .ff-actions { grid-column: 1 / -1; }
  .ff-stats { flex-wrap: wrap; }
}
</style>
