<template>
  <!-- Une liste de mots séparés par des virgules, montrée en puces : on voit d'un coup d'œil
       ce qui est requis ou interdit, et on retire un mot sans réécrire toute la ligne. -->
  <div class="keyword-chips" :class="`is-${tone}`">
    <span v-for="(word, index) in words" :key="`${word}-${index}`" class="keyword-chip">
      {{ word }}
      <button type="button" :aria-label="`Retirer ${word}`" @click="remove(index)"><X aria-hidden="true" /></button>
    </span>
    <input
      :id="inputId"
      v-model="draft"
      type="text"
      :aria-label="label"
      :placeholder="words.length ? '+ ajouter' : placeholder"
      autocomplete="off"
      spellcheck="false"
      @keydown.enter.prevent="commit"
      @keydown="onComma"
      @blur="commit"
    >
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { X } from '@lucide/vue';
import { joinKeywords, splitKeywords } from './releaseRules';

const props = withDefaults(defineProps<{
  modelValue?: string | null;
  label: string;
  inputId?: string;
  placeholder?: string;
  tone?: 'good' | 'bad';
}>(), { modelValue: '', inputId: undefined, placeholder: '', tone: 'good' });
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const words = computed(() => splitKeywords(props.modelValue));
const draft = ref('');

function commit(): void {
  const added = splitKeywords(draft.value).filter((word) => !words.value.includes(word));
  draft.value = '';
  if (added.length) emit('update:modelValue', joinKeywords([...words.value, ...added]));
}
function onComma(event: KeyboardEvent): void {
  if (event.key === ',') { event.preventDefault(); commit(); }
}
function remove(index: number): void {
  emit('update:modelValue', joinKeywords(words.value.filter((_, i) => i !== index)));
}
</script>

<style scoped lang="scss">
.keyword-chips { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); min-width: 0; }
.keyword-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px 2px 10px;
  border-radius: var(--radius-pill);
  font-size: var(--fs-sm);
  font-weight: 600;
}
.is-good .keyword-chip { background: color-mix(in srgb, var(--green) 14%, transparent); color: var(--green-text); }
.is-bad .keyword-chip { background: color-mix(in srgb, var(--red) 14%, transparent); color: var(--red-text); }
.keyword-chip button { display: grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: none; color: inherit; cursor: pointer; }
.keyword-chip button:hover { background: color-mix(in srgb, currentColor 15%, transparent); }
.keyword-chip svg { width: 12px; height: 12px; }
.keyword-chips input { flex: 1 1 8rem; min-width: 6rem; padding: 4px 10px; border: 1px dashed var(--border); border-radius: var(--radius-pill); background: transparent; font-size: var(--fs-sm); }
</style>
