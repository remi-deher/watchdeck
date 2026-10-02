<template>
  <div class="form-section">
    <label>Sujet<input v-model="model.subject"></label>
    <label>Modele HTML / Markdown</label>
    <MarkdownTextarea v-model="model.template" :rows="13" :variables="variables" />

    <div v-if="appearanceEditable" class="settings-grid two">
      <label>Couleur d'accent<input v-model="model.accent_color" type="color"></label>
      <label>Badge<input v-model="model.badge_text"></label>
      <label>Titre principal<input v-model="model.headline_text"></label>
      <UiCheckboxField v-model="model.show_synopsis" label="Afficher le synopsis" />
    </div>
    <p v-else class="notice">L'apparence herite actuellement du modele « Film disponible ». Elle sera reorganisee avec le futur menu Emails.</p>
  </div>
</template>

<script setup lang="ts">
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import MarkdownTextarea from './MarkdownTextarea.vue';

withDefaults(
  defineProps<{
    model: Record<string, any>;
    variables?: any[];
    appearanceEditable?: boolean;
  }>(),
  {
    variables: () => [],
    appearanceEditable: true,
  }
);
</script>
