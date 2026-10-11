<template>
  <div
    class="ui-file-drop"
    :class="{ 'has-file': Boolean(modelValue), 'is-over': over }"
    @dragover.prevent="over = true"
    @dragleave="over = false"
    @drop.prevent="onDrop"
  >
    <input :id="id" ref="input" type="file" class="sr-only" :accept="accept" :aria-describedby="describedBy" @change="onSelect" />
    <button type="button" class="ui-file-drop__button" @click="input?.click()">
      <FileText v-if="modelValue" aria-hidden="true" />
      <Upload v-else aria-hidden="true" />
      <span>{{ modelValue ? modelValue.name : placeholder }}</span>
    </button>
    <button v-if="modelValue" type="button" class="ui-file-drop__clear" aria-label="Retirer le fichier" @click="emit('update:modelValue', null)"><X aria-hidden="true" /></button>
  </div>
</template>

<script setup lang="ts">
/* Zone de dépôt d'un fichier : glisser-déposer ou parcourir. Un seul fichier ; le type
   accepté filtre à la sélection comme au dépôt. */
import { ref } from 'vue';
import { FileText, Upload, X } from '@lucide/vue';

const props = withDefaults(defineProps<{
  modelValue?: File | null;
  /** Extensions ou types acceptés (« .torrent »). */
  accept?: string;
  placeholder?: string;
  id?: string;
  describedBy?: string;
}>(), { modelValue: null, accept: '', placeholder: 'Glissez un fichier ou cliquez pour parcourir', id: undefined, describedBy: undefined });
const emit = defineEmits<{ 'update:modelValue': [file: File | null] }>();

const input = ref<HTMLInputElement | null>(null);
const over = ref(false);

/* « .torrent » ne retient que cette extension ; un type MIME ou une liste passe tel quel. */
function accepted(file: File): boolean {
  const rules = props.accept.split(',').map((rule) => rule.trim().toLowerCase()).filter(Boolean);
  if (!rules.length) return true;
  const name = file.name.toLowerCase();
  return rules.some((rule) => (rule.startsWith('.') ? name.endsWith(rule) : rule.endsWith('/*') ? file.type.startsWith(rule.slice(0, -1)) : file.type === rule));
}
function pick(file?: File | null): void {
  if (file && accepted(file)) emit('update:modelValue', file);
}
function onSelect(event: Event): void {
  pick((event.target as HTMLInputElement).files?.[0]);
}
function onDrop(event: DragEvent): void {
  over.value = false;
  pick(event.dataTransfer?.files?.[0]);
}
</script>

<style scoped lang="scss">
.ui-file-drop { position: relative; display: flex; align-items: center; border: 2px dashed var(--border); border-radius: var(--radius-md); background: var(--surface-2); color: var(--muted); transition: border-color var(--motion-duration-instant) var(--motion-ease-standard), background-color var(--motion-duration-instant) var(--motion-ease-standard); }
.ui-file-drop:hover,.ui-file-drop.is-over,.ui-file-drop.has-file { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface-2)); color: var(--text); }
.ui-file-drop__button { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-2); min-width: 0; padding: var(--space-5) var(--space-4); border: 0; background: none; color: inherit; font: inherit; font-size: var(--fs-sm); text-align: center; cursor: pointer; }
.ui-file-drop__button span { max-width: 100%; overflow-wrap: anywhere; }
.ui-file-drop__button svg { width: 24px; height: 24px; color: var(--accent); }
.ui-file-drop__clear { position: absolute; top: var(--space-2); right: var(--space-2); display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer; }
.ui-file-drop__clear:hover { background: var(--surface-3); color: var(--text); }
.ui-file-drop__clear svg { width: 14px; height: 14px; }
</style>
