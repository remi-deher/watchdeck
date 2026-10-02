<template>
  <!-- AlertDialog de Reka UI : une question qui exige une reponse -- pas de fermeture au
       clic a cote, le focus pose sur « Annuler » (le choix sans consequence), Echap vaut
       « Annuler ». Rendu sur place, sans le service de confirmation global de PrimeVue. -->
  <AlertDialogRoot :open="open" @update:open="(o) => { if (!o && !busy) $emit('cancel'); }">
    <AlertDialogPortal>
      <AlertDialogOverlay class="drawer-backdrop drawer-backdrop--confirm-modal" />
      <AlertDialogContent class="modal-panel confirm-modal" @escape-key-down="retenirSiOccupe">
        <div class="panel-head">
          <AlertDialogTitle as="h2">{{ title }}</AlertDialogTitle>
        </div>
        <AlertDialogDescription v-if="message" class="confirm-modal__message">{{ message }}</AlertDialogDescription>
        <div class="actions">
          <!-- Des boutons simples, et non AlertDialogAction/Cancel : ceux-ci ferment aussi le
               dialogue, et cette fermeture repondait « Annuler » avant la confirmation. -->
          <UiButton :disabled="busy" @click="$emit('cancel')">Annuler</UiButton>
          <UiButton :variant="danger ? 'danger' : 'primary'" :loading="busy" @click="$emit('confirm')">{{ confirmLabel }}</UiButton>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
<script setup lang="ts">
import { toRef } from 'vue';
import {
  AlertDialogContent, AlertDialogDescription, AlertDialogOverlay,
  AlertDialogPortal, AlertDialogRoot, AlertDialogTitle,
} from 'reka-ui';
import UiButton from '@/components/ui/UiButton.vue';
import { useBackButtonClose } from '@/composables/useBackButtonClose';
const props = withDefaults(defineProps<{ open?: boolean; title?: string; message?: string; confirmLabel?: string; danger?: boolean; busy?: boolean }>(),
  { open: false, title: 'Confirmer l’action', message: '', confirmLabel: 'Confirmer', danger: false, busy: false });
const emit = defineEmits<{ (e: 'cancel'): void; (e: 'confirm'): void }>();
function retenirSiOccupe(event: Event): void { if (props.busy) event.preventDefault(); }
// « Retour » repond « Annuler ».
useBackButtonClose(toRef(props, 'open'), () => { if (!props.busy) emit('cancel'); });
</script>
