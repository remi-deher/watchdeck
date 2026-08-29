<!--
  Squelette commun aux sidebars "d'espace" (Decouvrir, Bibliotheque, Administration,
  Activite & Insights, Parametres, Telechargements) : chacune remplace la sidebar
  principale de App.vue quand la route courante entre dans son perimetre (voir
  spaces.js). Marque, bouton collapse, popover "Plus" (Profil / Application principale /
  Deconnexion) et gestion mobile (barre + feuille "Plus") sont identiques et vivent ici.

  Les entrees de navigation se declarent en donnees via le prop `nav` : ce composant rend
  alors les trois surfaces (sidebar desktop, barre mobile, feuille "Plus") depuis la meme
  liste, la ou chaque *Navigation.vue retapait ses liens deux a trois fois. Les espaces
  dont l'arbre est dynamique (Telechargements et ses instances *arr, Parametres et ses
  deux modes) gardent les slots et n'utilisent pas `nav`.
-->
<template>
  <aside class="sidebar space-sidebar desktop-only" :class="{ collapsed }" :aria-label="ariaLabel" :aria-expanded="!collapsed">
    <div class="brand space-brand">
      <span class="brand-mark"><component :is="brandIcon" /></span>
      <span><strong>Watchdeck</strong></span>
      <button class="sidebar-toggle" type="button" :aria-label="collapsed ? 'Afficher le menu' : 'Réduire le menu'" :title="collapsed ? 'Afficher le menu' : 'Réduire le menu'" @click="$emit('toggle')">
        <PanelLeftOpen v-if="collapsed"/><PanelLeftClose v-else/>
      </button>
    </div>

    <div
      v-for="(section, index) in visibleSections"
      :key="section.label || `section-${index}`"
      class="menu-section"
      :class="[section.className, { 'space-primary-nav': section.primary }]"
    >
      <span v-if="section.label" class="menu-label">{{ section.label }}</span>
      <RouterLink
        v-for="item in section.items"
        :key="item.key"
        v-bind="linkBindings(item)"
        :title="item.label"
      >
        <component :is="item.icon" v-if="item.icon" />{{ item.label }}
      </RouterLink>
    </div>

    <slot name="primary-nav" />

  </aside>

  <!-- Contexte de l'espace : la barre du bas est desormais globale et stable. -->
  <SpaceSubnav v-if="hasMobileBar" :aria-label="ariaLabel">
    <RouterLink v-for="item in subnavItems" :key="item.key" v-bind="linkBindings(item)">
      <component :is="item.icon" v-if="item.icon" aria-hidden="true" />{{ item.mobileLabel || item.label }}
    </RouterLink>
    <slot name="mobile-nav" />
  </SpaceSubnav>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue';
import type { Component } from 'vue';
import { useRoute } from 'vue-router';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { PanelLeftClose, PanelLeftOpen } from '@lucide/vue';
import SpaceSubnav from '@/components/layout/SpaceSubnav.vue';

export interface NavItem {
  key: string;
  label: string;
  mobileLabel?: string;
  to: string | Record<string, any> | ((route?: RouteLocationNormalizedLoaded) => string | Record<string, any>);
  icon?: Component;
  mobile?: boolean;
  more?: boolean;
  admin?: boolean;
  exact?: boolean;
  active?: (route: RouteLocationNormalizedLoaded) => boolean;
}

export interface NavSection {
  label?: string;
  moreLabel?: string;
  className?: string;
  primary?: boolean;
  items: NavItem[];
}

const props = withDefaults(
  defineProps<{
    collapsed?: boolean;
    ariaLabel: string;
    brandIcon: Component;
    slug: string;
    isAdmin?: boolean;
    nav?: NavSection[];
  }>(),
  {
    collapsed: false,
    isAdmin: false,
    nav: () => [],
  }
);
defineEmits<{ (e: 'toggle'): void }>();


const route = useRoute();
const slots = useSlots();

const visibleSections = computed(() =>
  props.nav
    .map((section) => ({ ...section, items: section.items.filter((item) => !item.admin || props.isAdmin) }))
    .filter((section) => section.items.length)
);

const allItems = computed(() => visibleSections.value.flatMap((section) => section.items));
const hasMobileBar = computed(() => Boolean(subnavItems.value.length || slots['mobile-nav']));

// La sous-nav mobile porte tout le contexte de l'espace : les entrees jadis reparties
// entre la barre du bas (`mobile`) et la feuille « Plus » (`more`) y sont reunies.
const subnavItems = computed(() => allItems.value.filter((item) => item.mobile || item.more));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function linkBindings(item: NavItem): any {
  const to = typeof item.to === 'function' ? item.to(route) : item.to;
  if (item.active) {
    return {
      to,
      activeClass: '',
      exactActiveClass: '',
      class: { 'router-link-active': item.active(route) },
    };
  }
  if (item.exact) {
    return { to, activeClass: '', exactActiveClass: 'router-link-active' };
  }
  return { to };
}

</script>

<style scoped lang="scss">
.space-sidebar { background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 88%, #17110a), var(--surface)); }
/* Espacement sous la marque, commun aux 4 espaces -- la section marquee comme telle par
   l'appelant (voir chaque *Navigation.vue) recoit cette marge via ::slotted, la classe
   "space-primary-nav" etant purement un point d'accroche CSS partage. */
:slotted(.space-primary-nav), .space-primary-nav { margin-top: var(--space-2); }
.space-brand { align-items: center; }
.space-brand .sidebar-toggle { margin-left: auto; }
.space-brand > span:last-child { display: grid; line-height: 1.05; }
.space-brand strong { font-size: var(--fs-md); }
.brand-mark { display: grid; flex: none; place-items: center; width: 34px; height: 34px; border-radius: 10px; color: #111; background: var(--accent); box-shadow: 0 8px 24px rgba(229,160,13,.18); }
.brand-mark svg { width: 19px; }
.space-sidebar.collapsed .space-brand > span:not(.brand-mark),
.space-sidebar.collapsed .space-brand { justify-content: center; padding-inline: 0; }
.space-sidebar.collapsed .brand-mark { display: none; }
@media (min-width: 768px) and (max-width: 1024px) {
  .space-sidebar .brand-mark { margin: auto; }
}
</style>
