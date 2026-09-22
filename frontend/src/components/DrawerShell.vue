<template>
  <Drawer :visible="true" position="right" modal :dismissable="true" :block-scroll="false" :show-close-icon="false"
    @update:visible="onVisibleChange">
    <template #container>
      <aside class="detail-drawer" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="title || 'Detail'">
        <slot name="background" />
        <header class="drawer-head">
          <div><span v-if="eyebrow" class="eyebrow">{{ eyebrow }}</span><h2>{{ title }}</h2></div>
          <div class="drawer-head-actions"><slot name="head-actions" /><UiButton variant="ghost" icon-only title="Fermer" aria-label="Fermer" @click="emit('close')"><X /></UiButton></div>
        </header>
        <UiFeedback v-if="error" type="error" :message="error" />
        <slot />
      </aside>
    </template>
  </Drawer>
</template>
<script setup lang="ts">
import { X } from '@lucide/vue';
import Drawer from 'primevue/drawer';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';
import UiButton from '@/components/ui/UiButton.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
withDefaults(defineProps<{ eyebrow?: string; title?: string; wide?: boolean; error?: string }>(), { eyebrow: '', title: '', wide: false, error: '' });
const emit = defineEmits<{ (e: 'close'): void }>();
useBodyScrollLock();
function onVisibleChange(visible: boolean): void { if (!visible) emit('close'); }
</script>
