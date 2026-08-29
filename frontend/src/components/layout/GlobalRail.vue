<!--
  Rail de navigation global, toujours visible sur tablette et ordinateur.

  Avant lui, chaque « espace » (Decouvrir, Bibliotheque, Telechargements, Activite,
  Administration, Parametres) remplacait integralement la navigation applicative : depuis
  Telechargements, atteindre le Calendrier demandait d'ouvrir le popover « Plus », de
  revenir a l'accueil, puis de cliquer. Le rail rend chaque zone accessible en un clic et
  montre en permanence ou l'on se trouve.

  Sur mobile il s'efface : la barre du bas joue ce role (voir SpaceSidebar / App.vue).
-->
<template>
  <nav class="global-rail desktop-only" aria-label="Navigation principale">
    <RouterLink class="rail-brand" to="/" aria-label="Watchdeck — accueil">
      <Clapperboard aria-hidden="true" />
    </RouterLink>

    <ul class="rail-items">
      <li v-for="item in destinations" :key="item.key">
        <RouterLink
          :to="item.to"
          class="rail-link"
          :class="{ active: item.match(route.path) }"
          :aria-current="item.match(route.path) ? 'page' : undefined"
          :title="item.label"
        >
          <component :is="item.icon" aria-hidden="true" />
          <span class="sr-only">{{ item.label }}</span>
        </RouterLink>
      </li>
    </ul>

    <div class="rail-footer">
      <button type="button" class="rail-link" :title="`Rechercher (${shortcutLabel})`" @click="$emit('open-palette')">
        <Search aria-hidden="true" /><span class="sr-only">Rechercher une destination ({{ shortcutLabel }})</span>
      </button>
      <RouterLink class="rail-link" to="/profile" :class="{ active: route.path.startsWith('/profile') }" title="Profil">
        <UserRound aria-hidden="true" /><span class="sr-only">Profil</span>
      </RouterLink>
      <a class="rail-link" href="/logout" title="Déconnexion" @click="clearCache">
        <LogOut aria-hidden="true" /><span class="sr-only">Déconnexion</span>
      </a>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Clapperboard, LogOut, Search, UserRound } from '@lucide/vue';
import { clearCache } from '@/cache';
import { railDestinationsFor } from '@/spaces';

const props = withDefaults(
  defineProps<{
    isAdmin?: boolean;
    canModerate?: boolean;
  }>(),
  { isAdmin: false, canModerate: false }
);

defineEmits<{ (e: 'open-palette'): void }>();

// macOS affiche ⌘, le reste Ctrl : annoncer le mauvais raccourci vaut moins que rien.
const shortcutLabel = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  ? '⌘K'
  : 'Ctrl+K';

const route = useRoute();
const destinations = computed(() => railDestinationsFor(props.isAdmin, props.canModerate));
</script>

<style scoped lang="scss">
.global-rail {
  position: sticky;
  top: 0;
  z-index: 31;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  height: 100dvh;
  padding: max(12px, var(--safe-top)) 8px max(12px, var(--safe-bottom));
  padding-left: max(8px, var(--safe-left));
  border-right: 1px solid var(--border);
  background: var(--surface-sunken);
}

.rail-brand {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-bottom: var(--space-2);
  border-radius: var(--radius-md);
  background: var(--accent-gradient);
  color: #151515;
}

.rail-brand svg { width: 22px; height: 22px; }

.rail-items {
  display: grid;
  gap: var(--space-1);
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  scrollbar-width: none;
}

.rail-items::-webkit-scrollbar { display: none; }

.rail-footer {
  display: grid;
  gap: var(--space-1);
  width: 100%;
  margin-top: auto;
  padding-top: var(--space-2);
  border-top: 1px solid var(--border);
}

.rail-link {
  position: relative;
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-inline: auto;
  border-radius: var(--radius-md);
  color: var(--muted);
  text-decoration: none;
  transition: color .15s ease, background-color .15s ease;
}

.rail-link svg { width: 20px; height: 20px; }
.rail-link:hover { color: var(--text); background: var(--surface-2); }

.rail-link.active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

/* Repere de position lisible sans dependre uniquement de la couleur. */
.rail-link.active::before {
  content: '';
  position: absolute;
  left: -8px;
  width: 3px;
  height: 22px;
  border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
  background: var(--accent);
}

@media (forced-colors: active) {
  .rail-link.active { forced-color-adjust: none; color: HighlightText; background: Highlight; }
}
</style>
