<template>
  <!-- Frise datée du parcours d'une demande : celle du bloc commun StepTimeline. -->
  <StepTimeline :steps="steps" :format-at="shortDateTime" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import StepTimeline from '@/components/ui/StepTimeline.vue';
import { journeySteps, shortDateTime } from './requestRules';
import type { RequestJourney } from '@/types/generated/mediaAvailability';

const props = defineProps<{
  row: { journey?: RequestJourney | null; [key: string]: any };
}>();

const steps = computed(() => journeySteps(props.row));
</script>
