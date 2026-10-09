<template>
  <!-- Les types de probleme : chacun dit combien d'elements il touche et combien se
       corrigent sans decision. Choisir un type filtre la liste. -->
  <div class="handle-issues" role="group" aria-label="Types de problème">
    <button
      v-for="issue in issues"
      :key="issue.key"
      type="button"
      class="handle-issue"
      :class="{ 'is-active': issue.key === active }"
      :aria-pressed="issue.key === active"
      @click="emit('select', issue.key === active ? '' : issue.key)"
    >
      <span class="handle-issue__label">{{ issue.label }}</span>
      <strong class="handle-issue__count">{{ issue.count }}</strong>
      <small class="handle-issue__fix" :class="{ 'is-fixable': issue.fixable }">
        {{ issue.fixable ? `${issue.fixable} corrigeable${issue.fixable > 1 ? 's' : ''}` : 'À décider' }}
      </small>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { HandleIssue } from './types';

defineProps<{ issues: HandleIssue[]; active: string }>();
const emit = defineEmits<{ select: [key: string] }>();
</script>

<style scoped lang="scss">
.handle-issues { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr)); gap: var(--space-2); }
.handle-issue { display: grid; gap: 2px; padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface); color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.handle-issue:hover { border-color: var(--border-strong, var(--accent)); }
.handle-issue.is-active { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.handle-issue:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.handle-issue__label { color: var(--muted); font-size: var(--fs-sm); }
.handle-issue__count { font-family: var(--font-display); font-size: var(--fs-xl, 1.4rem); }
.handle-issue__fix { color: var(--muted); font-size: var(--fs-xs); }
.handle-issue__fix.is-fixable { color: var(--green-text, var(--green)); }
</style>
