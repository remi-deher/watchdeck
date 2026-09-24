<template>
  <div class="ui-checkbox-field" :class="{ 'has-error': error, 'is-disabled': disabled }">
    <CheckboxRoot :id="inputId" class="ui-checkbox" :model-value="modelValue" :disabled="disabled"
      :aria-describedby="describedBy" :aria-invalid="error ? 'true' : undefined" @update:model-value="emit('update:modelValue', $event === true)">
      <CheckboxIndicator class="ui-checkbox-indicator"><Check :size="13" aria-hidden="true" /></CheckboxIndicator>
    </CheckboxRoot>
    <label :for="inputId">
      <span class="ui-checkbox-label">{{ label }}</span>
      <span v-if="error" :id="messageId" class="ui-checkbox-error" role="alert">{{ error }}</span>
      <span v-else-if="hint" :id="messageId" class="ui-checkbox-hint">{{ hint }}</span>
    </label>
  </div>
</template>
<script setup lang="ts">
import { computed, useId } from 'vue';
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui';
import { Check } from '@lucide/vue';
const props = withDefaults(defineProps<{ modelValue: boolean; label: string; hint?: string; error?: string; id?: string; disabled?: boolean }>(),
  { hint: '', error: '', id: '', disabled: false });
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const generatedId = useId();
const inputId = computed(() => props.id || `ui-checkbox-${generatedId}`);
const messageId = computed(() => `${inputId.value}-message`);
const describedBy = computed(() => props.error || props.hint ? messageId.value : undefined);
</script>
<style scoped lang="scss">
.ui-checkbox-field{display:grid;grid-template-columns:18px minmax(0,1fr);align-items:start;gap:var(--space-2)}label{display:grid;gap:3px;min-width:0;cursor:pointer}.ui-checkbox-label{color:var(--text);font-size:var(--fs-sm);font-weight:650;line-height:1.35}.ui-checkbox-hint,.ui-checkbox-error{color:var(--muted);font-size:var(--fs-xs);line-height:1.45}.ui-checkbox-error{color:var(--red-text)}.is-disabled{opacity:.55}.is-disabled label{cursor:not-allowed}
.ui-checkbox{display:grid;place-items:center;width:18px;height:18px;min-height:0;margin-top:1px;padding:0;border:1.5px solid color-mix(in srgb,var(--text) 26%,transparent);border-radius:var(--radius-xs);background:var(--surface-2);color:var(--on-accent,#111);cursor:pointer;transition:background-color var(--motion-duration-instant) var(--motion-ease-standard),border-color var(--motion-duration-instant) var(--motion-ease-standard)}
.ui-checkbox[data-state="checked"]{border-color:var(--accent);background:var(--accent)}
.ui-checkbox:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ui-checkbox:disabled{cursor:not-allowed}
.has-error .ui-checkbox{border-color:var(--red-text)}
.ui-checkbox-indicator{display:grid;place-items:center}
</style>
