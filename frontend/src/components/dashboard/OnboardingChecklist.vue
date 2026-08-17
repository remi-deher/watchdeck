<template>
  <section v-if="onboarding.steps?.length && !onboarding.complete && show" class="panel">
    <div class="panel-head">
      <div>
        <h2>Configuration initiale</h2>
        <p>{{ doneSteps }}/{{ onboarding.steps.length }} etapes terminees</p>
      </div>
      <div class="actions">
        <UiButton to="/settings">Continuer</UiButton>
        <UiButton variant="ghost" @click="$emit('dismiss')"><template #icon><X /></template>Masquer</UiButton>
      </div>
    </div>
    <div class="checklist">
      <span v-for="step in onboarding.steps" :key="step.id">
        <CheckCircle2 v-if="step.done" class="success-text" />
        <Circle v-else />
        {{ step.label }}
      </span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CheckCircle2, Circle, X } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';

export interface OnboardingStep {
  id: string | number;
  label: string;
  done: boolean;
}

export interface OnboardingData {
  steps?: OnboardingStep[];
  complete?: boolean;
}

const props = withDefaults(
  defineProps<{
    onboarding?: OnboardingData;
    show?: boolean;
  }>(),
  {
    onboarding: () => ({}),
    show: true,
  }
);
defineEmits<{
  (e: 'dismiss'): void;
}>();

const doneSteps = computed(() => props.onboarding.steps?.filter((x) => x.done).length || 0);
</script>
