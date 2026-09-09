<template>
  <div class="interval-preset">
    <select :value="selectValue" @change="onSelect(($event.target as HTMLSelectElement).value)">
      <option v-for="p in presets" :key="p.value" :value="p.value">{{ p.label }}</option>
      <option value="custom">Personnalise...</option>
    </select>
    <input v-if="customMode" type="number" min="1" :value="modelValue" placeholder="Valeur" @input="onCustomInput">
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';

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

function onCustomInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (value > 0) emit('update:modelValue', value);
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
