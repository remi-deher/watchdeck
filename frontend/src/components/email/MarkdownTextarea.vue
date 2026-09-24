<template>
  <div>
    <div class="markdown-toolbar" role="toolbar" aria-label="Mise en forme du modele">
      <!-- Menus d'actions Reka UI : ouvrir, parcourir aux fleches, choisir -- le choix agit
           sur le texte, il n'y a pas de valeur a retenir. -->
      <DropdownMenuRoot :modal="false">
        <DropdownMenuTrigger class="markdown-menu-trigger" aria-label="Niveau de titre"><Heading aria-hidden="true" />Titre<ChevronDown aria-hidden="true" /></DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="markdown-menu" align="start" :side-offset="6">
            <DropdownMenuItem v-for="level in ['1', '2', '3']" :key="level" class="markdown-menu__item" @select="setHeading(level)">Titre {{ level }}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
      <UiButton icon-only title="Gras" aria-label="Gras" @click="wrapSelection('**','**','texte en gras')"><Bold/></UiButton>
      <UiButton icon-only title="Italique" aria-label="Italique" @click="wrapSelection('*','*','texte en italique')"><Italic/></UiButton>
      <UiButton icon-only title="Liste a puces" aria-label="Liste a puces" @click="prefixLines('- ')"><List/></UiButton>
      <UiButton icon-only title="Liste numerotee" aria-label="Liste numerotee" @click="prefixLines('1. ')"><ListOrdered/></UiButton>
      <UiButton icon-only title="Citation" aria-label="Citation" @click="prefixLines('> ')"><Quote/></UiButton>
      <UiButton icon-only title="Lien" aria-label="Lien" @click="insertLink"><LinkIcon/></UiButton>
      <DropdownMenuRoot v-if="variables.length" :modal="false">
        <DropdownMenuTrigger class="markdown-menu-trigger variable-picker"><Braces aria-hidden="true" />Variables<ChevronDown aria-hidden="true" /></DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="markdown-menu variable-menu" align="end" :side-offset="6">
            <DropdownMenuItem v-for="variable in variables" :key="variable.tag" class="markdown-menu__item" @select="insertText(variable.tag)"><code>{{ variable.tag }}</code><span>{{ variable.description }}</span></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>
    <textarea ref="editor" :value="modelValue" :rows="rows" class="code-editor" @input="onInput"></textarea>
  </div>
</template>

<script setup lang="ts">
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui';
import UiButton from '@/components/ui/UiButton.vue';
import { nextTick, ref } from 'vue';
import { Bold, Braces, ChevronDown, Heading, Italic, Link as LinkIcon, List, ListOrdered, Quote } from '@lucide/vue';

withDefaults(
  defineProps<{
    modelValue?: string;
    rows?: string | number;
    variables?: Array<{ tag: string; description: string }>;
  }>(),
  {
    modelValue: '',
    rows: 10,
    variables: () => [],
  }
);
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const editor = ref<HTMLTextAreaElement | null>(null);

function updateValue(value: string, start: number, end: number): void {
  emit('update:modelValue', value);
  nextTick(() => {
    const target = editor.value;
    target?.focus();
    if (target) { target.selectionStart = start; target.selectionEnd = end; }
  });
}

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
}

function insertText(text: string): void {
  const target = editor.value;
  if (!target) return;
  const start = target.selectionStart ?? target.value.length, end = target.selectionEnd ?? start;
  updateValue(target.value.slice(0, start) + text + target.value.slice(end), start + text.length, start + text.length);
}

function wrapSelection(prefix: string, suffix: string, placeholder: string): void {
  const target = editor.value;
  if (!target) return;
  const start = target.selectionStart, end = target.selectionEnd, selected = target.value.slice(start, end) || placeholder;
  updateValue(target.value.slice(0, start) + prefix + selected + suffix + target.value.slice(end), start + prefix.length, start + prefix.length + selected.length);
}

function prefixLines(prefix: string): void {
  const target = editor.value;
  if (!target) return;
  const start = target.selectionStart, end = target.selectionEnd, lineStart = target.value.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = target.value.indexOf('\n', end);
  if (lineEnd < 0) lineEnd = target.value.length;
  const transformed = target.value.slice(lineStart, lineEnd).split('\n').map(line => prefix + line).join('\n');
  updateValue(target.value.slice(0, lineStart) + transformed + target.value.slice(lineEnd), lineStart, lineStart + transformed.length);
}

function setHeading(level: string): void {
  const target = editor.value;
  if (!target || !level) return;
  const position = target.selectionStart, lineStart = target.value.lastIndexOf('\n', position - 1) + 1;
  let lineEnd = target.value.indexOf('\n', position);
  if (lineEnd < 0) lineEnd = target.value.length;
  const line = target.value.slice(lineStart, lineEnd).replace(/^#{1,6}\s*/, ''), replacement = `${'#'.repeat(Number(level))} ${line}`;
  updateValue(target.value.slice(0, lineStart) + replacement + target.value.slice(lineEnd), lineStart + replacement.length, lineStart + replacement.length);
}

function insertLink(): void {
  const target = editor.value;
  if (!target) return;
  const start = target.selectionStart, end = target.selectionEnd, selected = target.value.slice(start, end) || 'texte du lien';
  const url = prompt('URL du lien :', 'https://');
  if (!url) return;
  const value = `[${selected}](${url})`;
  updateValue(target.value.slice(0, start) + value + target.value.slice(end), start + value.length, start + value.length);
}
</script>
