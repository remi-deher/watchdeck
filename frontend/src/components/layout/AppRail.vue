<template>
  <nav class="app-rail" :data-density="density" aria-label="Navigation principale">
    <RouterLink class="app-rail__brand" to="/" :aria-label="`Watchdeck — accueil`">
      <Clapperboard aria-hidden="true" />
      <span class="app-rail__brand-name" :class="{ 'sr-only': density === 'medium' }">{{ pageTitle || 'Watchdeck' }}</span>
    </RouterLink>

    <div class="app-rail__scroll">
      <!-- Les groupes structurent le rail déployé. En mode compact ils deviennent de
           simples séparateurs : leur libellé ne tiendrait pas sur 72px, mais la
           coupure visuelle, elle, reste lisible. -->
      <div v-for="group in groups" :key="group.label" class="app-rail__group">
        <p v-if="density === 'expanded'" class="app-rail__group-label">{{ group.label }}</p>
        <ul>
          <li v-for="destination in group.items" :key="destination.key">
            <RouterLink
              class="app-nav-link app-rail__link"
              :to="destination.to"
              :aria-current="destination.key === activeKey ? 'page' : undefined"
              :title="density === 'medium' ? destination.label : undefined"
            >
              <component :is="destination.icon" aria-hidden="true" />
              <!-- Le libellé reste dans le DOM en mode compact : masqué visuellement,
                   il continue de nommer le lien pour les technologies d'assistance,
                   sans dépendre d'un aria-label à maintenir en double. -->
              <span :class="density === 'medium' ? 'sr-only' : 'app-rail__label'">{{ destination.label }}</span>
            </RouterLink>
            <ul
              v-if="density === 'expanded' && destination.key === activeKey && sections.length > 1"
              class="app-rail__subnav"
              :aria-label="`Sections ${destination.label}`"
            >
              <li v-for="section in sections" :key="section.key">
                <RouterLink
                  class="app-rail__sublink"
                  :to="section.to || destination.to"
                  :aria-current="section.key === activeSectionKey ? 'page' : undefined"
                >
                  <component v-if="section.icon" :is="section.icon" aria-hidden="true" />
                  <span>{{ section.label }}</span>
                </RouterLink>
              </li>
            </ul>
          </li>
        </ul>
      </div>
    </div>

    <div class="app-rail__footer">
      <button type="button" class="app-nav-link app-rail__link" @click="$emit('open-palette')">
        <Search aria-hidden="true" />
        <span :class="density === 'medium' ? 'sr-only' : 'app-rail__label'">Rechercher</span>
        <kbd v-if="density === 'expanded'">{{ shortcutLabel }}</kbd>
      </button>
      <RouterLink class="app-nav-link app-rail__link" to="/profile" :title="density === 'medium' ? 'Profil' : undefined">
        <UserRound aria-hidden="true" />
        <span :class="density === 'medium' ? 'sr-only' : 'app-rail__label'">Profil</span>
      </RouterLink>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { Clapperboard, Search, UserRound } from '@lucide/vue';
import { destinationsFor, type NavDestination } from '@/navigation';
import { shortcutLabel } from '@/shortcut';
import { usePageSections } from '@/composables/usePageSections';

const props = withDefaults(
  defineProps<{
    /** `medium` : icônes seules sur 72px. `expanded` : libellés et groupes visibles. */
    density: 'medium' | 'expanded';
    activeKey?: string;
    pageTitle?: string;
    isAdmin?: boolean;
    canModerate?: boolean;
  }>(),
  { activeKey: '', pageTitle: 'Watchdeck', isAdmin: false, canModerate: false }
);

defineEmits<{ (e: 'open-palette'): void }>();
const { sections, activeKey: activeSectionKey } = usePageSections();

/** Un seul niveau, groupé par métier : le rail montre toujours tout ce qui est permis. */
const groups = computed<Array<{ label: string; items: NavDestination[] }>>(() => {
  const result: Array<{ label: string; items: NavDestination[] }> = [];
  for (const destination of destinationsFor(props.isAdmin, props.canModerate)) {
    const existing = result.find((group) => group.label === destination.group);
    if (existing) existing.items.push(destination);
    else result.push({ label: destination.group, items: [destination] });
  }
  return result;
});
</script>

<style scoped lang="scss">
.app-rail {
  position: sticky;
  top: 0;
  grid-column: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  height: 100vh;
  height: 100dvh;
  padding: max(var(--space-3), var(--safe-top)) var(--space-2) max(var(--space-3), var(--safe-bottom));
  padding-left: max(var(--space-2), var(--safe-left));
  overflow: hidden;
  border-right: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  background: color-mix(in srgb, var(--bg) 96%, var(--surface));
}

.app-rail__scroll {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.app-rail__brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--touch-target);
  padding: 0 var(--space-2);
  color: var(--text);
  font-weight: 750;
  text-decoration: none;
}
.app-rail__brand svg { flex: none; width: 22px; height: 22px; color: var(--accent); }
.app-rail__brand-name { font-size: var(--fs-lg); white-space: nowrap; }

.app-rail__group ul { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.app-rail__group + .app-rail__group { border-top: 1px solid var(--border); padding-top: var(--space-4); }
.app-rail__group-label {
  margin: 0 0 var(--space-2);
  padding: 0 var(--space-2);
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.app-rail__link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: var(--touch-target);
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  font-size: var(--fs-sm);
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  transition: color .15s ease, background-color .15s ease;
}
.app-rail__link svg { flex: none; width: 19px; height: 19px; }
.app-rail__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-rail__link kbd {
  margin-left: auto;
  padding: 2px 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  color: var(--muted);
  font-size: 10px;
}
.app-rail__link:hover { color: var(--text); background: var(--surface); }
.app-rail__link[aria-current='page'] {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  font-weight: 700;
}

.app-rail__subnav {
  display: grid;
  gap: 2px;
  margin: 2px 0 var(--space-2) 20px !important;
  padding: 0 0 0 var(--space-2) !important;
  border-left: 1px solid var(--border);
}
.app-rail__sublink {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 36px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: var(--fs-xs);
  text-decoration: none;
}
.app-rail__sublink svg { flex: none; width: 15px; height: 15px; }
.app-rail__sublink:hover { color: var(--text); background: var(--surface); }
.app-rail__sublink[aria-current='page'] { color: var(--accent); font-weight: 700; }

.app-rail__footer {
  display: grid;
  gap: 2px;
  padding-top: var(--space-2);
  border-top: 1px solid var(--border);
}

/* Icônes seules : la cible reste carrée et centrée, jamais plus étroite que 44px. */
.app-rail[data-density='medium'] {
  .app-rail__brand { justify-content: center; padding: 0; }
  .app-rail__group + .app-rail__group { padding-top: var(--space-3); }
  .app-rail__link { justify-content: center; gap: 0; padding: 0; }
}
</style>
