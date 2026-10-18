<template>
  <!-- Frise d'étapes : horizontale quand la place le permet (une colonne par étape, rail coloré
       jusqu'à la dernière étape franchie), verticale sinon. L'étape en cours porte
       `aria-current="step"`. La date vient de `at` (mise en forme par `formatAt`) ; l'emplacement
       `meta` la remplace pour une étape qui dit autre chose (« Étape actuelle », une note…). -->
  <div class="step-timeline">
    <ol class="step-timeline__list" :style="{ '--step-progress': progress, '--step-count': steps.length }">
      <li
        v-for="step in steps"
        :key="step.key"
        :class="['step-timeline__step', `is-${step.state}`]"
        :aria-current="step.state === 'current' ? 'step' : undefined"
      >
        <span class="step-timeline__dot" aria-hidden="true">
          <Check v-if="step.state === 'done'" />
          <X v-else-if="step.state === 'error'" />
          <span v-else-if="step.state === 'current'" class="step-timeline__core" />
        </span>
        <span class="step-timeline__label">{{ step.label }}</span>
        <slot name="meta" :step="step">
          <span v-if="step.note" :class="['step-timeline__meta', step.noteTone && `is-${step.noteTone}`]">{{ step.note }}</span>
          <time v-else-if="step.at" class="step-timeline__meta" :datetime="step.at">{{ formatAt ? formatAt(step.at) : step.at }}</time>
        </slot>
        <span class="visually-hidden">{{ STATE_LABELS[step.state] }}</span>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Check, X } from '@lucide/vue';

export interface TimelineStep {
  key: string;
  label: string;
  state: 'done' | 'current' | 'upcoming' | 'error';
  /** Instant de l'étape (ISO) : n'est jamais inventé, absent quand le serveur ne le connaît pas. */
  at?: string | null;
  /** Texte libre à la place de la date. */
  note?: string;
  noteTone?: 'positive' | 'attention';
}

const STATE_LABELS = { done: 'étape franchie', current: 'étape en cours', upcoming: 'étape à venir', error: 'étape en erreur' };

const props = defineProps<{
  steps: TimelineStep[];
  formatAt?: (value: string) => string;
}>();

/* Part du rail horizontal colorée : jusqu'à la dernière étape franchie ou en cours. */
const progress = computed(() => {
  const list = props.steps;
  if (list.length < 2) return 0;
  let last = 0;
  list.forEach((step, index) => {
    if (step.state !== 'upcoming') last = index;
  });
  return last / (list.length - 1);
});
</script>

<style scoped lang="scss">
.step-timeline { container: step-timeline / inline-size; }
.step-timeline__list {
  position: relative;
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.step-timeline__step {
  position: relative;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  column-gap: var(--space-3);
  padding-bottom: var(--space-3);
}
.step-timeline__step:last-child {
  padding-bottom: 0;
}
/* Trait vertical entre deux pastilles (disposition étroite). */
.step-timeline__step:not(:last-child)::before {
  content: '';
  position: absolute;
  top: 24px;
  bottom: 0;
  left: 11px;
  width: 2px;
  background: var(--surface-3);
}
.step-timeline__step.is-done:not(:last-child)::before {
  background: var(--green);
}
.step-timeline__dot {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  box-sizing: border-box;
  border: 2px solid var(--surface-3);
  border-radius: 50%;
  background: var(--surface);
  color: var(--bg);
}
.step-timeline__dot svg {
  width: 14px;
  height: 14px;
  stroke-width: 3;
}
.is-done .step-timeline__dot {
  border-color: var(--green);
  background: var(--green);
}
.is-error .step-timeline__dot {
  border-color: var(--red);
  background: var(--red);
}
.is-current .step-timeline__dot {
  border: 3px solid var(--green);
  background: var(--bg);
}
.step-timeline__core {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
}
.step-timeline__label {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text);
}
.is-upcoming .step-timeline__label {
  color: var(--muted);
  font-weight: 500;
}
.is-current .step-timeline__label {
  color: var(--green-text);
  font-weight: 700;
}
.is-error .step-timeline__label {
  color: var(--red-text);
}
.step-timeline__meta {
  color: var(--muted);
  font-size: var(--fs-xs);
  white-space: nowrap;
}
.step-timeline__meta.is-attention {
  color: var(--amber-text);
}
.step-timeline__meta.is-positive {
  color: var(--green-text);
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* Disposition large : frise horizontale, une colonne par étape. */
@container step-timeline (min-width: 640px) {
  .step-timeline__list {
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    grid-auto-flow: column;
  }
  /* Rail gris de la première à la dernière pastille, puis la part franchie en vert. */
  .step-timeline__list::before,
  .step-timeline__list::after {
    content: '';
    position: absolute;
    top: 11px;
    left: calc(50% / var(--step-count, 6));
    height: 2px;
  }
  .step-timeline__list::before {
    right: calc(50% / var(--step-count, 6));
    background: var(--surface-3);
  }
  .step-timeline__list::after {
    width: calc((100% - 100% / var(--step-count, 6)) * var(--step-progress, 0));
    background: var(--green);
  }
  .step-timeline__step {
    grid-template-columns: none;
    justify-items: center;
    align-content: start;
    row-gap: var(--space-2);
    padding: 0 var(--space-1);
    text-align: center;
  }
  .step-timeline__step:not(:last-child)::before {
    display: none;
  }
}
</style>
