<template>
  <div class="theme-settings">
    <UiField v-slot="{ id }" label="Palette">
      <UiSelect :id="id" v-model="palette" :options="[...PALETTE_OPTIONS]" aria-label="Palette de l’interface" />
    </UiField>
    <UiField label="Apparence">
      <UiSegmentedControl v-model="choice" :options="THEME_OPTIONS" ariaLabel="Apparence de l’interface" />
    </UiField>
  </div>
</template>

<script setup lang="ts">
import UiField from './UiField.vue';
import UiSelect from './UiSelect.vue';
import UiSegmentedControl from './UiSegmentedControl.vue';
import { PALETTE_OPTIONS, THEME_OPTIONS, useTheme } from '@/composables/useTheme';
const { palette, choice } = useTheme();
</script>

<style scoped>
.theme-settings { display: grid; gap: var(--space-4); min-width: 0; }
</style>
