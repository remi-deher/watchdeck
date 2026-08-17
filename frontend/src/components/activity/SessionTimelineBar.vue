<template>
  <div class="session-timeline-container" v-if="hasTimelineData">
    <div class="timeline-header">
      <span class="timeline-title">Timeline de lecture</span>
      <span class="timeline-summary" v-if="segments.length > 1">
        {{ segments.length }} segments
      </span>
    </div>

    <!-- Barre visuelle segmentée -->
    <div class="timeline-track" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100">
      <div
        v-for="(seg, idx) in normalizedSegments"
        :key="seg.id || idx"
        :class="['timeline-segment', `seg-${seg.state}`, seg.playback_method ? `method-${seg.playback_method}` : '']"
        :style="{ width: `${seg.percentWidth}%` }"
        :title="segmentTooltip(seg)"
        tabindex="0"
      >
        <span class="sr-only">{{ segmentTooltip(seg) }}</span>
      </div>
    </div>

    <!-- Légende des segments -->
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
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

const totalTimelineMs = computed(() => {
  const totalSegMs = segments.value.reduce((acc, s) => acc + (s.duration_ms || 0), 0);
  return Math.max(totalSegMs, props.session?.duration_ms || 0, props.session?.progress_ms || 0, 1);
});

const progressPercent = computed(() => {
  return Math.min(100, Math.round(((props.session?.progress_ms || props.session?.watched_ms || 0) / (props.session?.duration_ms || 1)) * 100));
});

const normalizedSegments = computed(() => {
  const total = totalTimelineMs.value;
  return segments.value.map((seg) => {
    const dur = Math.max(seg.duration_ms || 0, 1000); // Au moins 1s visible
    const percentWidth = Math.max(0.5, (dur / total) * 100);
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
  return segments.value
    .filter((s) => s.state === 'paused')
    .reduce((acc, s) => acc + (s.duration_ms || 0), 0);
});

const hasDirectPlay = computed(() => directPlayMs.value > 0);
const hasTranscode = computed(() => transcodeMs.value > 0);
const hasPause = computed(() => pausedMs.value > 0);

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
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted, #94a3b8);
}

.timeline-summary {
  font-size: 0.7rem;
  color: var(--accent, #6366f1);
  font-weight: 500;
}

.timeline-track {
  display: flex;
  height: 0.65rem;
  background: var(--bg-surface-soft, rgba(255, 255, 255, 0.06));
  border-radius: 9999px;
  overflow: hidden;
  gap: 2px;
  padding: 1px;
}

.timeline-segment {
  height: 100%;
  border-radius: 2px;
  transition: opacity 0.15s ease, transform 0.15s ease;
  cursor: pointer;
}

.timeline-segment:hover,
.timeline-segment:focus {
  opacity: 0.85;
  transform: scaleY(1.2);
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

.timeline-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: var(--text-secondary, #cbd5e1);
  margin-top: 0.25rem;
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

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
