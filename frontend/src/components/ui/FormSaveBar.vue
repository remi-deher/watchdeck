<template>
  <Transition name="save-bar">
    <aside v-if="dirty" class="form-save-bar" role="status" aria-live="polite">
      <div><span class="unsaved-dot" aria-hidden="true"/><span><strong>Modifications non enregistrées</strong><small>Enregistrez avant de quitter cette page.</small></span></div>
      <UiButton variant="primary" :loading="saving" @click="$emit('save')"><template #icon><Save /></template>{{ saving?'Enregistrement…':'Enregistrer' }}</UiButton>
    </aside>
  </Transition>
</template>
<script setup lang="ts">
import { Save } from '@lucide/vue';
import UiButton from './UiButton.vue';

defineProps<{
  dirty?: boolean;
  saving?: boolean;
}>();

defineEmits<{
  (e: 'save'): void;
}>();
</script>
