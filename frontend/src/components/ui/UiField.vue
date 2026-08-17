<template>
  <div class="ui-field" :class="{ 'is-invalid': Boolean(error) }">
    <label :for="fieldId">
      <span class="ui-field-label">{{ label }}<span v-if="required" aria-hidden="true"> *</span></span>
    </label>
    <slot :id="fieldId" :described-by="describedBy" :invalid="Boolean(error)" />
    <p v-if="error" :id="errorId" class="ui-field-error" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="hintId" class="ui-field-hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';

const props = withDefaults(defineProps<{
  label: string;
  id?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}>(), {
  id: '', hint: '', error: '', required: false,
});

const generatedId = useId();
const fieldId = computed(() => props.id || `field-${generatedId}`);
const hintId = computed(() => `${fieldId.value}-hint`);
const errorId = computed(() => `${fieldId.value}-error`);
const describedBy = computed(() => props.error ? errorId.value : props.hint ? hintId.value : undefined);
</script>

<style scoped lang="scss">
.ui-field { display: grid; gap: var(--space-2); min-width: 0; color: var(--text); }
.ui-field-label { font-size: var(--fs-sm); font-weight: 600; }
.ui-field-hint,.ui-field-error { margin: 0; font-size: var(--fs-xs); font-weight: 400; line-height: 1.45; }
.ui-field-hint { color: var(--muted); }
.ui-field-error { color: var(--red-text); }
.ui-field.is-invalid :deep(input),.ui-field.is-invalid :deep(select),.ui-field.is-invalid :deep(textarea) { border-color: var(--red); }
</style>
