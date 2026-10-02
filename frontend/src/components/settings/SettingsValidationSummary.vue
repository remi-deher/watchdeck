<template>
  <div v-if="entries.length" class="settings-validation" role="alert">
    <strong>Réglages invalides</strong>
    <ul>
      <li v-for="entry in entries" :key="entry.key"><b>{{ entry.label }}</b> : {{ entry.message }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/* Détail champ par champ des erreurs Zod : le bandeau global n'en affiche qu'une, et
 * la plupart des réglages ne sont pas rendus via UiField, donc sans message local. */
import { computed } from 'vue';
import { validationErrors } from '@/settingsForm';
import { settingsFieldLabels } from '@/settingsFieldLabels';

const entries = computed(() => Object.entries(validationErrors).map(([key, message]) => ({
  key,
  message,
  label: settingsFieldLabels[key] || key,
})));
</script>

<style scoped lang="scss">
.settings-validation {
  margin: 0 0 var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--red-text);
  border-radius: var(--radius-md);
  color: var(--red-text);
  font-size: var(--fs-sm);
}
.settings-validation ul { margin: var(--space-2) 0 0; padding-left: 1.2em; }
.settings-validation b { font-weight: 600; }
</style>
