<template>
  <nav class="app-dock" aria-label="Navigation principale">
    <ul>
      <li v-for="destination in dockDestinations" :key="destination.key">
        <RouterLink
          class="app-nav-link app-dock__link"
          :to="destination.to"
          :aria-current="destination.key === activeKey ? 'page' : undefined"
        >
          <component :is="destination.icon" aria-hidden="true" />
          <span>{{ destination.label }}</span>
        </RouterLink>
      </li>
      <li>
        <button
          type="button"
          class="app-nav-link app-dock__link"
          :class="{ 'is-elsewhere': activeIsOutsideDock }"
          :aria-expanded="sheetOpen"
          aria-haspopup="dialog"
          @click="$emit('open-sheet')"
        >
          <Menu aria-hidden="true" />
          <span>Plus</span>
          <!-- Sans ce repère, une destination ouverte depuis la feuille n'apparaît
               nulle part dans le dock : l'utilisateur perd l'indication d'où il est. -->
          <i v-if="activeIsOutsideDock" class="app-dock__dot" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { Menu } from '@lucide/vue';
import { DOCK_DESTINATION_KEYS, destinationsFor, type NavDestination } from '@/navigation';

const props = withDefaults(
  defineProps<{ activeKey?: string; sheetOpen?: boolean; isAdmin?: boolean; canModerate?: boolean }>(),
  { activeKey: '', sheetOpen: false, isAdmin: false, canModerate: false }
);

defineEmits<{ (e: 'open-sheet'): void }>();

const permitted = computed(() => destinationsFor(props.isAdmin, props.canModerate));

/**
 * Quatre destinations au plus, dans l'ordre de `DOCK_DESTINATION_KEYS`, en ne gardant
 * que celles auxquelles la session a droit. Un utilisateur non-administrateur perd
 * `dashboard` : on complète alors avec ses autres destinations plutôt que de laisser
 * un dock à trois entrées.
 */
const dockDestinations = computed<NavDestination[]>(() => {
  const preferred = DOCK_DESTINATION_KEYS
    .map((key) => permitted.value.find((item) => item.key === key))
    .filter((item): item is NavDestination => Boolean(item));
  const filler = permitted.value.filter((item) => !preferred.includes(item));
  return [...preferred, ...filler].slice(0, 4);
});

const activeIsOutsideDock = computed(
  () => Boolean(props.activeKey) && !dockDestinations.value.some((item) => item.key === props.activeKey)
);
</script>

<style scoped lang="scss">
.app-dock {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 50;
  height: calc(var(--app-dock-h) + var(--safe-bottom));
  padding-bottom: var(--safe-bottom);
  padding-left: var(--safe-left);
  padding-right: var(--safe-right);
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-sunken) 96%, transparent);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  overscroll-behavior: none;
  touch-action: manipulation;
}

.app-dock ul {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  height: var(--app-dock-h);
  margin: 0;
  padding: 0;
  list-style: none;
}

.app-dock__link {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 100%;
  height: 100%;
  min-height: var(--touch-target);
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: var(--fs-xs);
  text-decoration: none;
  cursor: pointer;
}
.app-dock__link svg { width: 21px; height: 21px; }
.app-dock__link span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-dock__link[aria-current='page'],
.app-dock__link.is-elsewhere { color: var(--accent); }

.app-dock__dot {
  position: absolute;
  top: 8px;
  right: calc(50% - 15px);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

/* Paysage sur téléphone : la hauteur manque, les libellés passent à côté de l'icône. */
@media (max-height: 500px) and (orientation: landscape) {
  .app-dock__link { flex-direction: row; gap: var(--space-2); }
}
</style>
