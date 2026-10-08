<template>
  <!-- Trois rythmes prêts à l'emploi ; « Personnalisé » s'allume tout seul dès qu'un réglage
       avancé s'écarte d'eux. Le choix ne s'enregistre qu'avec le reste du formulaire. -->
  <div class="vf-presets" role="radiogroup" aria-label="Rythme des recherches VF">
    <button
      v-for="preset in VF_PRESETS"
      :key="preset.key"
      type="button"
      role="radio"
      :aria-checked="current === preset.key"
      :disabled="disabled"
      @click="applyPreset(form, preset.key)"
    >
      <strong>{{ preset.label }}</strong>
      <small>{{ preset.description }}</small>
    </button>
    <button type="button" role="radio" :aria-checked="current === null" disabled>
      <strong>Personnalisé</strong>
      <small>{{ current === null ? 'Vos réglages avancés.' : 'S’active si vous changez un réglage avancé.' }}</small>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { form } from '@/settingsForm';
import { VF_PRESETS, applyPreset, matchingPreset } from './vfPresets';

defineProps<{ disabled?: boolean }>();
const current = computed(() => matchingPreset(form));
</script>

<style scoped lang="scss">
.vf-presets { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: var(--space-2); }
.vf-presets button { display: grid; gap: 2px; padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--inset-radius); background: var(--surface); color: var(--text); text-align: left; cursor: pointer; }
.vf-presets button small { color: var(--muted); font-size: var(--fs-xs); }
.vf-presets button[aria-checked='true'] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--surface)); }
.vf-presets button:disabled { cursor: default; }
.vf-presets button:disabled:not([aria-checked='true']) { opacity: .6; }
</style>
