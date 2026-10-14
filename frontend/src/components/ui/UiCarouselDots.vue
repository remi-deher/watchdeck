<template>
  <div class="ui-carousel-dots" role="tablist" :aria-label="label">
    <button
      v-for="i in count"
      :key="i - 1"
      type="button"
      role="tab"
      class="ui-carousel-dots__dot"
      :class="{ 'is-active': i - 1 === modelValue }"
      :aria-selected="i - 1 === modelValue"
      :aria-label="itemLabel(i - 1)"
      @click.stop="$emit('update:modelValue', i - 1)"
    />
  </div>
</template>

<script setup lang="ts">
/* Pastilles d'un carrousel : une par diapositive, la courante allongee. Pose sur une
   image (pilule sombre floutee) ; la place dans le carrousel revient a celui-ci. */
withDefaults(
  defineProps<{
    count: number;
    modelValue: number;
    label?: string;
    itemLabel?: (index: number) => string;
  }>(),
  {
    label: 'Diapositives',
    itemLabel: (index: number) => `Diapositive ${index + 1}`,
  }
);

defineEmits<{
  (e: 'update:modelValue', index: number): void;
}>();
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.ui-carousel-dots {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  background: rgba(10, 12, 16, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.ui-carousel-dots__dot {
  position: relative;
  display: block;
  box-sizing: border-box;
  width: 8px;
  min-width: 8px;
  max-width: 8px;
  height: 8px;
  min-height: 8px;
  max-height: 8px;
  flex: 0 0 8px;
  flex-shrink: 0;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.38);
  border: none;
  padding: 0;
  margin: 0;
  font-size: 0;
  line-height: 0;
  cursor: pointer;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  transition: width var(--motion-duration-fast) var(--motion-ease-standard), background-color var(--motion-duration-fast) var(--motion-ease-standard), box-shadow var(--motion-duration-fast) var(--motion-ease-standard);
}

/* Zone de clic tactile élargie */
.ui-carousel-dots__dot::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 24px;
  height: 24px;
  border-radius: 50%;
}

.ui-carousel-dots__dot:hover,
.ui-carousel-dots__dot:focus-visible {
  background: rgba(255, 255, 255, 0.85);
}

.ui-carousel-dots__dot:focus-visible {
  box-shadow: 0 0 0 2px var(--accent);
}

.ui-carousel-dots__dot.is-active {
  width: 26px;
  min-width: 26px;
  max-width: 26px;
  height: 8px;
  min-height: 8px;
  max-height: 8px;
  flex: 0 0 26px;
  background: var(--accent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 60%, transparent);
  transform: none;
}

@include bp.until(phablet) {
  .ui-carousel-dots {
    gap: 6px;
    padding: 4px 8px;
  }
  .ui-carousel-dots__dot {
    width: 6px;
    min-width: 6px;
    max-width: 6px;
    height: 6px;
    min-height: 6px;
    max-height: 6px;
    flex: 0 0 6px;
  }
  .ui-carousel-dots__dot.is-active {
    width: 20px;
    min-width: 20px;
    max-width: 20px;
    flex: 0 0 20px;
  }
}
</style>
