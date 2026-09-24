<template>
  <!-- Les reglages VF, dans la feuille ouverte depuis la page des ameliorations : les
       memes que la page Reglages, sur le meme store -- toute modification enregistree ici
       s'y applique aussi. -->
  <div class="vf-settings-panel">
    <UiFeedback v-if="error" type="error" :message="error" />
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

    <div class="vf-settings-actions">
      <UiFeedback v-if="message" type="success" :message="message" />
      <span v-else-if="isDirty" class="vf-settings-dirty">{{ changedCount }} modification(s) non enregistrée(s)</span>
      <UiButton variant="ghost" :disabled="saving" @click="requestClose">
        {{ isDirty ? 'Annuler' : 'Fermer' }}
      </UiButton>
      <UiButton variant="primary" :loading="saving" :disabled="!isDirty" @click="persist">
        Enregistrer
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import SettingsValidationSummary from '@/components/settings/SettingsValidationSummary.vue';
import VfUpgradesSettingsTab from '@/components/settings/VfUpgradesSettingsTab.vue';
import {
  changedFields,
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
const changedCount = computed(() => changedFields().length);

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
  /* Fermer sans enregistrer doit rendre le formulaire a son etat serveur : sans cela,
     les valeurs saisies survivraient dans le store partage et repartiraient au
     prochain enregistrement d'une autre section. */
  discardChanges();
  emit('close');
}

async function persist(): Promise<void> {
  await save();
  if (!error.value) emit('saved');
}
</script>

<style scoped lang="scss">
.vf-settings-loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.vf-settings-panel { display: grid; gap: var(--space-4); }
.vf-settings-actions {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 94%, transparent);
}

.vf-settings-dirty {
  margin-right: auto;
  font-size: 0.85rem;
  color: var(--text-muted);
}
</style>
