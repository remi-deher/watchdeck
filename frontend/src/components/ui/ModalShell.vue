<template>
  <!-- Reka UI porte le comportement -- focus tenu dans la modale puis rendu a l'appelant,
       Echap, clic exterieur, defilement verrouille, fond rendu inerte -- et ne dessine
       rien : la geometrie (carte centree sur ordinateur, feuille ancree en bas sur
       telephone) reste celle de `.modal-panel` dans `_components.scss`. -->
  <DialogRoot :open="open" :modal="modal" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay v-if="modal" ref="voileRef" class="drawer-backdrop" :class="overlayClass" />
      <DialogContent
        ref="panelRef"
        class="modal-panel"
        :class="panelClass"
        :aria-label="ariaLabel || undefined"
        v-bind="subtitle ? {} : { 'aria-describedby': undefined }"
        @open-auto-focus="onOpenAutoFocus"
        @escape-key-down="retenirSiOccupe"
        @pointer-down-outside="retenirSiOccupe"
        @interact-outside="retenirSiOccupe"
      >
        <div class="sheet-grab" aria-hidden="true"><span /></div>
        <div class="panel-head">
          <div>
            <DialogTitle as-child>
              <slot name="title"><h2>{{ title }}</h2></slot>
            </DialogTitle>
            <DialogDescription v-if="subtitle">{{ subtitle }}</DialogDescription>
          </div>
          <UiButton variant="ghost" icon-only title="Fermer" aria-label="Fermer" :disabled="busy" @click="requestClose"><X /></UiButton>
        </div>
        <UiFeedback v-if="error" type="error" :message="error" />
        <slot />
        <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { X } from '@lucide/vue';
import { useBackButtonClose } from '@/composables/useBackButtonClose';
import { useSheetGesture } from '@/composables/useSheetGesture';
import { useShellMode } from '@/composables/useShellMode';
import UiButton from './UiButton.vue';
import UiFeedback from './UiFeedback.vue';

const props = withDefaults(defineProps<{ open?: boolean; title: string; subtitle?: string; ariaLabel?: string; panelClass?: string; error?: string; busy?: boolean; initialFocus?: string; modal?: boolean }>(),
  { open: true, subtitle: '', ariaLabel: '', panelClass: '', error: '', busy: false, initialFocus: '', modal: true });
const emit = defineEmits<{ (e: 'close'): void }>();
const shellMode = useShellMode();
const panelRef = ref<unknown>(null);
const voileRef = ref<{ $el?: HTMLElement } | null>(null);
const compactOpen = computed(() => props.open && shellMode.value === 'compact');

/* Le voile porte les memes variantes que le panneau (`drawer-backdrop--filter-sheet`...) :
   il n'en est plus le parent, et les regles qui s'ecrivaient `:has(> .filter-sheet)` s'y
   accrochent desormais par la classe. */
const overlayClass = computed(() => props.panelClass.split(/\s+/).filter(Boolean).map((c) => `drawer-backdrop--${c}`));

function requestClose(): void { if (!props.busy) emit('close'); }
function onOpenChange(open: boolean): void { if (!open) requestClose(); }
/** Une action en cours ne se laisse pas interrompre par Echap ou un clic a cote. */
function retenirSiOccupe(event: Event): void { if (props.busy) event.preventDefault(); }

function onOpenAutoFocus(event: Event): void {
  if (!props.initialFocus) return;
  const panel = (panelRef.value as { $el?: HTMLElement } | null)?.$el;
  const cible = panel?.querySelector<HTMLElement>(props.initialFocus);
  if (!cible) return;
  event.preventDefault();
  cible.focus();
}

/* « Retour » referme la modale au lieu de quitter la page. */
useBackButtonClose(toRef(props, 'open'), requestClose);

/* Sur telephone, la feuille se tire vers le bas pour se fermer (voir `useSheetGesture`). */
useSheetGesture(panelRef, compactOpen, {
  onClose: requestClose,
  enabled: () => shellMode.value === 'compact' && !props.busy,
  poignee: '.sheet-grab',
  voile: () => voileRef.value?.$el ?? null,
  // Le panneau de filtres est pose sur la barre de recherche : il y rentre au doigt.
  rentreDansLaBarre: () => props.panelClass.split(/\s+/).includes('filter-sheet'),
});

defineExpose({ open: toRef(props, 'open') });
</script>
