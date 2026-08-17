<template>
  <ModalShell
    :open="open"
    title="Aperçu de l'email"
    :subtitle="subject"
    panel-class="notification-preview-modal"
    :error="error"
    @close="$emit('close')"
  >
    <p v-if="loading" class="notice">Chargement…</p>
    <template v-else>
      <p v-if="note" class="notice">{{ note }}</p>
      <p v-if="!reconstructable && !note" class="notice">{{ note || "Aperçu indisponible pour ce type d'événement." }}</p>
      <div v-if="html" class="notification-preview-viewport">
        <iframe :srcdoc="html" title="Aperçu email" sandbox="allow-same-origin"></iframe>
      </div>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import ModalShell from '@/components/ui/ModalShell.vue';

withDefaults(
  defineProps<{
    open?: boolean;
    loading?: boolean;
    error?: string;
    subject?: string;
    html?: string;
    note?: string;
    reconstructable?: boolean;
  }>(),
  { open: false, loading: false, error: '', subject: '', html: '', note: '', reconstructable: true }
);
defineEmits<{ (e: 'close'): void }>();
</script>

<style scoped lang="scss">
:deep(.notification-preview-modal) { width: min(720px, calc(100% - 24px)); }
.notification-preview-viewport {
  overflow: auto;
  margin-top: 12px;
  padding: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.notification-preview-viewport iframe {
  display: block;
  width: 100%;
  min-height: 60vh;
  border: 0;
}
</style>
