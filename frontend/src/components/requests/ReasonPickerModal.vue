<template>
  <!-- Le motif etait saisi a la main a chaque fois : le meme refus se formulait differemment
       d'une fois a l'autre, et les tournures utiles se perdaient. Le choix et le message
       passent par le gabarit Creer. -->
  <CreateTemplate :open="open" :definition="definition" mode="edit" @close="dismiss" />
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api';
import CreateTemplate from '@/components/templates/CreateTemplate.vue';
import { reasonPickerForm } from '@/creations/reasonPicker';

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
    /** Message pré-rempli, par exemple la cause technique de l'échec. */
    initial?: string;
  }>(),
  {
    open: false,
    event: 'cancelled',
    title: 'Annuler cette demande ?',
    subtitle: '',
    confirmLabel: 'Annuler la demande',
    initial: '',
  }
);

const emit = defineEmits<{
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

/* Fermer apres avoir valide n'est pas annuler : le parent regle la suite dans `confirm`. */
let confirmed = false;
watch(() => props.open, (open) => { if (open) confirmed = false; });
const definition = computed(() => reasonPickerForm({
  title: props.title,
  subtitle: props.subtitle,
  confirmLabel: props.confirmLabel,
  placeholder: 'Expliquez au demandeur ce qui a été décidé, et pourquoi.',
  reasons: () => reasons.value,
  initial: () => props.initial,
  onConfirm: (message) => { confirmed = true; emit('confirm', message); },
}));
function dismiss(): void {
  if (!confirmed) emit('cancel');
  confirmed = false;
}
</script>
