<template>
  <CollapsibleRoot v-if="hasTimelineData" v-model:open="isExpanded" class="session-timeline-container">
    <!-- En-tête avec titre, ratios et bouton de dépliage -->
    <div class="timeline-header">
      <div class="header-left">
        <span class="timeline-title">Déroulé de la lecture</span>
        <span class="timeline-ratio-badge" v-if="activePlayRatio !== null && (hasPause || segments.length > 1)">
          {{ activePlayRatio }} % en lecture
        </span>
      </div>

      <!-- Reka relie le bouton au journal (aria-controls) et tient aria-expanded. -->
      <CollapsibleTrigger
        class="timeline-toggle-btn"
        :aria-label="isExpanded ? 'Masquer le détail des segments' : 'Afficher le détail des segments'"
      >
        <span>{{ segments.length > 1 ? `${segments.length} passages` : 'Détails' }}</span>
        <ChevronDown :class="['toggle-chevron', { 'is-open': isExpanded }]" :size="14" />
      </CollapsibleTrigger>
    </div>

    <!-- Barre segmentée, repères temporels et légende récapitulative -->
    <UiSegmentTrack
      :segments="trackSegments"
      :total="totalDurationMs"
      :selected="highlightedIndex"
      :progress="progressPercent"
      :ticks="ticks"
      :legend="legend"
      @select="selectSegment"
    />

    <!-- Journal détaillé des segments (Dépliable) -->
    <transition name="expand">
      <CollapsibleContent v-if="isExpanded" class="segments-log-drawer">
        <div class="log-header">
          <span class="log-eyebrow">Journal des événements</span>
          <span class="log-stats" v-if="pauseCount > 0">
            {{ pauseCount }} {{ pauseCount > 1 ? 'pauses' : 'pause' }} ({{ formatDuration(pausedMs) }})
          </span>
        </div>

        <ul class="segments-list" role="list">
          <li
            v-for="(seg, idx) in segments"
            :key="seg.id || idx"
            :class="['segment-row', `row-${seg.state}`, { 'row-highlighted': highlightedIndex === idx }]"
            tabindex="0"
            @click="highlightedIndex = highlightedIndex === idx ? null : idx"
          >
            <div class="segment-icon-wrapper">
              <Play v-if="seg.state === 'playing' && seg.playback_method !== 'transcode'" :size="13" class="icon-play" />
              <Zap v-else-if="seg.state === 'playing' && seg.playback_method === 'transcode'" :size="13" class="icon-transcode" />
              <Pause v-else-if="seg.state === 'paused'" :size="13" class="icon-pause" />
              <RotateCw v-else-if="seg.state === 'buffering'" :size="13" class="icon-buffering" />
              <Clock v-else :size="13" />
            </div>

            <div class="segment-main-info">
              <div class="segment-title-line">
                <span class="segment-name">{{ segmentStateLabel(seg) }}</span>
                <span class="segment-duration-tag">{{ formatDuration(seg.duration_ms) }}</span>
              </div>

              <div class="segment-sub-info">
                <!-- Plage d'horloge réelle -->
                <span class="info-pill" v-if="seg.started_at">
                  <Clock :size="10" />
                  {{ formatTime(seg.started_at) }}<template v-if="seg.ended_at"> → {{ formatTime(seg.ended_at) }}</template><template v-else> (en cours)</template>
                </span>

                <!-- Position dans la vidéo -->
                <span class="info-pill" v-if="seg.view_offset_start_ms !== undefined">
                  <FastForward :size="10" />
                  Position : {{ formatDuration(seg.view_offset_start_ms) }}<template v-if="seg.view_offset_end_ms !== undefined"> → {{ formatDuration(seg.view_offset_end_ms) }}</template>
                </span>
              </div>
            </div>
          </li>
        </ul>
      </CollapsibleContent>
    </transition>
  </CollapsibleRoot>
</template>

<script setup lang="ts">
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui';
import { computed, ref } from 'vue';
import { ChevronDown, Clock, FastForward, Pause, Play, RotateCw, Zap } from '@lucide/vue';
import { formatDurationExact as formatDuration, formatTime } from '@/utils/format';
import UiSegmentTrack, { type TrackLegendItem } from '@/components/ui/UiSegmentTrack.vue';
import {
  playbackTrackSegments, segmentStateLabel, sessionDurationMs, sessionProgressPercent, sessionSegments, sessionTotals,
} from '@/activity/sessionTimeline';

/* Déroulé d'une lecture : la barre commune (UiSegmentTrack) nourrie des passages de la
   session, et leur journal dépliable. Les calculs vivent dans `@/activity/sessionTimeline`. */
const props = defineProps<{
  session: Record<string, any>;
}>();

const isExpanded = ref(false);
const highlightedIndex = ref<number | null>(null);

function selectSegment(idx: number) {
  isExpanded.value = true;
  highlightedIndex.value = idx;
}

const segments = computed(() => sessionSegments(props.session));
const hasTimelineData = computed(() => segments.value.length > 0 || (props.session?.duration_ms || 0) > 0);
const totalDurationMs = computed(() => sessionDurationMs(props.session, segments.value));
const progressPercent = computed(() => sessionProgressPercent(props.session, totalDurationMs.value));
const trackSegments = computed(() => playbackTrackSegments(props.session, segments.value));
const totals = computed(() => sessionTotals(props.session, segments.value));
const pausedMs = computed(() => totals.value.pausedMs);
const pauseCount = computed(() => totals.value.pauseCount);
const hasPause = computed(() => pausedMs.value > 0);
const activePlayRatio = computed(() => totals.value.activePlayRatio);

const ticks = computed(() => {
  const total = totalDurationMs.value;
  return ['0:00', ...(total > 60000 ? [formatDuration(Math.round(total / 2))] : []), formatDuration(total)];
});

const legend = computed(() => {
  const { directPlayMs, transcodeMs } = totals.value;
  const items: Array<TrackLegendItem | null> = [
    directPlayMs > 0 ? { key: 'direct', label: `Lecture directe (${formatDuration(directPlayMs)})`, tone: 'success' } : null,
    transcodeMs > 0 ? { key: 'transcode', label: `Transcodage (${formatDuration(transcodeMs)})`, tone: 'warning' } : null,
    hasPause.value ? { key: 'pause', label: `Pause (${formatDuration(pausedMs.value)})`, tone: 'neutral' } : null,
  ];
  return items.filter((item): item is TrackLegendItem => item !== null);
});
</script>

<style scoped>
.session-timeline-container {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 0.35rem;
  padding: 0.75rem;
  /* Bloc dans la carte « Progression » : un fond un cran plus clair suffit a le
     distinguer, un second cadre empilait les bordures. */
  background: rgb(var(--ink) / 0.04);
  border: 0;
  border-radius: var(--radius-sm);
}
.timeline-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}
/* Sur mobile, le titre et le badge passent a la ligne plutot que d'ecraser le bouton
   (« 10 segment / s » sur deux lignes). */
.header-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.timeline-title, .timeline-ratio-badge { white-space: nowrap; }
.timeline-title {
  font-size: var(--fs-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
.timeline-ratio-badge {
  font-size: var(--fs-xs);
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--green) 15%, transparent);
  color: var(--green);
  border: 1px solid color-mix(in srgb, var(--green) 25%, transparent);
}
.timeline-toggle-btn {
  display: flex;
  flex: none;
  white-space: nowrap;
  align-items: center;
  gap: 0.3rem;
  background: transparent;
  border: 1px solid var(--border-subtle, rgb(var(--ink) / 0.12));
  color: var(--text-secondary);
  font-size: var(--fs-xs);
  font-weight: 500;
  padding: 0.2rem 0.5rem;
  border-radius: var(--radius-sm, 0.25rem);
  cursor: pointer;
  transition: background-color var(--motion-duration-fast) var(--motion-ease-standard), border-color var(--motion-duration-fast) var(--motion-ease-standard), color var(--motion-duration-fast) var(--motion-ease-standard), box-shadow var(--motion-duration-fast) var(--motion-ease-standard), opacity var(--motion-duration-fast) var(--motion-ease-standard), transform var(--motion-duration-fast) var(--motion-ease-standard);
}
.timeline-toggle-btn:hover {
  background: var(--bg-surface-hover, rgb(var(--ink) / 0.08));
  color: var(--text-primary);
  border-color: var(--border-strong, rgb(var(--ink) / 0.2));
}
.toggle-chevron { transition: transform var(--motion-duration-fast) var(--motion-ease-standard); }
.toggle-chevron.is-open { transform: rotate(180deg); }
/* Journal détaillé des segments */
.segments-log-drawer {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.4rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--border-subtle, rgb(var(--ink) / 0.08));
}
.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.log-eyebrow { text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }
.log-stats { color: var(--text-secondary); font-weight: 500; }
.segments-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: 180px;
  overflow-y: auto;
}
.segment-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.5rem;
  border-radius: var(--radius-sm, 0.35rem);
  background: var(--bg-surface-soft, rgb(var(--ink) / 0.04));
  border: 0;
  cursor: pointer;
  transition: background-color var(--motion-duration-instant) var(--motion-ease-standard), border-color var(--motion-duration-instant) var(--motion-ease-standard), color var(--motion-duration-instant) var(--motion-ease-standard), box-shadow var(--motion-duration-instant) var(--motion-ease-standard), opacity var(--motion-duration-instant) var(--motion-ease-standard), transform var(--motion-duration-instant) var(--motion-ease-standard);
}
.segment-row:hover,
.segment-row:focus-visible {
  background: var(--bg-surface-hover, rgb(var(--ink) / 0.08));
  border-color: var(--border-strong, rgb(var(--ink) / 0.15));
}
.segment-row.row-highlighted { border-color: var(--accent); background: color-mix(in srgb, var(--blue) 12%, transparent); }
.segment-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.row-playing .segment-icon-wrapper { background: color-mix(in srgb, var(--green) 15%, transparent); color: var(--green); }
.row-playing .icon-transcode { color: var(--amber-text); }
.row-paused .segment-icon-wrapper { background: color-mix(in srgb, var(--slate) 15%, transparent); color: var(--muted); }
.row-buffering .segment-icon-wrapper { background: color-mix(in srgb, var(--violet) 15%, transparent); color: var(--violet-text); }
.segment-main-info {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 0.15rem;
  min-width: 0;
}
.segment-title-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}
.segment-name { font-size: var(--fs-xs); font-weight: 600; color: var(--text-primary); }
.segment-duration-tag { font-size: var(--fs-xs); font-weight: 600; color: var(--text-secondary); }
.segment-sub-info {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.info-pill { display: inline-flex; align-items: center; gap: 0.25rem; }
/* Animations de transition */
.expand-enter-active,
.expand-leave-active {
  transition: background-color var(--motion-duration-fast) var(--motion-ease-standard), border-color var(--motion-duration-fast) var(--motion-ease-standard), color var(--motion-duration-fast) var(--motion-ease-standard), box-shadow var(--motion-duration-fast) var(--motion-ease-standard), opacity var(--motion-duration-fast) var(--motion-ease-standard), transform var(--motion-duration-fast) var(--motion-ease-standard);
  overflow: hidden;
}
.expand-enter-from, .expand-leave-to { opacity: 0; max-height: 0; transform: translateY(-4px); }
.expand-enter-to, .expand-leave-from { opacity: 1; max-height: 250px; transform: translateY(0); }
</style>
