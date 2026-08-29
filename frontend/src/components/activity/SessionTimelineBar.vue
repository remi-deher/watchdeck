<template>
  <div class="session-timeline-container" v-if="hasTimelineData">
    <!-- En-tête avec titre, ratios et bouton de dépliage -->
    <div class="timeline-header">
      <div class="header-left">
        <span class="timeline-title">Timeline de lecture</span>
        <span class="timeline-ratio-badge" v-if="activePlayRatio !== null && (hasPause || segments.length > 1)">
          {{ activePlayRatio }}% actif
        </span>
      </div>

      <button
        type="button"
        class="timeline-toggle-btn"
        :aria-expanded="isExpanded"
        :aria-label="isExpanded ? 'Masquer le détail des segments' : 'Afficher le détail des segments'"
        @click="toggleExpanded"
      >
        <span>{{ segments.length > 1 ? `${segments.length} segments` : 'Détails' }}</span>
        <ChevronDown :class="['toggle-chevron', { 'is-open': isExpanded }]" :size="14" />
      </button>
    </div>

    <!-- Barre visuelle segmentée -->
    <div
      class="timeline-track-wrapper"
      role="progressbar"
      :aria-valuenow="progressPercent"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div class="timeline-track">
        <div
          v-for="(seg, idx) in normalizedSegments"
          :key="seg.id || idx"
          :class="[
            'timeline-segment',
            `seg-${seg.state}`,
            seg.playback_method ? `method-${seg.playback_method}` : '',
            { 'is-selected': highlightedIndex === idx },
            { 'is-live': isLiveActiveSegment(seg, idx) }
          ]"
          :style="{ width: `${seg.percentWidth}%` }"
          :title="segmentTooltip(seg)"
          tabindex="0"
          @click="selectSegment(idx)"
          @keydown.enter="selectSegment(idx)"
          @keydown.space.prevent="selectSegment(idx)"
        >
          <span class="live-pulse" v-if="isLiveActiveSegment(seg, idx)" />
          <span class="sr-only">{{ segmentTooltip(seg) }}</span>
        </div>
      </div>

      <!-- Repères temporels (Ticks) sous la barre -->
      <div class="timeline-ticks" aria-hidden="true">
        <span>0:00</span>
        <span v-if="totalDurationMs > 60000">{{ formatDuration(Math.round(totalDurationMs / 2)) }}</span>
        <span>{{ formatDuration(totalDurationMs) }}</span>
      </div>
    </div>

    <!-- Légende récapitulative -->
    <div class="timeline-legend">
      <div class="legend-item" v-if="hasDirectPlay">
        <span class="legend-dot dot-direct"></span>
        <span>Lecture directe ({{ formatDuration(directPlayMs) }})</span>
      </div>
      <div class="legend-item" v-if="hasTranscode">
        <span class="legend-dot dot-transcode"></span>
        <span>Transcodage ({{ formatDuration(transcodeMs) }})</span>
      </div>
      <div class="legend-item" v-if="hasPause">
        <span class="legend-dot dot-pause"></span>
        <span>Pause ({{ formatDuration(pausedMs) }})</span>
      </div>
    </div>

    <!-- Journal détaillé des segments (Dépliable) -->
    <transition name="expand">
      <div class="segments-log-drawer" v-if="isExpanded">
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
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown, Clock, FastForward, Pause, Play, RotateCw, Zap } from '@lucide/vue';
import { formatDurationExact as formatDuration, formatTime } from '@/utils/format';

interface Segment {
  id?: number;
  state: string;
  playback_method?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_ms: number;
  view_offset_start_ms?: number;
  view_offset_end_ms?: number;
}

const props = defineProps<{
  session: Record<string, any>;
}>();

const isExpanded = ref(false);
const highlightedIndex = ref<number | null>(null);

function toggleExpanded() {
  isExpanded.value = !isExpanded.value;
}

function selectSegment(idx: number) {
  isExpanded.value = true;
  highlightedIndex.value = idx;
}

const segments = computed<Segment[]>(() => {
  if (Array.isArray(props.session?.segments) && props.session.segments.length > 0) {
    return props.session.segments;
  }
  // Fallback si pas de segments détaillés
  const watched = props.session?.progress_ms || props.session?.watched_ms || 0;
  if (watched > 0) {
    return [
      {
        state: props.session?.state || 'playing',
        playback_method: props.session?.playback_method || 'direct_play',
        duration_ms: watched,
        view_offset_start_ms: props.session?.initial_progress_ms || 0,
        view_offset_end_ms: watched,
      },
    ];
  }
  return [];
});

const hasTimelineData = computed(() => segments.value.length > 0 || (props.session?.duration_ms || 0) > 0);

const totalDurationMs = computed(() => {
  return Math.max(
    props.session?.duration_ms || 0,
    props.session?.progress_ms || 0,
    segments.value.reduce((acc, s) => acc + (s.duration_ms || 0), 0),
    1
  );
});

const totalTimelineMs = computed(() => {
  const totalSegMs = segments.value.reduce((acc, s) => acc + (s.duration_ms || 0), 0);
  return Math.max(totalSegMs, totalDurationMs.value, 1);
});

const progressPercent = computed(() => {
  return Math.min(
    100,
    Math.round(((props.session?.progress_ms || props.session?.watched_ms || 0) / totalDurationMs.value) * 100)
  );
});

const normalizedSegments = computed(() => {
  const total = totalTimelineMs.value;
  return segments.value.map((seg) => {
    const dur = Math.max(seg.duration_ms || 0, 1000); // Au moins 1s visible
    const percentWidth = Math.max(0.8, (dur / total) * 100);
    return {
      ...seg,
      percentWidth,
    };
  });
});

const directPlayMs = computed(() => {
  return segments.value
    .filter((s) => s.state === 'playing' && s.playback_method !== 'transcode')
    .reduce((acc, s) => acc + (s.duration_ms || 0), 0);
});

const transcodeMs = computed(() => {
  return segments.value
    .filter((s) => s.state === 'playing' && s.playback_method === 'transcode')
    .reduce((acc, s) => acc + (s.duration_ms || 0), 0);
});

const pausedMs = computed(() => {
  return (
    props.session?.paused_ms ||
    segments.value
      .filter((s) => s.state === 'paused')
      .reduce((acc, s) => acc + (s.duration_ms || 0), 0)
  );
});

const pauseCount = computed(() => {
  return segments.value.filter((s) => s.state === 'paused').length;
});

const hasDirectPlay = computed(() => directPlayMs.value > 0);
const hasTranscode = computed(() => transcodeMs.value > 0);
const hasPause = computed(() => pausedMs.value > 0);

const activePlayRatio = computed<number | null>(() => {
  const totalPlay = directPlayMs.value + transcodeMs.value;
  const totalOverall = totalPlay + pausedMs.value;
  if (totalOverall <= 0) return null;
  return Math.round((totalPlay / totalOverall) * 100);
});

function isLiveActiveSegment(seg: Segment, idx: number): boolean {
  return (
    idx === segments.value.length - 1 &&
    props.session?.state === 'playing' &&
    !props.session?.ended_at &&
    seg.state === 'playing'
  );
}

function segmentStateLabel(seg: Segment): string {
  if (seg.state === 'paused') return 'Pause';
  if (seg.state === 'buffering') return 'Mise en mémoire tampon';
  if (seg.state === 'playing') {
    return seg.playback_method === 'transcode' ? 'Lecture (Transcodage)' : 'Lecture directe';
  }
  return 'Session';
}

function segmentTooltip(seg: Segment): string {
  const label = segmentStateLabel(seg);
  const dur = formatDuration(seg.duration_ms);
  let timeStr = '';
  if (seg.started_at) {
    const start = formatTime(seg.started_at);
    const end = seg.ended_at ? formatTime(seg.ended_at) : 'en cours';
    timeStr = ` [${start} - ${end}]`;
  }
  let offsetStr = '';
  if (seg.view_offset_start_ms !== undefined && seg.view_offset_end_ms !== undefined) {
    offsetStr = ` (Position : ${formatDuration(seg.view_offset_start_ms)} -> ${formatDuration(seg.view_offset_end_ms)})`;
  }
  return `${label} : ${dur}${timeStr}${offsetStr}`;
}
</script>

<style scoped>
.session-timeline-container {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 0.35rem;
  padding: 0.75rem;
  background: var(--bg-surface-elevated, rgba(15, 23, 42, 0.4));
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius-md, 0.5rem);
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.timeline-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted, #94a3b8);
}

.timeline-ratio-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 9999px;
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.timeline-toggle-btn {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  background: transparent;
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.12));
  color: var(--text-secondary, #cbd5e1);
  font-size: 0.7rem;
  font-weight: 500;
  padding: 0.2rem 0.5rem;
  border-radius: var(--radius-sm, 0.25rem);
  cursor: pointer;
  transition: all 0.2s ease;
}

.timeline-toggle-btn:hover {
  background: var(--bg-surface-hover, rgba(255, 255, 255, 0.08));
  color: var(--text-primary, #ffffff);
  border-color: var(--border-strong, rgba(255, 255, 255, 0.2));
}

.toggle-chevron {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-chevron.is-open {
  transform: rotate(180deg);
}

.timeline-track-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.timeline-track {
  display: flex;
  height: 0.8rem;
  background: var(--bg-surface-soft, rgba(255, 255, 255, 0.06));
  border-radius: 9999px;
  overflow: hidden;
  gap: 2px;
  padding: 1px;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
}

.timeline-segment {
  position: relative;
  height: 100%;
  border-radius: 3px;
  transition: opacity 0.15s ease, transform 0.15s ease, filter 0.15s ease;
  cursor: pointer;
}

.timeline-segment:hover,
.timeline-segment:focus-visible {
  opacity: 0.9;
  filter: brightness(1.25);
  transform: scaleY(1.15);
  outline: 1px solid var(--accent, #6366f1);
}

.timeline-segment.is-selected {
  outline: 2px solid #ffffff;
  filter: brightness(1.3);
}

.seg-playing {
  background: #10b981; /* Emerald 500 */
}

.seg-playing.method-transcode {
  background: #f59e0b; /* Amber 500 */
}

.seg-paused {
  background: #64748b; /* Slate 500 */
}

.seg-buffering {
  background: #a855f7; /* Purple 500 */
}

.live-pulse {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 4px;
  background: #ffffff;
  border-radius: 9999px;
  animation: pulse-glow 1.5s infinite ease-in-out;
}

@keyframes pulse-glow {
  0%, 100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
    box-shadow: 0 0 6px #ffffff;
  }
}

.timeline-ticks {
  display: flex;
  justify-content: space-between;
  font-size: 0.65rem;
  font-weight: 500;
  color: var(--text-muted, #94a3b8);
  padding: 0 0.15rem;
}

.timeline-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  font-size: 0.75rem;
  color: var(--text-secondary, #cbd5e1);
  margin-top: 0.1rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.legend-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}

.dot-direct {
  background: #10b981;
}

.dot-transcode {
  background: #f59e0b;
}

.dot-pause {
  background: #64748b;
}

/* Journal détaillé des segments */
.segments-log-drawer {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.4rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.68rem;
  color: var(--text-muted, #94a3b8);
}

.log-eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}

.log-stats {
  color: var(--text-secondary, #cbd5e1);
  font-weight: 500;
}

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
  background: var(--bg-surface-soft, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
  cursor: pointer;
  transition: all 0.15s ease;
}

.segment-row:hover,
.segment-row:focus-visible {
  background: var(--bg-surface-hover, rgba(255, 255, 255, 0.08));
  border-color: var(--border-strong, rgba(255, 255, 255, 0.15));
}

.segment-row.row-highlighted {
  border-color: var(--accent, #6366f1);
  background: rgba(99, 102, 241, 0.12);
}

.segment-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.row-playing .segment-icon-wrapper {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.row-playing .icon-transcode {
  color: #f59e0b;
}

.row-paused .segment-icon-wrapper {
  background: rgba(100, 116, 139, 0.15);
  color: #94a3b8;
}

.row-buffering .segment-icon-wrapper {
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
}

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

.segment-name {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary, #ffffff);
}

.segment-duration-tag {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-secondary, #cbd5e1);
}

.segment-sub-info {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.68rem;
  color: var(--text-muted, #94a3b8);
}

.info-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

/* Animations de transition */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-4px);
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 250px;
  transform: translateY(0);
}

</style>
