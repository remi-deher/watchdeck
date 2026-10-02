<template>
  <!-- Frise datée du parcours : horizontale quand la carte a la place, verticale sinon
       (container query sur `parcours`, posée par la carte parente). -->
  <ol class="journey-steps" :style="{ '--journey-progress': progress, '--journey-count': steps.length }">
    <li
      v-for="step in steps"
      :key="step.key"
      :class="['journey-step', `is-${step.state}`]"
      :aria-current="step.state === 'current' ? 'step' : undefined"
    >
      <span class="journey-dot" aria-hidden="true">
        <Check v-if="step.state === 'done'" />
        <X v-else-if="step.state === 'error'" />
        <span v-else-if="step.state === 'current'" class="journey-dot-core" />
      </span>
      <span class="journey-label">{{ step.label }}</span>
      <span v-if="step.note" :class="['journey-meta', step.noteTone && `is-${step.noteTone}`]">{{ step.note }}</span>
      <time v-else-if="step.at" class="journey-meta" :datetime="step.at">{{ shortDateTime(step.at) }}</time>
      <span class="visually-hidden">{{ STATE_LABELS[step.state] }}</span>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Check, X } from '@lucide/vue';
import { journeySteps, shortDateTime } from './requestRules';

const STATE_LABELS = { done: 'étape franchie', current: 'étape en cours', upcoming: 'étape à venir', error: 'étape en erreur' };

const props = defineProps<{
  row: any;
}>();

const steps = computed(() => journeySteps(props.row));
/* Part de la ligne horizontale colorée : jusqu'à la dernière étape franchie ou en cours. */
const progress = computed(() => {
  const list = steps.value;
  if (list.length < 2) return 0;
  let last = 0;
  list.forEach((step, index) => {
    if (step.state !== 'upcoming') last = index;
  });
  return last / (list.length - 1);
});
</script>

<style scoped lang="scss">
.journey-steps {
  position: relative;
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.journey-step {
  position: relative;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  column-gap: var(--space-3);
  padding-bottom: var(--space-3);
}
.journey-step:last-child {
  padding-bottom: 0;
}
/* Trait vertical entre deux pastilles (disposition étroite). */
.journey-step:not(:last-child)::before {
  content: '';
  position: absolute;
  top: 24px;
  bottom: 0;
  left: 11px;
  width: 2px;
  background: var(--surface-3);
}
.journey-step.is-done:not(:last-child)::before {
  background: var(--green);
}
.journey-dot {
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
.journey-dot svg {
  width: 14px;
  height: 14px;
  stroke-width: 3;
}
.is-done .journey-dot {
  border-color: var(--green);
  background: var(--green);
}
.is-error .journey-dot {
  border-color: var(--red);
  background: var(--red);
}
.is-current .journey-dot {
  border: 3px solid var(--green);
  background: var(--bg);
}
.journey-dot-core {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
}
.journey-label {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text);
}
.is-upcoming .journey-label {
  color: var(--muted);
  font-weight: 500;
}
.is-current .journey-label {
  color: var(--green-text);
  font-weight: 700;
}
.is-error .journey-label {
  color: var(--red-text);
}
.journey-meta {
  color: var(--muted);
  font-size: var(--fs-xs);
  white-space: nowrap;
}
.journey-meta.is-attention {
  color: var(--amber-text);
}
.journey-meta.is-positive {
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
@container parcours (min-width: 640px) {
  .journey-steps {
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    grid-auto-flow: column;
  }
  /* Rail gris de la première à la dernière pastille, puis la part franchie en vert. */
  .journey-steps::before,
  .journey-steps::after {
    content: '';
    position: absolute;
    top: 11px;
    left: calc(50% / var(--journey-count, 6));
    height: 2px;
  }
  .journey-steps::before {
    right: calc(50% / var(--journey-count, 6));
    background: var(--surface-3);
  }
  .journey-steps::after {
    width: calc((100% - 100% / var(--journey-count, 6)) * var(--journey-progress, 0));
    background: var(--green);
  }
  .journey-step {
    grid-template-columns: none;
    justify-items: center;
    align-content: start;
    row-gap: var(--space-2);
    padding: 0 var(--space-1);
    text-align: center;
  }
  .journey-step:not(:last-child)::before {
    display: none;
  }
}
</style>
