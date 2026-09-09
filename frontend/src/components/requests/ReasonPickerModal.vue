<template>
  <ModalShell :open="open" :title="title" :subtitle="subtitle" @close="$emit('cancel')">
    <!-- Le motif etait saisi a la main a chaque fois : le meme refus se formulait
         differemment d'une fois a l'autre, et les tournures utiles se perdaient. -->
    <div v-if="reasons.length" class="reason-choices">
      <button
        v-for="reason in reasons"
        :key="reason.id"
        type="button"
        class="filter-badge"
        :class="{ active: selectedId === reason.id }"
        @click="choose(reason)"
      ><span>{{ reason.label }}</span></button>
      <button
        type="button"
        class="filter-badge"
        :class="{ active: selectedId === null }"
        @click="choose(null)"
      ><span>Message libre</span></button>
    </div>

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
import { ref, watch } from 'vue';
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

const reasons = ref<Reason[]>([]);
const message = ref('');
const selectedId = ref<number | null>(null);
const placeholder = 'Expliquez au demandeur ce qui a été décidé, et pourquoi.';

function choose(reason: Reason | null): void {
  selectedId.value = reason?.id ?? null;
  if (reason) message.value = reason.message;
}

/* Les motifs sont charges a l'ouverture : les modifier dans les reglages doit se voir
   au prochain usage, sans recharger la page. */
watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    message.value = props.initial || '';
    selectedId.value = null;
    try {
      const payload = await api<{ items?: Reason[] }>(`/api/message-reasons?event=${encodeURIComponent(props.event)}`);
      reasons.value = (payload.items || []).filter((reason) => reason.enabled);
    } catch {
      // Sans motifs, il reste la saisie libre : l'annulation ne doit pas en dependre.
      reasons.value = [];
    }
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
