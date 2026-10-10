<template>
  <!-- Lectures consecutives repliees dans une ligne de l'historique : chacune a son mode
       (un episode transcode, le suivant en lecture directe), ses flux et sa conversion.
       On passe de l'une a l'autre sans revenir a la liste. -->
  <nav v-if="index >= 0" class="run-panel" aria-label="Lectures consécutives">
    <div class="run-head">
      <span class="eyebrow">Lectures consécutives</span>
      <strong>Lecture {{ index + 1 }} sur {{ run.length }}</strong>
      <PlaybackMethodBadge v-if="mixed" :playbacks="run" compact />
      <div class="run-arrows">
        <UiButton variant="ghost" icon-only title="Lecture précédente" aria-label="Lecture précédente" :disabled="index === 0" @click="$emit('open', run[index - 1].id)"><ChevronLeft /></UiButton>
        <UiButton variant="ghost" icon-only title="Lecture suivante" aria-label="Lecture suivante" :disabled="index === run.length - 1" @click="$emit('open', run[index + 1].id)"><ChevronRight /></UiButton>
      </div>
    </div>
    <ol class="run-list">
      <li v-for="(item, position) in run" :key="item.id">
        <button type="button" :class="{ current: position === index }" :aria-current="position === index ? 'true' : undefined" @click="position !== index && $emit('open', item.id)">
          <span class="run-number">{{ position + 1 }}</span>
          <span class="run-label">{{ item.label }}</span>
          <PlaybackMethodBadge :playback="item" compact />
          <small>{{ formatTime(item.started_at) }}<template v-if="item.watched_ms"> · {{ formatDuration(item.watched_ms) }}</template></small>
        </button>
      </li>
    </ol>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import type { LectureDeSerie } from '@/composables/useMediaOverlay';
import { formatDurationExact as formatDuration, formatTime } from '@/utils/format';
import PlaybackMethodBadge from './PlaybackMethodBadge.vue';

const props = defineProps<{ run: LectureDeSerie[]; currentId: string | number }>();
defineEmits<{ (e: 'open', id: string): void }>();

const index = computed(() => (props.run.length > 1 ? props.run.findIndex((item) => String(item.id) === String(props.currentId)) : -1));
const mixed = computed(() => new Set(props.run.map((item) => item.method || '')).size > 1);
</script>

<style scoped>
.run-panel { container: run / inline-size; display: grid; gap: 8px; margin-top: 16px; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface-2); }
.run-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.run-head strong { font-size: var(--fs-sm); }
.run-arrows { display: flex; gap: 4px; margin-left: auto; }
.run-list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; max-height: 240px; overflow-y: auto; }
.run-list button { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto auto; gap: 10px; align-items: center; width: 100%; padding: 6px 9px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--text); font-size: var(--fs-xs); text-align: left; cursor: pointer; }
.run-list button:hover { background: rgb(var(--ink) / .045); }
.run-list button.current { border-color: color-mix(in srgb, var(--accent) 50%, transparent); background: color-mix(in srgb, var(--accent) 10%, transparent); cursor: default; }
.run-number { color: var(--muted); font-variant-numeric: tabular-nums; text-align: right; }
.run-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-list small { color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
@container run (max-width: 480px) { .run-list button { grid-template-columns: 24px minmax(0, 1fr) auto; } .run-list small { grid-column: 2 / -1; } }
</style>
