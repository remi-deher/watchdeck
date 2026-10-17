<template>
  <!-- Barre de temps segmentée : chaque segment occupe sa part de `total` (au moins
       `minPercent` pour rester visible), prend la couleur de son ton et se sélectionne au clic
       ou au clavier (`select`). Un segment `live` porte une pulsation à son bord. Les repères
       (`ticks`) s'espacent sous la barre ; la légende (`legend`) reprend les mêmes tons. -->
  <div class="segment-track">
    <div
      class="timeline-track-wrapper"
      role="progressbar"
      :aria-valuenow="progress"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div class="timeline-track">
        <div
          v-for="(segment, index) in segments"
          :key="segment.key ?? index"
          :class="[
            'timeline-segment',
            segment.tone && `tone-${segment.tone}`,
            segment.class,
            { 'is-selected': selected === index, 'is-live': segment.live },
          ]"
          :style="{ width: `${widthOf(segment)}%` }"
          :title="segment.label"
          tabindex="0"
          @click="emit('select', index)"
          @keydown.enter="emit('select', index)"
          @keydown.space.prevent="emit('select', index)"
        >
          <span v-if="segment.live" class="live-pulse" />
          <span class="sr-only">{{ segment.label }}</span>
        </div>
      </div>

      <div v-if="ticks.length" class="timeline-ticks" aria-hidden="true">
        <span v-for="(tick, index) in ticks" :key="index">{{ tick }}</span>
      </div>
    </div>

    <div v-if="legend" class="timeline-legend">
      <div v-for="item in legend" :key="item.key" class="legend-item">
        <span :class="['legend-dot', `tone-${item.tone}`]"></span>
        <span>{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
export type TrackTone = 'success' | 'warning' | 'neutral' | 'accent';

export interface TrackSegment {
  key?: string | number;
  /** Étendue du segment, dans l'unité de `total` (durée en ms, le plus souvent). */
  size: number;
  /** Couleur du segment ; sans ton, il laisse voir le fond de la barre. */
  tone?: TrackTone;
  /** Infobulle et texte lu par les lecteurs d'écran. */
  label: string;
  /** Segment en cours : pulsation à son bord. */
  live?: boolean;
  /** Classes propres à l'appelant (repères de test, état métier). */
  class?: string | string[];
}

export interface TrackLegendItem {
  key: string;
  label: string;
  tone: TrackTone;
}

const props = withDefaults(defineProps<{
  segments: TrackSegment[];
  /** Somme de référence des étendues : la barre entière. */
  total: number;
  selected?: number | null;
  /** Avancement annoncé (aria-valuenow), en pour cent. */
  progress?: number;
  ticks?: string[];
  /** Légende des tons ; fournie, elle garde sa place même vide. */
  legend?: TrackLegendItem[];
  minPercent?: number;
}>(), {
  selected: null,
  progress: undefined,
  ticks: () => [],
  legend: undefined,
  minPercent: 0.8,
});

const emit = defineEmits<{ select: [index: number] }>();

function widthOf(segment: TrackSegment): number {
  return Math.max(props.minPercent, (segment.size / Math.max(props.total, 1)) * 100);
}
</script>

<style scoped>
/* Même écart que le bloc qui l'accueille : barre et légende s'y empilent comme ses autres parties. */
.segment-track { display: flex; flex-direction: column; gap: 0.6rem; }
.timeline-track-wrapper { display: flex; flex-direction: column; gap: 0.25rem; }

.timeline-track {
  display: flex;
  height: 0.8rem;
  background: var(--bg-surface-soft, rgb(var(--ink) / 0.06));
  border-radius: var(--radius-pill);
  overflow: hidden;
  gap: 2px;
  padding: 1px;
  box-shadow: inset 0 1px 2px rgb(var(--shadow-color) / calc(0.3 * var(--shadow-scale)));
}

.timeline-segment {
  position: relative;
  height: 100%;
  border-radius: var(--radius-xs);
  transition: opacity var(--motion-duration-instant) var(--motion-ease-standard), transform var(--motion-duration-instant) var(--motion-ease-standard), filter var(--motion-duration-instant) var(--motion-ease-standard);
  cursor: pointer;
}
.timeline-segment:hover,
.timeline-segment:focus-visible {
  opacity: 0.9;
  filter: brightness(1.25);
  transform: scaleY(1.15);
  outline: 1px solid var(--accent);
}
.timeline-segment.is-selected { outline: 2px solid var(--text); filter: brightness(1.3); }

.tone-success { background: var(--green); }
.tone-warning { background: var(--amber); }
.tone-neutral { background: var(--slate); }
.tone-accent { background: var(--violet); }

.live-pulse {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 4px;
  background: var(--text);
  border-radius: var(--radius-pill);
  animation: pulse-glow 1.5s infinite ease-in-out;
}
@keyframes pulse-glow {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; box-shadow: 0 0 6px var(--text); }
}

.timeline-ticks {
  display: flex;
  justify-content: space-between;
  font-size: var(--fs-xs);
  font-weight: 500;
  color: var(--text-muted);
  padding: 0 0.15rem;
}

.timeline-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-top: 0.1rem;
}
.legend-item { display: flex; align-items: center; gap: 0.35rem; }
.legend-dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; }
</style>
