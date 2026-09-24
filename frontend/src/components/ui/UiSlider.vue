<template>
  <!-- Curseur Reka UI : poignee large facile a saisir au doigt, fleches, Origine/Fin et
       Page haut/bas au clavier, valeur annoncee. -->
  <SliderRoot
    class="ui-slider"
    :model-value="[modelValue ?? min]"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    @update:model-value="(v) => v && emit('update:modelValue', v[0])"
  >
    <SliderTrack class="ui-slider__track"><SliderRange class="ui-slider__range" /></SliderTrack>
    <SliderThumb class="ui-slider__thumb" :aria-label="label || undefined" />
  </SliderRoot>
</template>

<script setup lang="ts">
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui';

withDefaults(defineProps<{ modelValue?: number | null; min?: number; max?: number; step?: number; disabled?: boolean; label?: string }>(),
  { modelValue: null, min: 0, max: 100, step: 1, disabled: false, label: '' });
const emit = defineEmits<{ (e: 'update:modelValue', value: number): void }>();
</script>

<style scoped lang="scss">
.ui-slider { position: relative; display: flex; align-items: center; width: 100%; height: 28px; touch-action: none; user-select: none; }
.ui-slider[data-disabled] { opacity: .5; }
.ui-slider__track { position: relative; flex: 1; height: 4px; border-radius: 999px; background: var(--surface-3); }
.ui-slider__range { position: absolute; height: 100%; border-radius: inherit; background: var(--accent); }
.ui-slider__thumb {
  display: block; width: 20px; height: 20px; border: 2px solid var(--accent); border-radius: 50%;
  background: var(--text); box-shadow: 0 1px 4px rgb(0 0 0 / 40%); cursor: grab;
}
.ui-slider__thumb:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
</style>
