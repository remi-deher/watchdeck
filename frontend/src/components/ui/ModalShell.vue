<template>
  <Teleport to="body">
    <div v-if="open" class="drawer-backdrop" @click.self="requestClose">
      <aside
        ref="panelRef"
        tabindex="-1"
        class="modal-panel"
        :class="panelClass"
        role="dialog"
        aria-modal="true"
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
  }>(),
  {
    open: true,
    subtitle: '',
    ariaLabel: '',
    panelClass: '',
    error: '',
    busy: false,
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
useBodyScrollLock(openRef);
useModalA11y(panelRef, openRef, requestClose);
</script>
