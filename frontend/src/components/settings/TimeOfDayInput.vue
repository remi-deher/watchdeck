<template>
  <input type="time" step="60" class="time-of-day-input" :value="timeString" @input="onInput">
</template>
<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ hour: number; minute: number }>();
const emit = defineEmits<{
  (e: 'update:hour', h: number): void;
  (e: 'update:minute', m: number): void;
}>();

const timeString = computed(() => `${String(props.hour).padStart(2, '0')}:${String(props.minute).padStart(2, '0')}`);

function onInput(event: Event): void {
  const [h, m] = (event.target as HTMLInputElement).value.split(':').map(Number);
  if (Number.isFinite(h)) emit('update:hour', h);
  if (Number.isFinite(m)) emit('update:minute', m);
}
</script>
<style scoped lang="scss">
.time-of-day-input {
  width: fit-content;
}
</style>
