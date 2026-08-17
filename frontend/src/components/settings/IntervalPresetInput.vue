<template>
  <div class="interval-preset">
    <select :value="selectValue" @change="onSelect(($event.target as HTMLSelectElement).value)">
      <option v-for="p in presets" :key="p.value" :value="p.value">{{ p.label }}</option>
      <option value="custom">Personnalise...</option>
    </select>
    <input v-if="customMode" type="number" min="1" :value="modelValue" placeholder="Valeur" @input="onCustomInput">
  </div>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';

export interface Preset {
  label: string;
  value: number | string;
}

const props = defineProps<{
  modelValue: number;
  presets: Preset[];
}>();
const emit = defineEmits<{ (e: 'update:modelValue', value: number): void }>();

function matchesPreset(value: number): boolean { return props.presets.some((p) => p.value === value); }

const customMode = ref(!matchesPreset(props.modelValue));
const selectValue = ref(customMode.value ? 'custom' : String(props.modelValue));

watch(() => props.modelValue, (val) => {
  if (customMode.value) return;
  selectValue.value = String(val);
});

function onSelect(raw: string): void {
  if (raw === 'custom') {
    customMode.value = true;
    selectValue.value = 'custom';
    return;
  }
  customMode.value = false;
  selectValue.value = raw;
  emit('update:modelValue', Number(raw));
}

function onCustomInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (value > 0) emit('update:modelValue', value);
}
</script>
<style scoped lang="scss">
.interval-preset {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.interval-preset select {
  width: auto;
}

.interval-preset input {
  width: 100px;
}
</style>
