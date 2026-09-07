<template>
  <nav class="app-primary-nav" :class="`app-primary-nav--${orientation}`" aria-label="Navigation principale">
    <RouterLink v-if="orientation === 'top'" class="app-nav-brand" to="/" aria-label="Watchdeck">
      <component :is="current?.icon || Clapperboard" aria-hidden="true" /><span>{{ pageTitle }}</span>
    </RouterLink>
    <ul class="app-primary-items">
      <li v-for="destination in visibleDestinations" :key="destination.key" class="app-primary-item"
        :class="{ 'has-subnav': destinationSections(destination.key).length > 1, 'subnav-open': subnavOpenKey === destination.key }"
        @mouseenter="openSubnav(destination.key)" @mouseleave="scheduleSubnavClose"
        @focusin="openSubnav(destination.key)" @focusout="onSubnavFocusOut">
        <RouterLink :to="destination.to" class="app-primary-link" :class="{ active: isPrimaryActive(destination) }"
          :aria-current="isPrimaryActive(destination) ? 'page' : undefined" :title="destination.label"
          :aria-haspopup="destinationSections(destination.key).length > 1 ? 'menu' : undefined"
          :aria-expanded="destinationSections(destination.key).length > 1 ? subnavOpenKey === destination.key : undefined"
          @click="onPrimaryClick($event, destination)">
          <component :is="destination.icon" aria-hidden="true" /><span>{{ destinationDisplayLabel(destination) }}</span>
          <ChevronDown v-if="destinationSections(destination.key).length > 1" class="app-primary-subnav-caret" aria-hidden="true" />
        </RouterLink>
        <div v-if="subnavOpenKey === destination.key && destinationSections(destination.key).length > 1"
          class="app-primary-subnav" role="menu" :aria-label="`Sous-sections ${destination.label}`">
          <RouterLink v-for="section in destinationSections(destination.key)" :key="section.key" :to="section.to" role="menuitem"
            :class="{ active: destination.key === activeDestinationKey && section.key === activeSection }"
            :aria-current="destination.key === activeDestinationKey && section.key === activeSection ? 'page' : undefined">
            <component :is="section.icon" v-if="section.icon" aria-hidden="true" /><span>{{ section.label }}</span>
          </RouterLink>
        </div>
      </li>
    </ul>
    <div class="app-primary-footer">
      <button type="button" class="app-primary-link app-nav-burger"
        :class="{ active: menuOpen || activeDestinationInOverflow }" :aria-expanded="menuOpen"
        aria-haspopup="dialog" aria-label="Ouvrir le menu complet" title="Plus" @click="toggleMenu">
        <Menu aria-hidden="true" /><span>Plus</span>
      </button>
    </div>
  </nav>

  <button v-if="touchSubnavOpen" type="button" class="app-subnav-dismiss"
    aria-label="Fermer les sous-sections" @click="closeSubnav" />

  <Teleport to="body">
    <div v-if="menuOpen" class="app-nav-scrim" @click="closeMenu" />
    <div v-if="menuOpen" ref="menuRef" class="app-nav-menu" :class="`app-nav-menu--${orientation}`" role="dialog"
      aria-modal="true" aria-label="Navigation complète et compte" tabindex="-1">
      <header class="app-nav-menu-head">
        <div><small>Watchdeck</small><strong>Navigation</strong></div>
        <button type="button" class="app-nav-menu-close" aria-label="Fermer le menu" @click="closeMenu"><X /></button>
      </header>
      <div class="app-nav-menu-body">
        <details v-for="group in destinationGroups" :key="group.label" class="app-nav-menu-category"
          :open="group.items.some((item) => item.key === activeDestinationKey)">
          <summary><span>{{ group.label }}</span><ChevronDown aria-hidden="true" /></summary>
          <div class="app-nav-menu-category-items">
            <RouterLink v-for="destination in group.items" :key="destination.key" :to="destination.to" class="app-nav-menu-link"
              :class="{ active: destination.key === activeDestinationKey }"
              :aria-current="destination.key === activeDestinationKey ? 'page' : undefined"
              @click="onMenuNavigate(destination.key === activeDestinationKey)">
              <component :is="destination.icon" aria-hidden="true" /><span>{{ destination.label }}</span>
            </RouterLink>
          </div>
        </details>
        <details class="app-nav-menu-category">
          <summary><span>Compte et outils</span><ChevronDown aria-hidden="true" /></summary>
          <div class="app-nav-menu-category-items">
            <button type="button" class="app-nav-menu-link" @click="openPalette"><Search aria-hidden="true" /><span>Recherche globale</span><kbd>{{ shortcutLabel }}</kbd></button>
            <RouterLink to="/profile" class="app-nav-menu-link" @click="onMenuNavigate(false)"><UserRound aria-hidden="true" /><span>Profil</span></RouterLink>
            <a href="/privacy" class="app-nav-menu-link"><ShieldCheck aria-hidden="true" /><span>Confidentialité</span></a>
            <a href="/logout" class="app-nav-menu-link" @click="clearCache"><LogOut aria-hidden="true" /><span>Déconnexion</span></a>
          </div>
        </details>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { CalendarDays, ChevronDown, Clapperboard, Film, Inbox, Languages, LogOut, Menu, Search, ShieldCheck, Tv, UserRound, X } from '@lucide/vue';
import { clearCache } from '@/cache';
import { useModalA11y } from '@/composables/useModalA11y';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';
import { activeSectionKey, destinationForPath, destinationsFor, libraryTypeFilters, sectionsFor, type NavDestination } from '@/navigation';

const props = withDefaults(defineProps<{ orientation: 'top' | 'bar'; isAdmin?: boolean; canModerate?: boolean }>(), {
  isAdmin: false, canModerate: false,
});
const emit = defineEmits<{ (e: 'open-palette'): void }>();
const MOBILE_DESTINATION_KEYS = ['dashboard', 'discover', 'downloads', 'library'];
type PrimaryDestination = NavDestination & { contextualActive?: () => boolean };
const route = useRoute();
const menuOpen = ref(false);
const subnavOpenKey = ref('');
const touchSubnavOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);
let subnavCloseTimer: ReturnType<typeof setTimeout> | null = null;
const shortcutLabel = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl+K';
const destinations = computed(() => destinationsFor(props.isAdmin, props.canModerate));
const current = computed<NavDestination | null>(() => destinationForPath(route.path, props.isAdmin, props.canModerate));
const activeDestinationKey = computed(() => current.value?.key || '');
const pageTitle = computed(() => typeof route.meta?.title === 'string' ? route.meta.title : (current.value?.label || 'Watchdeck'));
const contextualDestinations = computed<PrimaryDestination[]>(() => {
  const destination = activeDestinationKey.value;
  if (destination === 'discover' || destination === 'requests') {
    return [
      contextualDestination('discover-movies', 'Films', '/discover/movies', Film, () => route.path.startsWith('/discover/movies')),
      contextualDestination('discover-shows', 'Séries', '/discover/shows', Tv, () => route.path.startsWith('/discover/shows')),
      contextualDestination('discover-requests', 'Demandes', '/discover/requests', Inbox,
        () => route.path.startsWith('/discover/requests') || route.path.startsWith('/releases/')),
      contextualDestination('discover-calendar', 'Calendrier', '/calendar', CalendarDays, () => route.path.startsWith('/calendar')),
    ];
  }
  if (destination === 'library') {
    const items = [
      contextualDestination('library-movies', 'Films', { path: '/library', query: { hub: '1', type: 'movie' } }, Film,
        () => route.path.startsWith('/library/media/movie') || (route.path === '/library' && libraryTypeFilters(route as any).includes('movie'))),
      contextualDestination('library-shows', 'Séries', { path: '/library', query: { hub: '1', type: 'show' } }, Tv,
        () => route.path.startsWith('/library/media/show') || (route.path === '/library' && libraryTypeFilters(route as any).includes('show'))),
    ];
    if (props.isAdmin) items.push(contextualDestination('library-vf', 'VF', '/vf-upgrades', Languages,
      () => route.path.startsWith('/vf-upgrades')));
    return items;
  }
  return [];
});
const visibleDestinations = computed<PrimaryDestination[]>(() => {
  if (contextualDestinations.value.length) return contextualDestinations.value;
  if (props.orientation === 'top') return destinations.value.filter((item) => item.key !== 'admin');
  const preferred = MOBILE_DESTINATION_KEYS.map((key) => destinations.value.find((item) => item.key === key))
    .filter((item): item is NavDestination => Boolean(item));
  return preferred.length ? preferred.slice(0, 4) : destinations.value.slice(0, 4);
});
const activeDestinationInOverflow = computed(() => !contextualDestinations.value.length && Boolean(activeDestinationKey.value)
  && !visibleDestinations.value.some((item) => item.key === activeDestinationKey.value));
const navContext = computed(() => ({ isAdmin: props.isAdmin, canModerate: props.canModerate, arrInstances: [], downloadClients: [] }));
const sections = computed(() => activeDestinationKey.value ? sectionsFor(activeDestinationKey.value, navContext.value) : []);
const activeSection = computed(() => activeSectionKey(sections.value, route as any));
const destinationGroups = computed(() => {
  const groups: Array<{ label: string; items: NavDestination[] }> = [];
  for (const destination of destinations.value) {
    const existing = groups.find((group) => group.label === destination.group);
    if (existing) existing.items.push(destination); else groups.push({ label: destination.group, items: [destination] });
  }
  return groups;
});

function destinationSections(key: string) { return sectionsFor(key, navContext.value); }
function contextualDestination(key: string, label: string, to: string | Record<string, any>, icon: any,
  contextualActive: () => boolean): PrimaryDestination {
  return { key, label, to, icon, group: 'Contexte', match: () => false, contextualActive };
}
function isPrimaryActive(destination: PrimaryDestination): boolean {
  return destination.contextualActive?.() ?? destination.key === activeDestinationKey.value;
}
function destinationDisplayLabel(destination: NavDestination): string {
  if (props.orientation !== 'bar') return destination.label;
  return ({ library: 'Médias' } as Record<string, string>)[destination.key] || destination.label;
}
function openSubnav(key: string, touch = false): void {
  if (subnavCloseTimer) clearTimeout(subnavCloseTimer);
  if (destinationSections(key).length < 2) return;
  subnavOpenKey.value = key;
  touchSubnavOpen.value = touch;
}
function closeSubnav(): void {
  if (subnavCloseTimer) clearTimeout(subnavCloseTimer);
  subnavOpenKey.value = '';
  touchSubnavOpen.value = false;
}
function scheduleSubnavClose(): void {
  if (touchSubnavOpen.value) return;
  if (subnavCloseTimer) clearTimeout(subnavCloseTimer);
  subnavCloseTimer = setTimeout(closeSubnav, 140);
}
function onSubnavFocusOut(event: FocusEvent): void {
  const item = event.currentTarget as HTMLElement;
  requestAnimationFrame(() => { if (!item.contains(document.activeElement)) scheduleSubnavClose(); });
}
function onPrimaryClick(event: MouseEvent, destination: NavDestination): void {
  const pointerType = (event as PointerEvent).pointerType;
  if (pointerType && pointerType !== 'mouse' && destinationSections(destination.key).length > 1
    && subnavOpenKey.value !== destination.key) {
    event.preventDefault();
    openSubnav(destination.key, true);
  }
}

function toggleMenu(): void { menuOpen.value = !menuOpen.value; closeSubnav(); }
function closeMenu(): void { menuOpen.value = false; }
function onMenuNavigate(isCurrent: boolean): void { if (isCurrent) closeMenu(); }
function openPalette(): void {
  if (!menuOpen.value) return emit('open-palette');
  const open = () => emit('open-palette');
  const timer = setTimeout(open, 120);
  window.addEventListener('popstate', () => { clearTimeout(timer); setTimeout(open, 0); }, { once: true });
  closeMenu();
}
watch(() => route.fullPath, () => { closeMenu(); closeSubnav(); });
useBodyScrollLock(menuOpen);
useModalA11y(menuRef, menuOpen, closeMenu);
</script>

<style scoped lang="scss">
.app-primary-nav{z-index:50;border:1px solid color-mix(in srgb,var(--border) 88%,white 6%);background:color-mix(in srgb,var(--surface) 96%,transparent);box-shadow:0 10px 30px rgba(0,0,0,.3),inset 0 1px rgba(255,255,255,.04);backdrop-filter:blur(18px) saturate(1.1);-webkit-backdrop-filter:blur(18px) saturate(1.1)}
.app-primary-items{display:flex;min-width:0;margin:0;padding:0;list-style:none}.app-primary-item{position:relative;min-width:0}
.app-primary-link{position:relative;display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 10px;border:0;border-radius:var(--radius-md);background:transparent;color:var(--muted);font:inherit;font-size:var(--fs-sm);font-weight:650;text-decoration:none;white-space:nowrap;cursor:pointer;transition:color .15s ease,background-color .15s ease}.app-primary-link svg{flex:none;width:19px;height:19px}.app-primary-link:hover{color:var(--text);background:var(--surface-2)}.app-primary-link.active{color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}
.app-primary-nav--top{position:fixed;top:var(--safe-top);right:var(--safe-right);left:var(--safe-left);display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;height:64px;padding:4px 12px;border-radius:0 0 18px 18px}.app-nav-brand{display:flex;align-items:center;gap:9px;min-height:46px;padding:0 4px;border-radius:var(--radius-md);color:var(--text);font-weight:780;text-decoration:none}.app-nav-brand svg{width:22px;height:22px;padding:4px;border-radius:9px;background:var(--accent-gradient);color:#151515;box-sizing:content-box}.app-primary-nav--top .app-primary-items{justify-content:center}.app-primary-footer{display:flex}
.app-primary-subnav-caret{width:13px!important;height:13px!important;margin-left:-3px;transition:transform .16s ease}.subnav-open .app-primary-subnav-caret{transform:rotate(180deg)}.app-primary-subnav{position:absolute;top:calc(100% + 9px);left:50%;z-index:52;display:grid;gap:3px;width:max-content;min-width:210px;max-width:min(300px,calc(100vw - 24px));padding:7px;transform:translateX(-50%);border:1px solid var(--border);border-radius:var(--radius-lg);background:color-mix(in srgb,var(--surface) 96%,transparent);box-shadow:0 18px 46px rgba(0,0,0,.46);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}.app-primary-subnav a{display:flex;align-items:center;gap:10px;min-height:42px;padding:0 11px;border-radius:var(--radius-sm);color:var(--muted);font-size:var(--fs-sm);text-decoration:none}.app-primary-subnav a:hover,.app-primary-subnav a:focus-visible{color:var(--text);background:var(--surface-2);outline:0}.app-primary-subnav a.active{color:var(--accent);background:color-mix(in srgb,var(--accent) 13%,transparent)}.app-primary-subnav svg{flex:none;width:17px;height:17px}.app-subnav-dismiss{position:fixed;inset:0;z-index:49;border:0;background:transparent}
.app-nav-menu-link kbd{padding:2px 6px;border:1px solid var(--border);border-radius:var(--radius-xs);color:var(--muted);font-family:inherit;font-size:var(--fs-xs)}
.app-primary-nav--bar{position:fixed;right:max(10px,var(--safe-right));bottom:max(10px,var(--safe-bottom));left:max(10px,var(--safe-left));display:flex;align-items:stretch;height:var(--mobile-nav-h);padding:4px;border-radius:22px;overscroll-behavior:none;touch-action:manipulation}.app-primary-nav--bar .app-primary-items{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));flex:1;width:100%;overflow:visible}.app-primary-nav--bar .app-primary-item{width:100%;min-width:0}.app-primary-nav--bar .app-primary-link{flex-direction:column;gap:2px;width:100%;min-width:0;height:100%;padding:4px 1px;border-radius:17px;font-size:11px}.app-primary-nav--bar .app-primary-link span{width:100%;overflow:hidden;text-overflow:ellipsis;text-align:center}.app-primary-nav--bar .app-primary-subnav-caret{position:absolute;top:4px;right:calc(50% - 18px);width:10px!important;height:10px!important}.app-primary-nav--bar .app-primary-subnav{position:fixed;top:auto;right:max(10px,var(--safe-right));bottom:calc(var(--mobile-nav-h) + max(20px,var(--safe-bottom)));left:max(10px,var(--safe-left));width:auto;min-width:0;max-width:none;max-height:min(55dvh,420px);overflow-y:auto;transform:none;border-radius:22px}.app-primary-nav--bar .app-primary-footer{flex:none;width:60px;min-width:60px}
.app-nav-scrim{position:fixed;inset:0;z-index:60;background:rgba(9,9,11,.62);backdrop-filter:blur(6px)}.app-nav-menu{position:fixed;z-index:61;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--surface);box-shadow:0 18px 50px rgba(0,0,0,.45)}.app-nav-menu--top{top:82px;right:max(12px,var(--safe-right));width:min(340px,calc(100vw - 24px));max-height:calc(100dvh - 94px)}.app-nav-menu--bar{right:max(10px,var(--safe-right));bottom:calc(var(--mobile-nav-h) + max(20px,var(--safe-bottom)));left:max(10px,var(--safe-left));max-height:calc(100dvh - var(--mobile-nav-h) - var(--safe-bottom) - var(--safe-top) - 34px);border-radius:24px}.app-nav-menu-head{display:flex;flex:none;align-items:center;justify-content:space-between;gap:var(--space-3);padding:12px 14px;border-bottom:1px solid var(--border)}.app-nav-menu-head>div{display:grid;gap:2px}.app-nav-menu-head small{color:var(--accent);font-size:10px;font-weight:750;text-transform:uppercase;letter-spacing:.08em}.app-nav-menu-close{display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--muted);cursor:pointer}.app-nav-menu-close:hover,.app-nav-menu-link:hover{color:var(--text);background:var(--surface-2)}.app-nav-menu-close svg{width:17px}.app-nav-menu-body{display:grid;gap:2px;padding:8px;overflow-y:auto;overscroll-behavior:contain}
.app-nav-menu-category{border-bottom:1px solid color-mix(in srgb,var(--border) 72%,transparent)}.app-nav-menu-category:last-child{border:0}.app-nav-menu-category summary{display:flex;align-items:center;justify-content:space-between;min-height:42px;padding:0 10px;border-radius:var(--radius-sm);color:var(--muted);font-size:var(--fs-xs);font-weight:750;text-transform:uppercase;letter-spacing:.045em;cursor:pointer;list-style:none}.app-nav-menu-category summary::-webkit-details-marker{display:none}.app-nav-menu-category summary svg{width:16px;transition:transform .18s ease}.app-nav-menu-category[open] summary svg{transform:rotate(180deg)}.app-nav-menu-category-items{display:grid;gap:2px;padding-bottom:7px}.app-nav-menu-link{display:flex;align-items:center;gap:var(--space-3);width:100%;min-height:42px;padding:0 10px;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--text);font:inherit;font-size:var(--fs-sm);text-align:left;text-decoration:none;cursor:pointer}.app-nav-menu-link svg{flex:none;width:16px;color:var(--muted)}.app-nav-menu-link span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.app-nav-menu-link.active{color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}
@media (min-width:900px) and (max-width:1199.98px){.app-primary-nav--top{grid-template-columns:auto minmax(0,1fr) auto}.app-primary-nav--top .app-primary-link{width:46px;padding:0}.app-primary-nav--top .app-primary-link span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.app-primary-nav--top .app-primary-subnav-caret{position:absolute;right:2px;bottom:3px}}
@media (prefers-reduced-motion:reduce){.app-nav-menu-category summary svg,.app-primary-subnav-caret{transition:none}}@media (forced-colors:active){.app-primary-link.active,.app-primary-subnav a.active,.app-nav-menu-link.active{forced-color-adjust:none;color:HighlightText;background:Highlight}}
</style>
