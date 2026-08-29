<!--
  Sous-navigation d'espace sur mobile : la barre du bas etant desormais stable (voir
  MobileTabBar), c'est ici que vit le contexte -- les sections de Decouvrir, les
  instances *arr, les groupes de reglages...

  Rendue comme une rangee de pilules a defilement horizontal, placee au-dessus du
  contenu. Le conteneur est focalisable (tabindex) et annonce comme region, sinon les
  pilules qui depassent seraient hors d'atteinte au clavier.
-->
<template>
  <nav
    v-if="hasItems"
    class="space-subnav mobile-only"
    tabindex="0"
    role="region"
    :aria-label="`${ariaLabel}, défilement horizontal`"
  >
    <slot />
  </nav>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue';

withDefaults(defineProps<{ ariaLabel?: string }>(), { ariaLabel: 'Navigation de section' });

const slots = useSlots();
const hasItems = computed(() => Boolean(slots.default));
</script>

<style scoped lang="scss">
.space-subnav {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2) max(var(--space-3), var(--safe-left)) var(--space-2) max(var(--space-3), var(--safe-right));
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  border-bottom: 1px solid var(--border);
  background: var(--surface-sunken);
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.space-subnav::-webkit-scrollbar { display: none; }

.space-subnav :deep(a) {
  display: inline-flex;
  flex: 0 0 auto;
  gap: var(--space-2);
  align-items: center;
  min-height: 38px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.space-subnav :deep(a svg) { width: 15px; height: 15px; }

.space-subnav :deep(a.active),
.space-subnav :deep(a.router-link-active) {
  color: #151515;
  background: var(--accent);
}

@media (forced-colors: active) {
  .space-subnav :deep(a.active),
  .space-subnav :deep(a.router-link-active) { forced-color-adjust: none; color: HighlightText; background: Highlight; }
}
</style>
