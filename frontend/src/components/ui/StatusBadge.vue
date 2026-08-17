<template>
  <UiBadge :tone="tone" dot pill :title="description || undefined">{{ displayLabel }}</UiBadge>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { REQUEST_STATUS_LABELS } from '@/utils/labels';
import UiBadge from './UiBadge.vue';

const props = withDefaults(
  defineProps<{
    status?: string;
    label?: string;
    description?: string;
  }>(),
  {
    status: 'neutral',
    label: '',
    description: '',
  }
);

const TONES: Record<string, string> = {
  available: 'success',
  completed: 'success',
  active: 'success',
  sent: 'success',
  closed: 'success',
  sent_to_arr: 'info',
  downloading: 'info',
  investigating: 'info',
  running: 'info',
  pending: 'neutral',
  queued: 'neutral',
  inactive: 'neutral',
  pending_approval: 'warning',
  partially_available: 'warning',
  paused: 'warning',
  open: 'warning',
  warning: 'warning',
  failed: 'danger',
  error: 'danger',
  rejected: 'danger',
  blocked: 'danger',
  accepted: 'info',
  importing: 'info',
  awaiting_verification: 'warning',
  verified: 'success',
  grabbed: 'success',
  dismissed: 'neutral',
  waiting_release: 'neutral',
};

const OWN_LABELS: Record<string, string> = {
  completed: 'Terminé',
  active: 'Actif',
  sent: 'Envoyée',
  closed: 'Clos',
  sent_to_arr: 'Transmise à *Arr',
  downloading: 'Téléchargement',
  investigating: 'En cours',
  running: 'En cours',
  queued: 'En file',
  inactive: 'Inactif',
  paused: 'En pause',
  open: 'Ouvert',
  warning: 'Attention',
  error: 'Erreur',
  blocked: 'Bloqué',
  waiting_release: 'En attente de release',
};

const normalized = computed(() => String(props.status || 'neutral').toLowerCase());
const tone = computed(() => TONES[normalized.value] || 'neutral');
const displayLabel = computed(
  () =>
    props.label ||
    OWN_LABELS[normalized.value] ||
    REQUEST_STATUS_LABELS[normalized.value] ||
    String(props.status || '—')
);
</script>
