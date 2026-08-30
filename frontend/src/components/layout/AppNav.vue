<!--
  Navigation unique de l'application.

  La barre porte les **sections de l'espace courant**, pas les grandes zones : les
  utilisateurs passent l'essentiel de leur temps dans Découvrir, donc ce sont ses
  sections qui méritent l'emplacement à portée de pouce. Le bouton ☰ garde tout le reste
  — les autres espaces, les sections en surnombre, le compte — à un tap.

  Un seul jeu d'éléments, deux orientations :
    - `rail` (≥ 768px) : colonne verticale à gauche, menu ouvert sur la droite
    - `bar`  (< 768px) : barre en bas, menu ouvert vers le haut

  Zones mortes : chaque bord composite `env(safe-area-inset-*)` via les tokens --safe-*.
  La barre réserve sa hauteur *plus* l'inset bas (indicateur d'accueil), le rail décale
  son contenu de l'inset gauche (encoche en paysage), et le menu se cale à l'intérieur
  des mêmes marges.
-->
<template>
  <nav
    class="app-nav"
    :class="`app-nav--${orientation}`"
    aria-label="Navigation principale"
  >
    <RouterLink v-if="orientation === 'rail'" class="app-nav-brand" to="/" aria-label="Watchdeck — accueil">
      <Clapperboard aria-hidden="true" />
    </RouterLink>

    <ul class="app-nav-items">
      <li v-for="section in visibleSections" :key="section.key" class="app-nav-item">
        <RouterLink
          :to="section.to"
          class="app-nav-link"
          :class="{ active: section.key === activeSection }"
          :aria-current="section.key === activeSection ? 'page' : undefined"
          :title="section.label"
        >
          <component :is="section.icon" v-if="section.icon" aria-hidden="true" />
          <span :class="orientation === 'rail' ? 'sr-only' : 'app-nav-label'">{{ section.label }}</span>
        </RouterLink>
      </li>
    </ul>

    <div class="app-nav-footer">
      <button
        ref="triggerRef"
        type="button"
        class="app-nav-link app-nav-burger"
        :class="{ active: menuOpen }"
        :aria-expanded="menuOpen"
        aria-haspopup="dialog"
        :aria-label="`Espaces et compte — ${destinationLabel}`"
        :title="`Espaces et compte — ${destinationLabel}`"
        @click="toggleMenu"
      >
        <Menu aria-hidden="true" />
        <span :class="orientation === 'rail' ? 'sr-only' : 'app-nav-label'">Plus</span>
      </button>
    </div>
  </nav>

  <Teleport to="body">
    <div v-if="menuOpen" class="app-nav-scrim" @click="closeMenu" />
    <div
      v-if="menuOpen"
      ref="menuRef"
      class="app-nav-menu"
      :class="`app-nav-menu--${orientation}`"
      role="dialog"
      aria-modal="true"
      aria-label="Espaces et compte"
      tabindex="-1"
    >
      <header class="app-nav-menu-head">
        <strong>Aller à…</strong>
        <button type="button" class="app-nav-menu-close" aria-label="Fermer le menu" @click="closeMenu"><X /></button>
      </header>

      <div class="app-nav-menu-body">
        <!-- Sections en surnombre : sans elles, la barre les rendrait inatteignables. -->
        <template v-if="overflowSections.length">
          <span class="app-nav-menu-group">{{ destinationLabel }}</span>
          <RouterLink
            v-for="section in overflowSections"
            :key="`s-${section.key}`"
            :to="section.to"
            class="app-nav-menu-link"
            :class="{ active: section.key === activeSection }"
            :aria-current="section.key === activeSection ? 'page' : undefined"
            @click="closeMenu"
          >
            <component :is="section.icon" v-if="section.icon" aria-hidden="true" />
            <span>{{ section.label }}</span>
          </RouterLink>
        </template>

        <template v-for="group in destinationGroups" :key="group.label">
          <span class="app-nav-menu-group">{{ group.label }}</span>
          <RouterLink
            v-for="destination in group.items"
            :key="destination.key"
            :to="destination.to"
            class="app-nav-menu-link"
            :class="{ active: destination.key === activeDestinationKey }"
            :aria-current="destination.key === activeDestinationKey ? 'page' : undefined"
            @click="closeMenu"
          >
            <component :is="destination.icon" aria-hidden="true" />
            <span>{{ destination.label }}</span>
          </RouterLink>
        </template>

        <span class="app-nav-menu-group">Compte</span>
        <button type="button" class="app-nav-menu-link" @click="openPalette">
          <Search aria-hidden="true" /><span>Rechercher</span><kbd>{{ shortcutLabel }}</kbd>
        </button>
        <RouterLink to="/profile" class="app-nav-menu-link" @click="closeMenu">
          <UserRound aria-hidden="true" /><span>Profil</span>
        </RouterLink>
        <a href="/privacy" class="app-nav-menu-link"><ShieldCheck aria-hidden="true" /><span>Confidentialité</span></a>
        <a href="/logout" class="app-nav-menu-link" @click="clearCache"><LogOut aria-hidden="true" /><span>Déconnexion</span></a>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Clapperboard, LogOut, Menu, Search, ShieldCheck, UserRound, X } from '@lucide/vue';
import { clearCache } from '@/cache';
import { useModalA11y } from '@/composables/useModalA11y';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';
import { useDownloadSources } from '@/composables/useDownloadSources';
import {
  activeSectionKey,
  destinationForPath,
  destinationsFor,
  sectionsFor,
  type NavDestination,
} from '@/navigation';

const props = withDefaults(
  defineProps<{
    orientation: 'rail' | 'bar';
    isAdmin?: boolean;
    canModerate?: boolean;
  }>(),
  { isAdmin: false, canModerate: false }
);

const emit = defineEmits<{ (e: 'open-palette'): void }>();

/** Quatre sections en barre : au-delà, les libellés deviennent illisibles. */
const BAR_SLOTS = 4;

const route = useRoute();
const { arrInstances, downloadClients, load: loadSources } = useDownloadSources();
const menuOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);

const shortcutLabel = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl+K';

const destinations = computed(() => destinationsFor(props.isAdmin, props.canModerate));
const current = computed<NavDestination | null>(() =>
  destinationForPath(route.path, props.isAdmin, props.canModerate)
);
const activeDestinationKey = computed(() => current.value?.key || '');
const destinationLabel = computed(() => current.value?.label || 'Watchdeck');

const navContext = computed(() => ({
  isAdmin: props.isAdmin,
  canModerate: props.canModerate,
  arrInstances: arrInstances.value,
  downloadClients: downloadClients.value,
}));

const sections = computed(() =>
  activeDestinationKey.value ? sectionsFor(activeDestinationKey.value, navContext.value) : []
);

// Le rail a la hauteur pour tout montrer ; la barre plafonne et renvoie le reste au ☰.
const visibleSections = computed(() =>
  props.orientation === 'rail' ? sections.value : sections.value.slice(0, BAR_SLOTS)
);
const overflowSections = computed(() =>
  props.orientation === 'rail' ? [] : sections.value.slice(BAR_SLOTS)
);

const activeSection = computed(() => activeSectionKey(sections.value, route as any));

const destinationGroups = computed(() => {
  const groups: Array<{ label: string; items: NavDestination[] }> = [];
  for (const destination of destinations.value) {
    const existing = groups.find((group) => group.label === destination.group);
    if (existing) existing.items.push(destination);
    else groups.push({ label: destination.group, items: [destination] });
  }
  return groups;
});

// Les sections de Téléchargements viennent des instances : on ne les charge qu'en
// entrant dans cette destination, pas au montage de la navigation.
watch(
  activeDestinationKey,
  (key) => {
    if (key === 'downloads' && props.isAdmin) void loadSources();
  },
  { immediate: true }
);

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value;
}

function closeMenu(): void {
  menuOpen.value = false;
}

function openPalette(): void {
  closeMenu();
  emit('open-palette');
}

watch(() => route.fullPath, closeMenu);

useBodyScrollLock(menuOpen);
useModalA11y(menuRef, menuOpen, closeMenu);
</script>

<style scoped lang="scss">
/* ─────────────────────────── Tronc commun ─────────────────────────── */
.app-nav-items { margin: 0; padding: 0; list-style: none; }

.app-nav-link {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  text-decoration: none;
  cursor: pointer;
  transition: color .15s ease, background-color .15s ease;
}

.app-nav-link:hover { color: var(--text); }
.app-nav-link.active { color: var(--accent); }

/* ───────────────────────── Rail (≥ 768px) ───────────────────────── */
.app-nav--rail {
  position: sticky;
  top: 0;
  z-index: 31;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  height: 100dvh;
  /* Encoche en paysage à gauche, barres système en haut et en bas. */
  padding-top: max(12px, var(--safe-top));
  padding-bottom: max(12px, var(--safe-bottom));
  padding-left: max(8px, var(--safe-left));
  padding-right: 8px;
  border-right: 1px solid var(--border);
  background: var(--surface-sunken);
}

.app-nav-brand {
  display: grid;
  place-items: center;
  flex: none;
  width: 44px;
  height: 44px;
  margin-bottom: var(--space-2);
  border-radius: var(--radius-md);
  background: var(--accent-gradient);
  color: #151515;
}

.app-nav-brand svg { width: 22px; height: 22px; }

.app-nav--rail .app-nav-items {
  display: grid;
  gap: var(--space-1);
  width: 100%;
  overflow-y: auto;
  scrollbar-width: none;
}

.app-nav--rail .app-nav-items::-webkit-scrollbar { display: none; }

.app-nav--rail .app-nav-footer {
  display: grid;
  gap: var(--space-1);
  width: 100%;
  margin-top: auto;
  padding-top: var(--space-2);
  border-top: 1px solid var(--border);
}

.app-nav--rail .app-nav-link {
  width: 44px;
  height: 44px;
  margin-inline: auto;
  border-radius: var(--radius-md);
}

.app-nav--rail .app-nav-link svg { width: 20px; height: 20px; }
.app-nav--rail .app-nav-link:hover { background: var(--surface-2); }
.app-nav--rail .app-nav-link.active { background: color-mix(in srgb, var(--accent) 14%, transparent); }

/* Repère de position lisible sans dépendre uniquement de la couleur. */
.app-nav--rail .app-nav-link.active::before {
  content: '';
  position: absolute;
  left: -8px;
  width: 3px;
  height: 22px;
  border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
  background: var(--accent);
}

/* ───────────────────────── Barre (< 768px) ───────────────────────── */
.app-nav--bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 50;
  display: flex;
  align-items: stretch;
  /* La hauteur utile s'ajoute à l'inset bas : les cibles restent au-dessus de
     l'indicateur d'accueil, jamais dessous. */
  height: calc(var(--mobile-nav-h) + var(--safe-bottom));
  padding-bottom: var(--safe-bottom);
  padding-left: max(4px, var(--safe-left));
  padding-right: max(4px, var(--safe-right));
  border-top: 1px solid var(--border);
  background: #0d0d11;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, .4);
}

.app-nav--bar .app-nav-items { display: flex; flex: 1; min-width: 0; }
.app-nav--bar .app-nav-item { flex: 1; min-width: 0; }
.app-nav--bar .app-nav-footer { display: flex; flex: none; }

.app-nav--bar .app-nav-link {
  flex-direction: column;
  gap: 2px;
  width: 100%;
  height: 100%;
  padding: 6px 2px;
  touch-action: manipulation;
}

.app-nav--bar .app-nav-burger { min-width: 60px; }
.app-nav--bar .app-nav-link svg { width: 20px; height: 20px; }

.app-nav-label {
  display: block;
  max-width: 100%;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.1;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Téléphone en paysage : la hauteur est la ressource rare. */
@media (max-height: 500px) and (orientation: landscape) {
  .app-nav--bar .app-nav-link { flex-direction: row; gap: var(--space-2); }
  .app-nav--bar .app-nav-label { display: none; }
}

/* ─────────────────────────────── Menu ─────────────────────────────── */
.app-nav-scrim {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(9, 9, 11, .6);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.app-nav-menu {
  position: fixed;
  z-index: 61;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: 0 18px 50px rgba(0, 0, 0, .45);
}

.app-nav-menu--rail {
  top: max(12px, var(--safe-top));
  bottom: max(12px, var(--safe-bottom));
  left: calc(var(--rail-w) + 8px);
  width: min(300px, calc(100vw - var(--rail-w) - 24px));
}

/* Posé au-dessus de la barre, insets compris : le menu ne passe jamais sous
   l'indicateur d'accueil ni sous une encoche en paysage. */
.app-nav-menu--bar {
  right: max(8px, var(--safe-right));
  bottom: calc(var(--mobile-nav-h) + var(--safe-bottom) + 8px);
  left: max(8px, var(--safe-left));
  max-height: calc(100dvh - var(--mobile-nav-h) - var(--safe-bottom) - var(--safe-top) - 24px);
}

.app-nav-menu-head {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.app-nav-menu-head strong { font-size: var(--fs-md); }

.app-nav-menu-close {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.app-nav-menu-close:hover { color: var(--text); background: var(--surface-2); }
.app-nav-menu-close svg { width: 17px; height: 17px; }

.app-nav-menu-body {
  display: grid;
  gap: 2px;
  padding: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.app-nav-menu-group {
  padding: 10px 8px 4px;
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.app-nav-menu-link {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: var(--fs-sm);
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}

.app-nav-menu-link svg { flex: none; width: 16px; height: 16px; color: var(--muted); }
.app-nav-menu-link span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-nav-menu-link kbd {
  flex: none;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  color: var(--muted);
  font-family: inherit;
  font-size: var(--fs-xs);
}
.app-nav-menu-link:hover { background: var(--surface-2); }

.app-nav-menu-link.active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.app-nav-menu-link.active svg { color: var(--accent); }

@media (forced-colors: active) {
  .app-nav-link.active,
  .app-nav-menu-link.active { forced-color-adjust: none; color: HighlightText; background: Highlight; }
}
</style>
