<template>
  <section class="panel preview-panel">
    <UiSectionHeader title="Apercu">
      <template #actions><span class="badge">{{ deviceLabel }}</span><span class="badge">{{ eventLabel }}</span></template>
    </UiSectionHeader>
    <div class="preview-viewport" :class="`device-${deviceMode}`">
      <iframe :srcdoc="previewHtml" title="Apercu email" sandbox="allow-same-origin"></iframe>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import UiSectionHeader from '@/components/ui/UiSectionHeader.vue';

const props = withDefaults(
  defineProps<{
    previewHtml?: string;
    eventLabel?: string;
    deviceMode?: string;
  }>(),
  {
    previewHtml: '',
    eventLabel: '',
    deviceMode: 'desktop',
  }
);
const deviceLabel = computed(
  () => ({ desktop: 'Ordinateur', tablet: 'Tablette', phone: 'Telephone' } as Record<string, string>)[props.deviceMode] || 'Ordinateur'
);
</script>

<style scoped lang="scss">
.preview-viewport{display:flex;justify-content:center;overflow:auto;margin-top:12px;padding:10px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm)}.preview-viewport iframe{display:block;margin:0;width:100%;max-width:100%;transition:width .2s ease}.preview-viewport.device-tablet iframe{width:768px}.preview-viewport.device-phone iframe{width:375px}
</style>
