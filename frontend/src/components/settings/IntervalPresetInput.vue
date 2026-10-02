<template>
  <div class="interval-preset">
    <UiSelect :model-value="selectValue" @update:model-value="onSelect($event)" :options="[...(presets).map((p) => ({ value: p.value, label: String(p.label) })), { value: 'custom', label: 'Personnalise...' }]" />
    <UiNumberField v-if="customMode" :model-value="typeof modelValue === 'number' ? modelValue : Number(modelValue) || null" :min="1" placeholder="Valeur" aria-label="Valeur personnalisée" @update:model-value="onCustomInput" />
  </div>
</template>
<script setup lang="ts">
import UiSelect from '@/components/ui/UiSelect.vue';
import { computed, ref } from 'vue';
import UiNumberField from '@/components/ui/UiNumberField.vue';

export interface Preset {
  label: string;
  value: number | string;
}

const props = defineProps<{
  modelValue: number;
  presets: Preset[];
}>();
const emit = defineEmits<{ (e: 'update:modelValue', value: number): void }>();

function matchesPreset(value: number): boolean { return props.presets.some((p) => p.value === value); }

/* Le mode se deduit de la valeur, il ne se fige pas au montage.
   Le meme reglage se modifie depuis plusieurs ecrans -- la frequence de re-analyse VF
   se regle depuis « Plex & Bibliotheque » comme depuis « Planification », et trois
   taches partagent le meme champ. Avec un `customMode` decide une fois pour toutes, un
   controle deja monte restait bloque en « Personnalise » apres qu'une valeur de la liste
   avait ete choisie ailleurs, ou affichait un select vide dans le cas inverse.
   `userChoseCustom` distingue le seul cas ou l'utilisateur veut rester en saisie libre
   alors que sa valeur figure aussi dans la liste. */
const userChoseCustom = ref(false);
const customMode = computed(() => userChoseCustom.value || !matchesPreset(props.modelValue));
const selectValue = computed(() => (customMode.value ? 'custom' : String(props.modelValue)));

function onSelect(raw: string): void {
  if (raw === 'custom') {
    userChoseCustom.value = true;
    return;
  }
  userChoseCustom.value = false;
  emit('update:modelValue', Number(raw));
}

function onCustomInput(value: number | null): void {
  if (value && value > 0) emit('update:modelValue', value);
}
</script>
<style scoped lang="scss">
.interval-preset {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.interval-preset select {
  width: auto;
}

.interval-preset input {
  width: 100px;
}
</style>
