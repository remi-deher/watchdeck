<template>
  <div class="app-toast-host" role="status" aria-live="polite" aria-atomic="false" aria-label="Notifications">
    <Toast position="bottom-right" group="app" @close="onToastEnd" @life-end="onToastEnd">
      <template #message="{ message }">
        <div class="app-toast-content">
          <div class="app-toast-icon" aria-hidden="true">
            <img v-if="message.data?.image" :src="message.data.image" alt="">
            <Info v-else />
          </div>
          <div class="app-toast-copy">
            <strong>{{ message.summary }}</strong>
            <p v-if="message.detail">{{ message.detail }}</p>
            <button v-if="message.data?.action" type="button" class="app-toast-action" @click="runAction(message)">
              {{ message.data.action.label }}
            </button>
          </div>
        </div>
      </template>
    </Toast>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { Info } from '@lucide/vue';
import Toast from 'primevue/toast';
import type { ToastEvent } from 'primevue/toast';
import { useToast as usePrimeToast } from 'primevue/usetoast';
import { forgetToast, registerToastService, unregisterToastService, useToast, type AppToastMessage } from '@/composables/useToast';

const primeToast = usePrimeToast();
const { dismissToast } = useToast();
onMounted(() => registerToastService(primeToast));
onUnmounted(() => unregisterToastService(primeToast));

function runAction(message: AppToastMessage): void {
  dismissToast(message.data.id);
  void message.data.action?.run();
}

function onToastEnd(event: ToastEvent): void {
  const data = (event.message as AppToastMessage).data;
  if (data) forgetToast(data.id);
}
</script>

<style scoped lang="scss">
.app-toast-host :deep(.p-toast) { right: max(18px, var(--safe-right)); bottom: max(18px, var(--safe-bottom)); width: min(380px, calc(100vw - 28px)); }
.app-toast-host :deep(.p-toast-message) { border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border)); border-radius: var(--radius-md); background: color-mix(in srgb, var(--surface) 94%, black); box-shadow: 0 18px 50px rgb(0 0 0 / 42%); }
.app-toast-host :deep(.p-toast-message-content) { padding: 12px; }
.app-toast-host :deep(.p-toast-message-icon) { display: none; }
.app-toast-host :deep(.p-toast-close-button) { color: var(--muted); }
.app-toast-content { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: var(--space-3); align-items: center; min-width: 0; }
.app-toast-icon { display: grid; place-items: center; width: 38px; height: 38px; overflow: hidden; border-radius: var(--radius-sm); background: rgb(229 160 13 / 14%); color: var(--accent); }
.app-toast-icon img { width: 100%; height: 100%; object-fit: cover; }
.app-toast-icon svg { width: 17px; }
.app-toast-copy { display: grid; gap: var(--space-1); min-width: 0; }
.app-toast-copy strong { font-size: var(--fs-sm); }
.app-toast-copy p { overflow: hidden; margin: 0; color: var(--muted); font-size: var(--fs-xs); line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.app-toast-action { justify-self: start; margin-top: 4px; padding: 5px 10px; border: 0; border-radius: var(--radius-sm); color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); font-size: var(--fs-xs); font-weight: 700; }
.app-toast-action:hover { background: color-mix(in srgb, var(--accent) 22%, transparent); }
@media (max-width: 767.98px) {
  .app-toast-host :deep(.p-toast) { right: max(14px, var(--safe-right)); bottom: calc(var(--app-shell-offset-bottom) + 14px); }
  :root:has(.app-topbar) .app-toast-host :deep(.p-toast) { bottom: calc(var(--app-shell-offset-bottom) + var(--app-topbar-h) + 22px); }
  .app-toast-host :deep(.p-toast-message-content) { padding: 10px; }
}
</style>
