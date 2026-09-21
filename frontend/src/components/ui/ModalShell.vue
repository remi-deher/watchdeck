<template>
  <Teleport to="body">
    <!-- Le voile se fond et le panneau monte : sans transition, la modale se substituait
         a l'ecran d'un seul coup et l'oeil devait la relire entierement pour savoir ce
         qui venait d'arriver. Les regles vivent dans `_motion.scss`, avec le reste du
         mouvement de l'application. -->
    <Transition name="modal-fade">
      <div v-if="open" class="drawer-backdrop" @click.self="requestClose">
      <aside
        ref="panelRef"
        tabindex="-1"
        class="modal-panel"
        :class="panelClass"
        role="dialog"
        :aria-modal="modal ? 'true' : 'false'"
        :aria-label="ariaLabel || title"
      >
        <div class="panel-head">
          <div>
            <h2><slot name="title">{{ title }}</slot></h2>
            <p v-if="subtitle">{{ subtitle }}</p>
          </div>
          <UiButton variant="ghost" icon-only title="Fermer" aria-label="Fermer" :disabled="busy" @click="requestClose">
            <X />
          </UiButton>
        </div>
        <UiFeedback v-if="error" type="error" :message="error" />
        <slot />
        <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, toRef } from 'vue';
import { X } from '@lucide/vue';
import { useModalA11y } from '@/composables/useModalA11y';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';
import UiButton from './UiButton.vue';
import UiFeedback from './UiFeedback.vue';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    title: string;
    subtitle?: string;
    ariaLabel?: string;
    panelClass?: string;
    error?: string;
    busy?: boolean;
    /** Sélecteur CSS de l'élément à focaliser à l'ouverture (défaut : premier focusable). */
    initialFocus?: string;
    /**
     * Surface modale : l'arrière-plan devient inerte et la tabulation y est piégée.
     *
     * `false` pour une surface ancrée à son déclencheur, qui doit rester atteignable
     * pour la refermer — le tiroir de filtres, posé sur la barre de recherche qui
     * continue de le commander.
     */
    modal?: boolean;
  }>(),
  {
    open: true,
    subtitle: '',
    ariaLabel: '',
    panelClass: '',
    error: '',
    busy: false,
    initialFocus: '',
    modal: true,
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
}>();

function requestClose(): void {
  if (!props.busy) emit('close');
}

const panelRef = ref<HTMLElement | null>(null);
const openRef = toRef(props, 'open');
useBodyScrollLock(openRef, { inertBackground: props.modal });
useModalA11y(panelRef, openRef, requestClose, { initialFocus: props.initialFocus, trapFocus: props.modal });
</script>
