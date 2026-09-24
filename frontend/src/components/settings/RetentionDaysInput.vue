<template>
  <div class="retention-input">
    <UiNumberField
      v-if="!indefinite"
      :model-value="modelValue"
      :min="1"
      aria-label="Durée de conservation en jours"
      :placeholder="placeholder != null ? String(placeholder) : ''"
      @update:model-value="onInput"
    />
    <label class="check retention-indefinite">
      <input type="checkbox" :checked="indefinite" @change="onToggle(($event.target as HTMLInputElement).checked)">
      Conserver indéfiniment
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import UiNumberField from '@/components/ui/UiNumberField.vue';

// Reglage "retention en jours" reutilisable
const props = withDefaults(
  defineProps<{
    modelValue?: number | null;
    placeholder?: number | string;
    defaultDays?: number;
  }>(),
  { modelValue: null, placeholder: '', defaultDays: 30 }
);
const emit = defineEmits<{
  (e: 'update:modelValue', value: number | null): void;
}>();

const indefinite = computed(() => !props.modelValue);
const lastCustomValue = ref<number>(props.modelValue || props.defaultDays);
watch(() => props.modelValue, (value) => { if (value) lastCustomValue.value = value; });

function onInput(value: number | null): void {
  if (value && value > 0) emit('update:modelValue', value);
}
function onToggle(checked: boolean): void {
  emit('update:modelValue', checked ? null : lastCustomValue.value);
}
</script>

<style scoped lang="scss">
.retention-input { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.retention-input :deep(.ui-number-field) { width: 150px; }
.retention-indefinite { width: auto; }
</style>
