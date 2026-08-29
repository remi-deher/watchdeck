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

  <nav v-if="hasMobileBar" class="mobile-nav-bar mobile-only space-mobile-nav" :aria-label="ariaLabel">
    <RouterLink v-for="item in mobileItems" :key="item.key" v-bind="linkBindings(item)">
      <component :is="item.icon" v-if="item.icon" /><span>{{ item.mobileLabel || item.label }}</span>
    </RouterLink>
    <slot name="mobile-nav" />
    <button type="button" class="more-nav-btn" :class="{ active: isMoreOpen }" aria-label="Ouvrir les options supplémentaires" :aria-controls="moreSheetId" :aria-expanded="isMoreOpen" @click="toggleMoreMenu">
      <MoreHorizontal /><span>Plus</span>
    </button>
  </nav>

  <MobileMoreSheet v-if="hasMobileBar" :open="isMoreOpen" :sheet-id="moreSheetId" :title="mobileMenuTitle" @close="closeMoreMenu">
          <div v-for="(group, index) in moreGroups" :key="group.label || `more-${index}`" class="menu-section">
            <span v-if="group.label" class="menu-label">{{ group.label }}</span>
            <RouterLink v-for="item in group.items" :key="item.key" v-bind="linkBindings(item)" @click="closeMoreMenu">
              <component :is="item.icon" v-if="item.icon" />{{ item.label }}
            </RouterLink>
          </div>
          <slot name="mobile-more-extra" />
          <div class="menu-section">
            <span class="menu-label">Compte</span>
            <RouterLink to="/profile" @click="closeMoreMenu"><UserRound />Profil</RouterLink>
            <RouterLink v-if="showAppLink" :to="resolvedAppLink" @click="closeMoreMenu"><component :is="appLinkIcon || Compass" />{{ appLinkLabel }}</RouterLink>
            <a href="/logout" @click="clearCache"><LogOut />Déconnexion</a>
          </div>
  </MobileMoreSheet>
</template>

<script setup lang="ts">
import { computed, ref, useSlots, watch } from 'vue';
import type { Component } from 'vue';
import { useRoute } from 'vue-router';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { Compass, LogOut, MoreHorizontal, PanelLeftClose, PanelLeftOpen, UserRound } from '@lucide/vue';
import { clearCache } from '@/cache';
import MobileMoreSheet from '@/components/layout/MobileMoreSheet.vue';

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
    appLinkTo?: string | null;
    isAdmin?: boolean;
    showAppLink?: boolean;
    appLinkLabel?: string;
    appLinkIcon?: Component | null;
    mobileMenuTitle?: string;
    nav?: NavSection[];
  }>(),
  {
    collapsed: false,
    appLinkTo: null,
    isAdmin: false,
    showAppLink: true,
    appLinkLabel: 'Application principale',
    appLinkIcon: null,
    mobileMenuTitle: 'Menu',
    nav: () => [],
  }
);
defineEmits<{ (e: 'toggle'): void }>();

const resolvedAppLink = computed(() => props.appLinkTo || (props.isAdmin ? '/dashboard' : '/discover'));

const route = useRoute();
const slots = useSlots();
const isMoreOpen = ref(false);
const moreSheetId = computed(() => `${props.slug}-mobile-more`);

const visibleSections = computed(() =>
  props.nav
    .map((section) => ({ ...section, items: section.items.filter((item) => !item.admin || props.isAdmin) }))
    .filter((section) => section.items.length)
);

const allItems = computed(() => visibleSections.value.flatMap((section) => section.items));
const mobileItems = computed(() => allItems.value.filter((item) => item.mobile));
const hasMobileBar = computed(() => Boolean(mobileItems.value.length || slots['mobile-nav']));

const moreGroups = computed(() =>
  visibleSections.value
    .map((section) => ({ label: section.moreLabel || '', items: section.items.filter((item) => item.more) }))
    .filter((group) => group.items.length)
);

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

function toggleMoreMenu(): void { isMoreOpen.value = !isMoreOpen.value; }
function closeMoreMenu(): void { isMoreOpen.value = false; }

watch(() => route.fullPath, closeMoreMenu);
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
