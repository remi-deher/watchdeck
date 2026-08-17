<template>
  <component
    :is="rootComponent"
    class="ui-button"
    :class="[`ui-button--${variant}`, `ui-button--${size}`, { 'is-loading': loading, 'is-icon-only': iconOnly }]"
    :type="isButton ? type : undefined"
    :disabled="isButton ? unavailable : undefined"
    :to="to || undefined"
    :href="href || undefined"
    :target="target || undefined"
    :rel="rel || undefined"
    :aria-busy="loading || undefined"
    :aria-disabled="!isButton && unavailable ? 'true' : undefined"
    :tabindex="!isButton && unavailable ? -1 : undefined"
    v-bind="$attrs"
    @click="handleClick"
  >
    <LoaderCircle v-if="loading" class="ui-button-spinner" aria-hidden="true" />
    <template v-else-if="iconOnly"><slot /></template>
    <template v-else>
      <slot name="icon" />
    </template>
    <span v-if="!iconOnly" class="ui-button-label"><slot /></span>
    <slot v-if="!loading" name="trailing" />
  </component>
</template>

<script setup lang="ts">
import { computed, resolveComponent } from 'vue';
import { LoaderCircle } from '@lucide/vue';
import type { RouteLocationRaw } from 'vue-router';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    iconOnly?: boolean;
    to?: RouteLocationRaw | null;
    href?: string;
    target?: string;
    rel?: string;
  }>(),
  {
    variant: 'secondary', size: 'md', type: 'button', disabled: false, loading: false, iconOnly: false,
    to: null, href: '', target: '', rel: '',
  }
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();
const isButton = computed(() => !props.to && !props.href);
const unavailable = computed(() => props.disabled || props.loading);
const rootComponent = computed(() => props.to ? resolveComponent('RouterLink') : props.href ? 'a' : 'button');

function handleClick(event: MouseEvent) {
  if (unavailable.value) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  emit('click', event);
}
</script>

<style scoped lang="scss">
.ui-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); min-height: 40px; padding: 0 14px; border: 1px solid transparent; border-radius: var(--btn-radius); font: inherit; font-size: var(--fs-sm); font-weight: 700; line-height: 1; text-decoration: none; white-space: nowrap; cursor: pointer; transition: background-color .18s ease, border-color .18s ease, color .18s ease, transform .18s ease; }
.ui-button--sm { min-height: 36px; padding-inline: 11px; }
.ui-button--primary { border-color: var(--accent); background: var(--accent); color: #151515; }
.ui-button--secondary { border-color: var(--border); background: var(--surface-2); color: var(--text); }
.ui-button--ghost { border-color: transparent; background: transparent; color: var(--muted); }
.ui-button--danger { border-color: rgba(239,68,68,.38); background: rgba(239,68,68,.1); color: var(--red-text); }
.ui-button--primary:hover:not(:disabled):not([aria-disabled="true"]) { background: color-mix(in srgb, var(--accent) 88%, white); }
.ui-button--secondary:hover:not(:disabled):not([aria-disabled="true"]),.ui-button--ghost:hover:not(:disabled):not([aria-disabled="true"]) { border-color: color-mix(in srgb, var(--border) 65%, white); background: var(--surface-3); color: var(--text); }
.ui-button--danger:hover:not(:disabled):not([aria-disabled="true"]) { border-color: rgba(239,68,68,.58); background: rgba(239,68,68,.17); }
.ui-button-label { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); }
.ui-button:active:not(:disabled) { transform: translateY(1px); }
.ui-button:disabled,.ui-button[aria-disabled="true"] { cursor: not-allowed; opacity: .55; }
.ui-button.is-icon-only { width: 40px; padding: 0; }
.ui-button--sm.is-icon-only { width: 36px; }
.ui-button :deep(svg) { width: 17px; height: 17px; flex: none; }
.ui-button-spinner { animation: ui-button-spin 1s linear infinite; }
@keyframes ui-button-spin { to { transform: rotate(360deg); } }
@media (pointer: coarse) { .ui-button { min-height: 44px; } .ui-button.is-icon-only { width: 44px; } }
</style>
