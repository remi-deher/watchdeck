<template>
  <!-- Arreter une lecture coupe l'utilisateur en plein film : le message qu'il verra sur
       son ecran est donc demande ici, avec une formulation par defaut polie. -->
  <ModalShell
    :open="open"
    title="Arrêter la lecture"
    :subtitle="subtitle"
    :busy="busy"
    :error="error"
    @close="emit('close')"
  >
    <UiField label="Message affiché sur le lecteur" hint="Plex l'affiche à l'utilisateur au moment de l'arrêt." v-slot="{ id, describedBy }">
      <textarea :id="id" v-model="reason" class="terminate-reason" rows="3" maxlength="300" :aria-describedby="describedBy"></textarea>
    </UiField>
    <template #actions>
      <UiButton variant="ghost" :disabled="busy" @click="emit('close')">Annuler</UiButton>
      <UiButton variant="danger" :loading="busy" @click="confirm">Arrêter la lecture</UiButton>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { api } from '@/api';
import ModalShell from '@/components/ui/ModalShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';

const DEFAULT_REASON = 'La lecture a été arrêtée par l’administrateur du serveur.';

const props = defineProps<{ open: boolean; sessionId: number | string; subtitle?: string }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'terminated'): void }>();

const reason = ref(DEFAULT_REASON);
const busy = ref(false);
const error = ref('');

watch(() => props.open, (open) => {
  if (open) {
    reason.value = DEFAULT_REASON;
    error.value = '';
  }
});

async function confirm(): Promise<void> {
  busy.value = true;
  error.value = '';
  try {
    await api(`/api/playback/sessions/${encodeURIComponent(String(props.sessionId))}/terminate`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason.value }),
    });
    emit('terminated');
    emit('close');
  } catch (err: any) {
    error.value = err?.message || 'Plex n’a pas pu arrêter la lecture.';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.terminate-reason { width: 100%; min-height: 80px; resize: vertical; font: inherit; }
</style>
