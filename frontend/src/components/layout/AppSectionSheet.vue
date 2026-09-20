<template>
  <Teleport to="body">
    <div class="app-sheet__scrim" @click="$emit('close')" />
    <div
      ref="panel"
      class="app-sheet app-section-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-section-sheet-title"
      tabindex="-1"
    >
      <!-- Les liens ne referment pas la feuille eux-memes : c'est le shell qui la ferme
           une fois la route changee. Emettre `close` au clic la demontait avant que le
           routeur n'ait pousse son entree d'historique, et le `history.back()` par
           lequel `useModalA11y` reprend la sienne annulait alors la navigation --
           l'URL revenait a la section d'avant pendant que la page, elle, avait change.

           La poignee tient lieu d'en-tete : la feuille n'a qu'une liste, et lui donner
           la barre de titre complete de la navigation aurait coute 60px a un panneau
           qui doit rester sous le pouce. Le nom de la destination suffit a dire de quoi
           ces sections sont les sections. -->
      <div class="app-section-sheet__grab" aria-hidden="true" />
      <p id="app-section-sheet-title" class="app-section-sheet__title">{{ destinationLabel }}</p>

      <nav class="app-section-sheet__list" :aria-label="`Sections ${destinationLabel}`">
        <RouterLink
          v-for="section in sections"
          :key="section.key"
          class="app-nav-link app-sheet__link app-section-sheet__link"
          :to="section.to!"
          :aria-current="section.key === activeKey ? 'page' : undefined"
        >
          <component :is="section.icon" v-if="section.icon" aria-hidden="true" />
          <span>{{ section.label }}</span>
          <small v-if="section.count != null">{{ section.count }}</small>
          <Check v-if="section.key === activeKey" class="app-section-sheet__tick" aria-hidden="true" />
        </RouterLink>
      </nav>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { Check } from '@lucide/vue';
import type { SubnavItem } from '@/components/ui/AppSubnav.vue';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';
import { useModalA11y } from '@/composables/useModalA11y';

withDefaults(
  defineProps<{ sections: SubnavItem[]; activeKey?: string; destinationLabel?: string }>(),
  { activeKey: '', destinationLabel: '' }
);

const emit = defineEmits<{ (e: 'close'): void }>();

const panel = ref<HTMLElement | null>(null);
const alwaysOpen = ref(true);

// Meme contrat que la feuille de navigation : le composant n'existe que pendant
// l'ouverture, donc le piege a focus et le verrou de defilement valent des le montage.
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

/* La feuille s'arrete au-dessus du dock au lieu de le recouvrir : l'entree qui vient
   d'etre touchee doit rester visible, c'est elle qui dit de quelle destination on
   ouvre les sections -- et la refermer se fait du meme pouce, au meme endroit. */
.app-section-sheet {
  position: fixed;
  right: 0;
  bottom: calc(var(--app-dock-h) + var(--safe-bottom));
  left: 0;
  z-index: 61;
  display: flex;
  flex-direction: column;
  max-height: min(70dvh, calc(var(--visual-viewport-height) - var(--safe-top) - var(--app-dock-h)));
  padding: var(--space-2) max(var(--space-3), var(--safe-right)) var(--space-3)
    max(var(--space-3), var(--safe-left));
  border-top: 1px solid var(--border);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--surface);
  box-shadow: 0 -18px 50px rgba(0, 0, 0, .55);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.app-section-sheet__grab {
  flex: none;
  width: 36px;
  height: 4px;
  margin: 0 auto var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--border);
}

.app-section-sheet__title {
  flex: none;
  margin: 0 0 var(--space-1);
  padding: 0 var(--space-3);
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.app-section-sheet__list { display: grid; gap: 2px; }

.app-section-sheet__link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: var(--touch-target);
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: var(--fs-md);
  text-decoration: none;
}
.app-section-sheet__link svg { flex: none; width: 18px; height: 18px; }
.app-section-sheet__link:hover { color: var(--text); background: var(--surface-2); }
.app-section-sheet__link[aria-current='page'] {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  font-weight: 700;
}
.app-section-sheet__link small {
  display: grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
  font-size: var(--fs-xs);
}
.app-section-sheet__tick { margin-left: auto; color: var(--accent); }
.app-section-sheet__link small + .app-section-sheet__tick { margin-left: 0; }
</style>
