<template>
  <!-- Les reglages VF, dans la feuille ouverte depuis la page des ameliorations : les
       memes que la page Reglages, sur le meme store -- toute modification enregistree ici
       s'y applique aussi. L'enregistrement est celui du gabarit Configurer (barre de
       l'onglet) : la feuille lui fournit l'etat et les deux gestes, comme la page Reglages. -->
  <div class="vf-settings-panel">
    <div v-if="loading" class="vf-settings-loading" aria-hidden="true">
      <div class="skeleton-line title" />
      <div class="skeleton-line sub" />
      <div class="skeleton-line row" />
    </div>

    <!-- Exactement le composant de la page Réglages, sur le même store : la
         synchronisation est structurelle, pas recopiée. -->
    <template v-else>
      <SettingsValidationSummary />
      <VfUpgradesSettingsTab />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import SettingsValidationSummary from '@/components/settings/SettingsValidationSummary.vue';
import VfUpgradesSettingsTab from '@/components/settings/VfUpgradesSettingsTab.vue';
import { provideSettingsPage } from '@/composables/useSettingsPage';
import { useErrorToast } from '@/composables/useErrorToast';
import { useToast } from '@/composables/useToast';
import {
  discardChanges,
  error,
  isDirty,
  load,
  message,
  save,
  saving,
} from '@/settingsForm';

const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>();

const loading = ref(false);
const toast = useToast();
useErrorToast(() => error.value);
watch(message, (value) => { if (value) { toast.success(value); message.value = ''; } });

/* Rechargement a chaque ouverture : le store est un singleton partage avec la page
   Reglages, et la valeur en base a pu changer depuis (autre onglet, autre
   administrateur). On repart donc toujours de l'etat serveur. */
onMounted(async () => {
  loading.value = true;
  message.value = '';
  try {
    await load();
  } finally {
    loading.value = false;
  }
});

function requestClose(): void {
  /* Annuler rend le formulaire a son etat serveur : sans cela, les valeurs saisies
     survivraient dans le store partage et repartiraient au prochain enregistrement d'une
     autre section. */
  discardChanges();
  emit('close');
}

async function persist(): Promise<void> {
  await save();
  if (!error.value) emit('saved');
}

provideSettingsPage({ query: ref(''), dirty: computed(() => isDirty.value), saving, save: () => { void persist(); }, cancel: requestClose });
</script>

<style scoped lang="scss">
.vf-settings-loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.vf-settings-panel { display: grid; gap: var(--space-4); }
</style>
