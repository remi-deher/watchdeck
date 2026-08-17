<template>
  <template v-if="!bare">
    <!-- Desktop : sidebar collapsible sticky -->
    <aside v-if="!isMobile" v-show="open" class="filter-sidebar" aria-label="Filtres">
      <div class="filter-sidebar-head">
        <span class="filter-sidebar-title"><SlidersHorizontal :size="15" />Filtres</span>
        <button v-if="activeCount" class="text-button text-xs" @click="$emit('reset')">Réinitialiser</button>
      </div>
      <div class="filter-sidebar-body">
        <slot />
      </div>
    </aside>
    <!-- Mobile : bottom-sheet modal -->
    <ModalShell v-else :open="open" title="Filtres" @close="$emit('close')">
      <div class="filter-modal-body">
        <slot />
      </div>
      <template v-if="activeCount" #actions>
        <UiButton @click="$emit('reset'); $emit('close')">Réinitialiser</UiButton>
      </template>
    </ModalShell>
  </template>

  <!-- bare mode: no header/box, just toggle behavior — slot provides its own styling -->
  <template v-else>
    <div v-if="!isMobile" v-show="open" class="filter-sidebar-bare"><slot /></div>
    <ModalShell v-else :open="open" title="Filtres" @close="$emit('close')"><slot /></ModalShell>
  </template>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { SlidersHorizontal } from '@lucide/vue';
import ModalShell from './ModalShell.vue';
import UiButton from './UiButton.vue';

withDefaults(
  defineProps<{
    open?: boolean;
    activeCount?: number;
    bare?: boolean;
  }>(),
  {
    open: false,
    activeCount: 0,
    bare: false,
  }
);

defineEmits<{
  (e: 'close'): void;
  (e: 'reset'): void;
}>();

const isMobile = ref(false);
let mq: MediaQueryList | undefined;

onMounted(() => {
  mq = window.matchMedia?.('(max-width: 900px)');
  if (mq) {
    isMobile.value = Boolean(mq.matches);
    mq.addEventListener?.('change', onMqChange);
  }
});
onUnmounted(() => mq?.removeEventListener?.('change', onMqChange));

function onMqChange(e: MediaQueryListEvent): void {
  isMobile.value = e.matches;
}
</script>

<style scoped lang="scss">
/* ── Sidebar desktop ── */
.filter-sidebar {
  flex: none;
  width: 210px;
  position: sticky;
  top: 68px;
  max-height: calc(100dvh - 84px);
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  scrollbar-width: thin;
}

.filter-sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  font-weight: 600;
  font-size: var(--fs-sm);
}
.filter-sidebar-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
}

.filter-sidebar-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
/* Makes selects and full-width buttons fill the sidebar */
.filter-sidebar-body :deep(select),
.filter-sidebar-body :deep(input[type="search"]) {
  width: 100%;
}
.filter-sidebar-body :deep(.ui-button),
.filter-sidebar-body :deep(button.danger) {
  width: 100%;
  justify-content: center;
}

/* filter-group / group-label / filter-badge : styles globaux dans styles/layout/_layout.scss */

/* ── Bare mode (slot provides its own box styling) ── */
.filter-sidebar-bare {
  flex: none;
  position: sticky;
  top: 68px;
  max-height: calc(100dvh - 84px);
  overflow-y: auto;
  scrollbar-width: thin;
}

/* ── Modal mobile (injected into ModalShell) ── */
.filter-modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-2) 0;
}
.filter-modal-body :deep(select),
.filter-modal-body :deep(input[type="search"]) {
  width: 100%;
}
.filter-modal-body :deep(.ui-button),
.filter-modal-body :deep(button.danger) {
  width: 100%;
  justify-content: center;
}
</style>
