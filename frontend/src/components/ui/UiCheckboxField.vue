<template>
  <div class="ui-checkbox-field" :class="{ 'has-error': error, 'is-disabled': disabled }">
    <input :id="inputId" type="checkbox" :checked="modelValue" :disabled="disabled"
      :aria-describedby="describedBy" :aria-invalid="error ? 'true' : undefined" @change="onChange" />
    <label :for="inputId">
      <span class="ui-checkbox-label">{{ label }}</span>
      <span v-if="error" :id="messageId" class="ui-checkbox-error" role="alert">{{ error }}</span>
      <span v-else-if="hint" :id="messageId" class="ui-checkbox-hint">{{ hint }}</span>
    </label>
  </div>
</template>
<script setup lang="ts">
import { computed, useId } from 'vue';
const props = withDefaults(defineProps<{ modelValue: boolean; label: string; hint?: string; error?: string; id?: string; disabled?: boolean }>(),
  { hint: '', error: '', id: '', disabled: false });
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const generatedId = useId();
const inputId = computed(() => props.id || `ui-checkbox-${generatedId}`);
const messageId = computed(() => `${inputId.value}-message`);
const describedBy = computed(() => props.error || props.hint ? messageId.value : undefined);
function onChange(event: Event) { emit('update:modelValue', (event.target as HTMLInputElement).checked); }
</script>
<style scoped lang="scss">
.ui-checkbox-field{display:grid;grid-template-columns:18px minmax(0,1fr);align-items:start;gap:var(--space-2)}input{width:18px;height:18px;margin:1px 0 0;accent-color:var(--accent);cursor:pointer}label{display:grid;gap:3px;min-width:0;cursor:pointer}.ui-checkbox-label{color:var(--text);font-size:var(--fs-sm);font-weight:650;line-height:1.35}.ui-checkbox-hint,.ui-checkbox-error{color:var(--muted);font-size:var(--fs-xs);line-height:1.45}.ui-checkbox-error{color:var(--red-text)}.is-disabled{opacity:.55}.is-disabled input,.is-disabled label{cursor:not-allowed}
</style>
