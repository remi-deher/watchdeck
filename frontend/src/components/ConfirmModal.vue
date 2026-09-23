<template><span v-if="false" /></template>
<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useConfirm } from 'primevue/useconfirm';
const props = withDefaults(defineProps<{ open?: boolean; title?: string; message?: string; confirmLabel?: string; danger?: boolean; busy?: boolean }>(),
  { open: false, title: 'Confirmer l’action', message: '', confirmLabel: 'Confirmer', danger: false, busy: false });
const emit = defineEmits<{ (e: 'cancel'): void; (e: 'confirm'): void }>();
const confirm = useConfirm();
function show(): void {
  confirm.require({ group: 'app', header: props.title, message: props.message, acceptLabel: props.confirmLabel,
    rejectLabel: 'Annuler', acceptProps: { severity: props.danger ? 'danger' : undefined, loading: props.busy, disabled: props.busy },
    rejectProps: { disabled: props.busy }, accept: () => emit('confirm'), reject: () => emit('cancel') });
}
onMounted(() => { if (props.open) show(); });
watch(() => props.open, (open, previous) => { if (open && !previous) show(); });
</script>
