<template>
  <!-- ModalShell en role « Confirmer » (`alert`) : une question qui exige une reponse -- pas de
       fermeture au clic a cote, le focus pose sur « Annuler » (le choix sans consequence), Echap et
       le geste de fermeture valent « Annuler ». Rendu sur place, sans le service de confirmation
       global de PrimeVue. -->
  <ModalShell :open="open" :title="title" :subtitle="message" size="sm" panel-class="confirm-modal" alert :busy="busy" initial-focus=".confirm-modal__cancel" @close="$emit('cancel')">
    <!-- Detail propre a l'appelant (avertissements, apercu) : il se glisse sous le message. -->
    <slot />
    <!-- Ce que l'action touche, nomme : « 8 comptes » ne dit pas lesquels. -->
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
    <template #actions>
      <UiButton class="confirm-modal__cancel" :disabled="busy" @click="$emit('cancel')">Annuler</UiButton>
      <UiButton :variant="danger ? 'danger' : 'primary'" :loading="busy" :disabled="!unlocked" @click="$emit('confirm')">{{ confirmLabel }}</UiButton>
    </template>
  </ModalShell>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
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
defineEmits<{ (e: 'cancel'): void; (e: 'confirm'): void }>();
</script>
