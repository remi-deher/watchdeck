<template>
  <ModalShell :open="open" :title="title" :subtitle="subtitle" @close="$emit('cancel')">
    <!-- Le motif etait saisi a la main a chaque fois : le meme refus se formulait
         differemment d'une fois a l'autre, et les tournures utiles se perdaient. -->
    <UiChipGroup
      v-if="reasons.length"
      class="reason-choices"
      label="Motif"
      :options="[...reasons.map((reason) => ({ value: reason.id, label: reason.label })), { value: null, label: 'Message libre' }]"
      :model-value="selectedId"
      @update:model-value="(id) => choose(reasons.find((reason) => reason.id === id) ?? null)"
    />

    <label class="reason-message">
      <span>Message envoyé au demandeur</span>
      <textarea v-model="message" rows="5" :placeholder="placeholder"></textarea>
      <small>Laissé vide, l’annulation part sans explication.</small>
    </label>

    <UiToolbar class="form-actions" align="end" role="group" aria-label="Confirmation">
      <UiButton @click="$emit('cancel')">Annuler</UiButton>
      <UiButton variant="danger" :loading="busy" @click="$emit('confirm', message.trim())">{{ confirmLabel }}</UiButton>
    </UiToolbar>
  </ModalShell>
</template>

<script setup lang="ts">
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import { computed, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api';
import ModalShell from '@/components/ui/ModalShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiToolbar from '@/components/ui/UiToolbar.vue';

interface Reason {
  id: number;
  label: string;
  message: string;
  enabled: boolean;
}

const props = withDefaults(
  defineProps<{
    open?: boolean;
    /** Contexte du motif : « cancelled » ou « correction ». */
    event?: string;
    title?: string;
    subtitle?: string;
    confirmLabel?: string;
    busy?: boolean;
    /** Message pré-rempli, par exemple la cause technique de l'échec. */
    initial?: string;
  }>(),
  {
    open: false,
    event: 'cancelled',
    title: 'Annuler cette demande ?',
    subtitle: '',
    confirmLabel: 'Annuler la demande',
    busy: false,
    initial: '',
  }
);

defineEmits<{
  (e: 'cancel'): void;
  (e: 'confirm', message: string): void;
}>();

/* Motifs lus a l'ouverture, sous la cle des reglages : les modifier dans les reglages
   invalide cette liste, et le prochain usage les voit sans recharger la page. Sans
   motifs (echec de lecture), il reste la saisie libre : l'annulation n'en depend pas. */
const reasonsQuery = useQuery({
  queryKey: computed(() => ['settings', 'message-reasons', props.event]),
  queryFn: ({ signal }) => api<{ items?: Reason[] }>(`/api/message-reasons?event=${encodeURIComponent(props.event)}`, { signal }),
  enabled: computed(() => props.open),
  retry: 0,
});
const reasons = computed(() => (reasonsQuery.data.value?.items || []).filter((reason) => reason.enabled));
const message = ref('');
const selectedId = ref<number | null>(null);
const placeholder = 'Expliquez au demandeur ce qui a été décidé, et pourquoi.';

function choose(reason: Reason | null): void {
  selectedId.value = reason?.id ?? null;
  if (reason) message.value = reason.message;
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    message.value = props.initial || '';
    selectedId.value = null;
  },
  { immediate: true }
);
</script>

<style scoped lang="scss">
.reason-choices { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); }
.reason-message { display: grid; gap: 4px; }
.reason-message > span { color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.reason-message small { color: var(--muted); font-size: var(--fs-xs); }
.reason-message textarea { width: 100%; resize: vertical; }
</style>
