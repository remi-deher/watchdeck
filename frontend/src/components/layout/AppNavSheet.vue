<template>
  <!-- Reka UI tient le focus, Echap, le clic sur le voile et le defilement verrouille. -->
  <DialogRoot :open="true" @update:open="(open) => { if (!open) $emit('close'); }">
    <DialogPortal>
    <DialogOverlay class="app-sheet__scrim" />
    <DialogContent class="app-sheet" :aria-describedby="undefined" @interact-outside="laisserAuDock">
      <header class="app-sheet__head">
        <DialogTitle as="h2">Navigation</DialogTitle>
        <button type="button" class="app-sheet__close" aria-label="Fermer la navigation" @click="$emit('close')">
          <X aria-hidden="true" />
        </button>
      </header>

      <div class="app-sheet__body">
        <!-- Les sections d'une destination que le dock ne porte pas : son entree active
             n'existe pas la-bas, donc rien ne pourrait les y decouvrir. Elles passent
             en tete, avant les destinations, parce qu'on vient d'abord voir ou l'on
             peut aller dans la page ou l'on est. -->
        <section v-if="sections.length > 1" class="app-sheet__group">
          <p class="app-sheet__group-label">{{ destinationLabel }}</p>
          <RouterLink
            v-for="section in sections"
            :key="section.key"
            class="app-nav-link app-sheet__link"
            :to="section.to!"
            :aria-current="section.key === activeSectionKey ? 'page' : undefined"
          >
            <component :is="section.icon" v-if="section.icon" aria-hidden="true" />
            <span>{{ section.label }}</span>
            <small v-if="section.count != null" class="app-sheet__count">{{ section.count }}</small>
          </RouterLink>
        </section>

        <!-- La feuille montre la totalité des destinations permises, groupées comme
             dans le rail : c'est le même modèle, jamais un sous-ensemble arbitraire.

             Les liens ne la referment pas eux-mêmes : c'est le shell qui s'en charge
             une fois la route changée. Fermer au clic la démontait avant que le routeur
             n'ait poussé son entrée d'historique, et le `history.back()` par lequel
             `useBackButtonClose` reprend la sienne annulait la navigation -- la page changeait
             mais l'URL restait celle d'avant, si bien qu'un rechargement ou un partage
             du lien ramenait ailleurs. -->
        <section v-for="group in groups" :key="group.label" class="app-sheet__group">
          <p class="app-sheet__group-label">{{ group.label }}</p>
          <RouterLink
            v-for="destination in group.items"
            :key="destination.key"
            class="app-nav-link app-sheet__link"
            :to="destination.to"
            :aria-current="destination.key === activeKey ? 'page' : undefined"
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
          <div class="app-sheet__theme">
            <span><Palette aria-hidden="true" />Thème</span>
            <UiSegmentedControl :model-value="themeChoice" :options="THEME_OPTIONS" ariaLabel="Thème" @update:model-value="(v) => setTheme(v as ThemeChoice)" />
          </div>
          <a class="app-nav-link app-sheet__link" href="/privacy"><ShieldCheck aria-hidden="true" /><span>Confidentialité</span></a>
          <a class="app-nav-link app-sheet__link" href="/logout" @click.prevent="seDeconnecter"><LogOut aria-hidden="true" /><span>Déconnexion</span></a>
        </section>
      </div>
    </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { laisserAuDock } from './sheetDock';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { LogOut, Palette, Search, ShieldCheck, UserRound, X } from '@lucide/vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import { THEME_OPTIONS, useTheme, type ThemeChoice } from '@/composables/useTheme';
import { useQueryClient } from '@tanstack/vue-query';
import { effacerStockage } from '@/offline/stockage';

const queryClient = useQueryClient();
/* Tout ce que l'application a conserve sur l'appareil est efface AVANT de quitter la
   page : un effacement lance au moment ou la page se decharge n'a pas le temps d'aboutir. */
async function seDeconnecter(): Promise<void> {
  await Promise.race([effacerStockage(queryClient), new Promise((r) => setTimeout(r, 1500))]);
  window.location.href = '/logout';
}
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { useBackButtonClose } from '@/composables/useBackButtonClose';
import { destinationsFor, type NavDestination } from '@/navigation';
import type { SubnavItem } from '@/components/ui/AppSubnav.vue';
import { shortcutLabel } from '@/shortcut';

const { choice: themeChoice, setTheme } = useTheme();

const props = withDefaults(
  defineProps<{
    activeKey?: string;
    isAdmin?: boolean;
    canModerate?: boolean;
    /** Sections a proposer ici ; vides des que le dock sait deja les montrer. */
    sections?: SubnavItem[];
    activeSectionKey?: string;
    destinationLabel?: string;
  }>(),
  {
    activeKey: '', isAdmin: false, canModerate: false,
    sections: () => [], activeSectionKey: '', destinationLabel: '',
  }
);

const emit = defineEmits<{ (e: 'close'): void; (e: 'open-palette'): void }>();


const groups = computed<Array<{ label: string; items: NavDestination[] }>>(() => {
  const result: Array<{ label: string; items: NavDestination[] }> = [];
  for (const destination of destinationsFor(props.isAdmin, props.canModerate)) {
    const existing = result.find((group) => group.label === destination.group);
    if (existing) existing.items.push(destination);
    else result.push({ label: destination.group, items: [destination] });
  }
  return result;
});

// Le composant n'est monte que pendant l'ouverture : « retour » le referme des le montage.
useBackButtonClose(null, () => emit('close'));
</script>

<style scoped lang="scss">
.app-sheet__scrim {
  position: fixed;
  inset: 0;
  z-index: var(--z-sheet);
  background: rgba(9, 9, 11, .62);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.app-sheet {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: calc(var(--z-sheet) + 1);
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

.app-sheet__theme {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: var(--touch-target);
  padding: 0 var(--space-3);
}
.app-sheet__theme > span { display: flex; align-items: center; gap: var(--space-3); color: var(--muted); font-size: var(--fs-md); }
.app-sheet__theme svg { flex: none; width: 18px; height: 18px; }
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
  font-size: var(--fs-xs);
}
.app-sheet__link:hover { color: var(--text); background: var(--surface-2); }
.app-sheet__count {
  display: grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  margin-left: auto;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
  font-size: var(--fs-xs);
}

.app-sheet__link[aria-current='page'] {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  font-weight: 700;
}
</style>
