<template>
  <Teleport v-if="shellMode === 'compact'" to="body">
    <Transition name="modal-fade">
      <div v-if="open" class="drawer-backdrop" @click.self="requestClose">
        <aside ref="panelRef" tabindex="-1" class="modal-panel" :class="panelClass" role="dialog"
          :aria-modal="modal ? 'true' : 'false'" :aria-label="ariaLabel || title">
          <div class="sheet-grab" aria-hidden="true"><span /></div>
          <ModalContent />
        </aside>
      </div>
    </Transition>
  </Teleport>
  <Dialog v-else class="modal-shell-dialog" :visible="open" :modal="modal" :dismissable-mask="!busy" :closable="false" :block-scroll="false"
    :draggable="false" :aria-label="ariaLabel || title" @update:visible="onVisibleChange">
    <template #container>
      <aside tabindex="-1" class="modal-panel modal-panel--prime" :class="panelClass">
        <ModalContent />
      </aside>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, toRef, useSlots } from 'vue';
import { X } from '@lucide/vue';
import Dialog from 'primevue/dialog';
import { useModalA11y } from '@/composables/useModalA11y';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';
import { useSheetDrag } from '@/composables/useSheetDrag';
import { useShellMode } from '@/composables/useShellMode';
import UiButton from './UiButton.vue';
import UiFeedback from './UiFeedback.vue';

const props = withDefaults(defineProps<{ open?: boolean; title: string; subtitle?: string; ariaLabel?: string; panelClass?: string; error?: string; busy?: boolean; initialFocus?: string; modal?: boolean }>(),
  { open: true, subtitle: '', ariaLabel: '', panelClass: '', error: '', busy: false, initialFocus: '', modal: true });
const emit = defineEmits<{ (e: 'close'): void }>();
const slots = useSlots();
const shellMode = useShellMode();
const panelRef = ref<HTMLElement | null>(null);
const openRef = toRef(props, 'open');
const compactOpen = computed(() => props.open && shellMode.value === 'compact');

function requestClose(): void { if (!props.busy) emit('close'); }
function onVisibleChange(visible: boolean): void { if (!visible) requestClose(); }

useBodyScrollLock(openRef, { inertBackground: props.modal });
useModalA11y(panelRef, compactOpen, requestClose, { initialFocus: props.initialFocus, trapFocus: props.modal });
useSheetDrag(panelRef, compactOpen, { onClose: requestClose, enabled: () => shellMode.value === 'compact', poignee: '.sheet-grab' });

const ModalContent = defineComponent({
  setup() {
    return () => [
      h('div', { class: 'panel-head' }, [
        h('div', {}, [slots.title?.() ?? h('h2', {}, props.title), props.subtitle ? h('p', {}, props.subtitle) : null]),
        h(UiButton, { variant: 'ghost', iconOnly: true, title: 'Fermer', 'aria-label': 'Fermer', disabled: props.busy, onClick: requestClose }, () => h(X)),
      ]),
      props.error ? h(UiFeedback, { type: 'error', message: props.error }) : null,
      slots.default?.(),
      slots.actions ? h('div', { class: 'actions' }, slots.actions()) : null,
    ];
  },
});
</script>
