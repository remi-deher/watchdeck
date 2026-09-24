<template>
  <DefineButton>
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
      v-bind="attributs"
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
  </DefineButton>
  <!-- Bouton-icone : son nom s'affiche dans une infobulle Reka UI, au survol comme au
       focus clavier -- l'attribut `title` natif n'apparaissait qu'a la souris, apres un long
       delai, et jamais au clavier. Le nom accessible reste porte par `aria-label`. -->
  <TooltipProvider v-if="infobulle" :delay-duration="350">
    <TooltipRoot>
      <TooltipTrigger as-child><ReuseButton /></TooltipTrigger>
      <TooltipPortal>
        <TooltipContent class="ui-tooltip" side="top" :side-offset="6">{{ infobulle }}</TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
  <ReuseButton v-else />
</template>

<script setup lang="ts">
import { computed, resolveComponent, useAttrs } from 'vue';
import { createReusableTemplate } from '@vueuse/core';
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui';
import { LoaderCircle } from '@lucide/vue';
import type { RouteLocationRaw } from 'vue-router';

defineOptions({ inheritAttrs: false });

const [DefineButton, ReuseButton] = createReusableTemplate();
const attrs = useAttrs();

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

/* L'infobulle ne concerne que les boutons-icones, dont le nom ne se lit pas a l'ecran. */
const infobulle = computed(() => (props.iconOnly ? String(attrs.title || attrs['aria-label'] || '') : ''));
// Sans `title` natif quand l'infobulle le remplace : deux bulles se superposeraient.
const attributs = computed(() => {
  if (!infobulle.value) return attrs;
  const { title, ...reste } = attrs as Record<string, unknown>;
  // Le titre servait parfois de seul nom accessible : il passe alors dans aria-label.
  return { ...reste, 'aria-label': reste['aria-label'] ?? title };
});
</script>

<style scoped lang="scss">
.ui-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); min-height: 40px; padding: 0 14px; border: 1px solid transparent; border-radius: var(--btn-radius); font: inherit; font-size: var(--fs-sm); font-weight: 700; line-height: 1; text-decoration: none; white-space: nowrap; cursor: pointer; transition: background-color var(--motion-duration-fast) var(--motion-ease-standard), border-color var(--motion-duration-fast) var(--motion-ease-standard), color var(--motion-duration-fast) var(--motion-ease-standard), transform var(--motion-duration-fast) var(--motion-ease-standard); }
.ui-button--sm { min-height: 36px; padding-inline: 11px; }
.ui-button--primary { border-color: var(--accent); background: var(--accent); color: #151515; }
.ui-button--secondary { border-color: var(--border); background: var(--surface-2); color: var(--text); }
.ui-button--ghost { border-color: transparent; background: transparent; color: var(--muted); }
.ui-button--danger { border-color: rgba(239,68,68,.38); background: rgba(239,68,68,.1); color: var(--red-text); }
.ui-button--primary:hover:not(:disabled):not([aria-disabled="true"]) { background: color-mix(in srgb, var(--accent) 88%, white); }
.ui-button--secondary:hover:not(:disabled):not([aria-disabled="true"]),.ui-button--ghost:hover:not(:disabled):not([aria-disabled="true"]) { border-color: color-mix(in srgb, var(--border) 65%, white); background: var(--surface-3); color: var(--text); }
.ui-button--danger:hover:not(:disabled):not([aria-disabled="true"]) { border-color: rgba(239,68,68,.58); background: rgba(239,68,68,.17); }
.ui-button-label { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); color: inherit; }
.ui-button:active:not(:disabled) { transform: translateY(1px); }
.ui-button:disabled,.ui-button[aria-disabled="true"] { cursor: not-allowed; opacity: .55; }
.ui-button.is-icon-only { width: 40px; padding: 0; }
.ui-button--sm.is-icon-only { width: 36px; }
.ui-button :deep(svg) { width: 17px; height: 17px; flex: none; }
.ui-button-spinner { animation: ui-button-spin 1s linear infinite; }
@keyframes ui-button-spin { to { transform: rotate(360deg); } }
@media (pointer: coarse) { .ui-button { min-height: 44px; } .ui-button.is-icon-only { width: 44px; } }
</style>
