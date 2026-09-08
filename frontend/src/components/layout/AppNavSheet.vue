<template>
  <Teleport to="body">
    <div class="app-sheet__scrim" @click="$emit('close')" />
    <div
      ref="panel"
      class="app-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-sheet-title"
      tabindex="-1"
    >
      <header class="app-sheet__head">
        <h2 id="app-sheet-title">Navigation</h2>
        <button type="button" class="app-sheet__close" aria-label="Fermer la navigation" @click="$emit('close')">
          <X aria-hidden="true" />
        </button>
      </header>

      <div class="app-sheet__body">
        <!-- La feuille montre la totalité des destinations permises, groupées comme
             dans le rail : c'est le même modèle, jamais un sous-ensemble arbitraire. -->
        <section v-for="group in groups" :key="group.label" class="app-sheet__group">
          <p class="app-sheet__group-label">{{ group.label }}</p>
          <RouterLink
            v-for="destination in group.items"
            :key="destination.key"
            class="app-nav-link app-sheet__link"
            :to="destination.to"
            :aria-current="destination.key === activeKey ? 'page' : undefined"
            @click="$emit('close')"
          >
            <component :is="destination.icon" aria-hidden="true" />
            <span>{{ destination.label }}</span>
          </RouterLink>
        </section>

        <section class="app-sheet__group">
          <p class="app-sheet__group-label">Compte et outils</p>
          <button type="button" class="app-nav-link app-sheet__link" @click="$emit('open-palette')">
            <Search aria-hidden="true" /><span>Recherche globale</span><kbd>{{ shortcutLabel }}</kbd>
          </button>
          <RouterLink class="app-nav-link app-sheet__link" to="/profile" @click="$emit('close')">
            <UserRound aria-hidden="true" /><span>Profil</span>
          </RouterLink>
          <a class="app-nav-link app-sheet__link" href="/privacy"><ShieldCheck aria-hidden="true" /><span>Confidentialité</span></a>
          <a class="app-nav-link app-sheet__link" href="/logout" @click="clearCache"><LogOut aria-hidden="true" /><span>Déconnexion</span></a>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { LogOut, Search, ShieldCheck, UserRound, X } from '@lucide/vue';
import { clearCache } from '@/cache';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';
import { useModalA11y } from '@/composables/useModalA11y';
import { destinationsFor, type NavDestination } from '@/navigation';
import { shortcutLabel } from '@/shortcut';

const props = withDefaults(
  defineProps<{ activeKey?: string; isAdmin?: boolean; canModerate?: boolean }>(),
  { activeKey: '', isAdmin: false, canModerate: false }
);

const emit = defineEmits<{ (e: 'close'): void; (e: 'open-palette'): void }>();

const panel = ref<HTMLElement | null>(null);
const alwaysOpen = ref(true);

const groups = computed<Array<{ label: string; items: NavDestination[] }>>(() => {
  const result: Array<{ label: string; items: NavDestination[] }> = [];
  for (const destination of destinationsFor(props.isAdmin, props.canModerate)) {
    const existing = result.find((group) => group.label === destination.group);
    if (existing) existing.items.push(destination);
    else result.push({ label: destination.group, items: [destination] });
  }
  return result;
});

// Le composant n'est monté que pendant l'ouverture : le piège à focus, le verrou de
// défilement et la gestion du bouton « retour » s'activent donc dès le montage.
useBodyScrollLock(alwaysOpen);
useModalA11y(panel, null, () => emit('close'));
</script>

<style scoped lang="scss">
.app-sheet__scrim {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(9, 9, 11, .62);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.app-sheet {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 61;
  display: flex;
  flex-direction: column;
  max-height: min(84dvh, calc(var(--visual-viewport-height) - var(--safe-top)));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  border-top: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 -18px 50px rgba(0, 0, 0, .55);
}

.app-sheet__head {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) max(var(--space-4), var(--safe-right)) var(--space-3) max(var(--space-4), var(--safe-left));
  border-bottom: 1px solid var(--border);
}
.app-sheet__head h2 { margin: 0; font-size: var(--fs-lg); }
.app-sheet__close {
  display: grid;
  place-items: center;
  width: var(--touch-target);
  height: var(--touch-target);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.app-sheet__close:hover { color: var(--text); background: var(--surface-2); }
.app-sheet__close svg { width: 18px; height: 18px; }

.app-sheet__body {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-3) max(var(--space-3), var(--safe-right))
    max(var(--space-4), var(--safe-bottom)) max(var(--space-3), var(--safe-left));
  overflow-y: auto;
  overscroll-behavior: contain;
}

.app-sheet__group { display: grid; gap: 2px; }
.app-sheet__group-label {
  margin: 0 0 var(--space-1);
  padding: 0 var(--space-2);
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.app-sheet__link {
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
  font-size: var(--fs-md);
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.app-sheet__link svg { flex: none; width: 18px; height: 18px; }
.app-sheet__link kbd {
  margin-left: auto;
  padding: 2px 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  font-size: 10px;
}
.app-sheet__link:hover { color: var(--text); background: var(--surface-2); }
.app-sheet__link[aria-current='page'] {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  font-weight: 700;
}
</style>
