<template>
  <div v-if="message" class="ui-feedback" :class="`is-${type}`" :role="type === 'error' ? 'alert' : 'status'" aria-live="polite">
    <component :is="icon" aria-hidden="true" />
    <div><strong v-if="title">{{ title }}</strong><span>{{ message }}</span></div>
    <UiButton v-if="retry" size="sm" @click="$emit('retry')">Réessayer</UiButton>
    <button v-if="dismissible" class="ui-feedback-close" type="button" aria-label="Fermer" @click="$emit('dismiss')"><X /></button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { AlertTriangle, CheckCircle2, Info, LoaderCircle, X } from '@lucide/vue';
import UiButton from './UiButton.vue';

const props = withDefaults(
  defineProps<{
    type?: 'info' | 'success' | 'error' | 'warning' | 'loading' | string;
    title?: string;
    message?: string;
    retry?: boolean;
    dismissible?: boolean;
  }>(),
  {
    type: 'info',
    title: '',
    message: '',
    retry: false,
    dismissible: false,
  }
);

defineEmits<{
  (e: 'retry'): void;
  (e: 'dismiss'): void;
}>();

const icon = computed(() => {
  const map: Record<string, any> = {
    success: CheckCircle2,
    error: AlertTriangle,
    warning: AlertTriangle,
    loading: LoaderCircle,
  };
  return map[props.type] || Info;
});
</script>
