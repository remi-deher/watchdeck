<template>
  <!-- Barre de commande des Notifications : l'état de l'envoi automatique en retour de la
       capsule, sa suspension en action. Une seule source pour la file et le journal. -->
  <div class="cmd" role="region" :aria-label="part === 'hold' ? 'Suspension des envois' : 'État des envois'">
    <template v-if="part !== 'hold'">
      <UiBadge dot :tone="suspended ? 'warning' : 'success'">{{ suspended ? 'Envoi suspendu' : 'Envoi actif' }}</UiBadge>
      <UiBadge v-if="pendingCount" tone="neutral">{{ pendingCount }} en attente</UiBadge>
    </template>
    <UiButton
      v-if="part !== 'state'"
      size="sm"
      :loading="saving"
      :title="suspended ? 'Réactiver les notifications automatiques' : 'Mettre les notifications en attente'"
      @click="toggle(!suspended, askConfirm)"
    >
      <template #icon><Play v-if="suspended" /><Pause v-else /></template>{{ suspended ? 'Réactiver' : 'Suspendre' }}
    </UiButton>
    <ConfirmModal v-if="part !== 'state'" v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
  </div>
</template>

<script setup lang="ts">
import { Pause, Play } from '@lucide/vue';
import { useConfirm } from '@/composables/useConfirm';
import { useNotificationHold } from '@/composables/useNotificationHold';
import ConfirmModal from '@/components/ConfirmModal.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiButton from '@/components/ui/UiButton.vue';

/* `part` : la barre entière, ou seulement l'état (retour de la capsule) ou la
   suspension (action de la capsule). */
withDefaults(defineProps<{ part?: 'all' | 'state' | 'hold' }>(), { part: 'all' });

const { suspended, pendingCount, saving, toggle } = useNotificationHold();
const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
</script>

<style scoped lang="scss">
.cmd { display: flex; align-items: center; gap: var(--space-2); }
</style>
