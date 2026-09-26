<template>
  <!-- Reka UI tient l'annonce aux lecteurs d'ecran, la pause au survol et au focus, le
       glissement pour ecarter et le raccourci F8 vers la zone des notifications. -->
  <ToastProvider label="Notification" swipe-direction="right">
    <ToastRoot
      v-for="toast in toasts"
      :key="toast.id"
      class="app-toast"
      :class="`is-${toast.type}`"
      :duration="toast.duration > 0 ? toast.duration : Infinity"
      :type="toast.type === 'error' ? 'foreground' : 'background'"
      @update:open="(open) => { if (!open) dismissToast(toast.id); }"
    >
      <div class="app-toast-icon" aria-hidden="true">
        <img v-if="toast.image" :src="toast.image" alt="">
        <Info v-else />
      </div>
      <div class="app-toast-copy">
        <ToastTitle as="strong">{{ toast.title }}</ToastTitle>
        <ToastDescription v-if="toast.message" as="p">{{ toast.message }}</ToastDescription>
        <ToastAction v-if="toast.action" as-child :alt-text="toast.action.label">
          <button type="button" class="app-toast-action" @click="runAction(toast)">{{ toast.action.label }}</button>
        </ToastAction>
      </div>
      <ToastClose class="app-toast-close" aria-label="Fermer la notification"><X aria-hidden="true" /></ToastClose>
    </ToastRoot>
    <ToastViewport class="app-toast-viewport" />
  </ToastProvider>
</template>

<script setup lang="ts">
import { Info, X } from '@lucide/vue';
import { ToastAction, ToastClose, ToastDescription, ToastProvider, ToastRoot, ToastTitle, ToastViewport } from 'reka-ui';
import { toasts, useToast, type AppToastMessage } from '@/composables/useToast';

const { dismissToast } = useToast();

function runAction(toast: AppToastMessage): void {
  dismissToast(toast.id);
  void toast.action?.run();
}
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.app-toast-viewport {
  position: fixed; z-index: var(--z-toast); right: max(18px, var(--safe-right)); bottom: max(18px, var(--safe-bottom));
  display: grid; gap: var(--space-2); width: min(380px, calc(100vw - 28px)); margin: 0; padding: 0; list-style: none; outline: none;
}
.app-toast {
  position: relative; display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: var(--space-3); align-items: center;
  min-width: 0; padding: 12px; border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border)); border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface) 94%, black); box-shadow: 0 18px 50px rgb(var(--shadow-color) / calc(0.42 * var(--shadow-scale))); color: var(--text);
}
.app-toast.is-error { border-color: color-mix(in srgb, var(--danger) 45%, var(--border)); }
.app-toast[data-state="open"] { animation: toast-in var(--motion-duration-base) var(--motion-ease-emphasized); }
.app-toast[data-state="closed"] { animation: toast-out var(--motion-duration-fast) var(--motion-ease-exit) forwards; }
.app-toast[data-swipe="move"] { transform: translateX(var(--reka-toast-swipe-move-x)); }
.app-toast[data-swipe="cancel"] { transform: translateX(0); transition: transform var(--motion-duration-fast) var(--motion-ease-standard); }
.app-toast[data-swipe="end"] { animation: toast-swipe-out var(--motion-duration-fast) var(--motion-ease-exit) forwards; }
@keyframes toast-in { from { opacity: 0; transform: translateY(12px); } }
@keyframes toast-out { to { opacity: 0; transform: translateY(8px); } }
@keyframes toast-swipe-out { from { transform: translateX(var(--reka-toast-swipe-end-x)); } to { transform: translateX(110%); } }
.app-toast-icon { display: grid; place-items: center; width: 38px; height: 38px; overflow: hidden; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
.app-toast-icon img { width: 100%; height: 100%; object-fit: cover; }
.app-toast-icon svg { width: 17px; }
.app-toast-copy { display: grid; gap: var(--space-1); min-width: 0; }
.app-toast-copy strong { font-size: var(--fs-sm); }
.app-toast-copy p { overflow: hidden; margin: 0; color: var(--muted); font-size: var(--fs-xs); line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.app-toast-action { justify-self: start; margin-top: 4px; padding: 5px 10px; border: 0; border-radius: var(--radius-sm); color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); font-size: var(--fs-xs); font-weight: 700; }
.app-toast-action:hover { background: color-mix(in srgb, var(--accent) 22%, transparent); }
.app-toast-close { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--muted); cursor: pointer; }
.app-toast-close svg { width: 15px; }
.app-toast-close:hover { color: var(--text); }
@include bp.until(tablet) {
  .app-toast-viewport { right: max(14px, var(--safe-right)); bottom: calc(var(--app-shell-offset-bottom) + 14px); }
  :root:has(.app-topbar) .app-toast-viewport { bottom: calc(var(--app-shell-offset-bottom) + var(--app-topbar-h) + 22px); }
  .app-toast { padding: 10px; }
}
@media (prefers-reduced-motion: reduce) { .app-toast { animation: none !important; } }
</style>
