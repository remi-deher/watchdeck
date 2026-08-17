<template>
  <ModalShell
    :open="open"
    :title="title"
    :subtitle="message"
    panel-class="confirm-modal"
    :busy="busy"
    @close="$emit('cancel')"
  >
    <slot />
    <UiToolbar class="form-actions" align="end" role="group" aria-label="Confirmation">
      <UiButton :disabled="busy" @click="$emit('cancel')">Annuler</UiButton>
      <UiButton :variant="danger ? 'danger' : 'primary'" :loading="busy" @click="$emit('confirm')">
        {{ busy ? 'Traitement…' : confirmLabel }}
      </UiButton>
    </UiToolbar>
  </ModalShell>
</template>

<script setup lang="ts">
import ModalShell from '@/components/ui/ModalShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiToolbar from '@/components/ui/UiToolbar.vue';

withDefaults(
  defineProps<{
    open?: boolean;
    title?: string;
    message?: string;
    confirmLabel?: string;
    danger?: boolean;
    busy?: boolean;
  }>(),
  {
    open: false,
    title: 'Confirmer l’action',
    message: '',
    confirmLabel: 'Confirmer',
    danger: false,
    busy: false,
  }
);

defineEmits<{
  (e: 'cancel'): void;
  (e: 'confirm'): void;
}>();
</script>

<style scoped lang="scss">
:deep(.confirm-modal) { width: min(480px, calc(100% - 24px)); }
:deep(.confirm-modal .panel-head p) { margin-top: .35rem; color: var(--muted, #667085); }
:deep(.confirm-modal .form-actions) { justify-content: flex-end; margin-top: 1.5rem; }
</style>
