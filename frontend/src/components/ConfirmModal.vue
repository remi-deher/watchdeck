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
        <!-- Ce que l'action touche, nommé : « 8 comptes » ne dit pas lesquels. -->
        <ul v-if="items.length" class="confirm-modal__items" aria-label="Éléments concernés">
          <li v-for="item in shownItems" :key="item.key">
            <span>{{ item.label }}</span><small v-if="item.detail">{{ item.detail }}</small>
          </li>
          <li v-if="hiddenCount" class="confirm-modal__more">et {{ hiddenCount }} autre{{ hiddenCount > 1 ? 's' : '' }}</li>
        </ul>
        <label v-if="typeToConfirm" class="confirm-modal__typed">
          <span>Tapez <strong>{{ typeToConfirm }}</strong> pour confirmer</span>
          <input v-model="typed" autocomplete="off" spellcheck="false" :aria-label="`Tapez ${typeToConfirm} pour confirmer`">
        </label>
        <div class="actions">
          <!-- Des boutons simples, et non AlertDialogAction/Cancel : ceux-ci ferment aussi le
               dialogue, et cette fermeture repondait « Annuler » avant la confirmation. -->
          <UiButton :disabled="busy" @click="$emit('cancel')">Annuler</UiButton>
          <UiButton :variant="danger ? 'danger' : 'primary'" :loading="busy" :disabled="!unlocked" @click="$emit('confirm')">{{ confirmLabel }}</UiButton>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import {
  AlertDialogContent, AlertDialogDescription, AlertDialogOverlay,
  AlertDialogPortal, AlertDialogRoot, AlertDialogTitle,
} from 'reka-ui';
import UiButton from '@/components/ui/UiButton.vue';
import { useBackButtonClose } from '@/composables/useBackButtonClose';
const props = withDefaults(defineProps<{
  open?: boolean; title?: string; message?: string; confirmLabel?: string; danger?: boolean; busy?: boolean;
  items?: Array<{ key: string | number; label: string; detail?: string }>; typeToConfirm?: string;
}>(),
  { open: false, title: 'Confirmer l’action', message: '', confirmLabel: 'Confirmer', danger: false, busy: false, items: () => [], typeToConfirm: '' });
const MAX_ITEMS = 5;
const shownItems = computed(() => props.items.slice(0, MAX_ITEMS));
const hiddenCount = computed(() => Math.max(0, props.items.length - MAX_ITEMS));
// Le texte à taper repart de zéro à chaque ouverture : une confirmation ne se reporte pas.
const typed = ref('');
watch(() => props.open, () => { typed.value = ''; });
const unlocked = computed(() => !props.typeToConfirm || typed.value.trim() === props.typeToConfirm);
const emit = defineEmits<{ (e: 'cancel'): void; (e: 'confirm'): void }>();
function retenirSiOccupe(event: Event): void { if (props.busy) event.preventDefault(); }
// « Retour » repond « Annuler ».
useBackButtonClose(toRef(props, 'open'), () => { if (!props.busy) emit('cancel'); });
</script>
