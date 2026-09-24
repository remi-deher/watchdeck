<template>
  <!-- Un seul panneau, sur toutes les tailles d'ecran : il sort de la barre de recherche.
       Sur telephone la barre est en bas, il monte au-dessus d'elle ; au-dela elle est en
       haut, il descend en dessous. La colonne de 210px du bureau a disparu : elle
       retrecissait la grille et decalait la page selon qu'elle etait ouverte ou non. -->
  <ModalShell :open="open" title="Filtres" panel-class="filter-sheet" :modal="false" @close="$emit('close')">
    <div class="filter-modal-body">
      <slot />
    </div>
    <!-- Un pied, toujours.
         « Réinitialiser » n'apparaissait qu'avec un filtre actif, et rien ne permettait
         de conclure : il fallait remonter chercher la croix tout en haut d'un panneau
         qu'on venait de parcourir. L'action principale ferme, et dit ce qu'elle ferme --
         avec le décompte quand la page le fournit. -->
    <template #actions>
      <UiButton v-if="activeCount" @click="$emit('reset')">Réinitialiser</UiButton>
      <UiButton variant="primary" class="filter-apply" @click="$emit('close')">{{ applyLabel }}</UiButton>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';
import ModalShell from './ModalShell.vue';
import UiButton from './UiButton.vue';
import { useChromeAutoHide } from '@/composables/useChromeAutoHide';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    activeCount?: number;
    /** Nombre de resultats retenus, quand la page sait le donner avant fermeture. */
    matchCount?: number | null;
  }>(),
  {
    open: false,
    activeCount: 0,
    matchCount: null,
  }
);

defineEmits<{
  (e: 'close'): void;
  (e: 'reset'): void;
}>();

/* Le libelle annonce le resultat quand la page le connait. Sans decompte fiable il
   reste generique : un chiffre faux serait pire que pas de chiffre. */
const applyLabel = computed(() => {
  const count = props.matchCount;
  if (count == null) return 'Voir les résultats';
  return count === 1 ? 'Voir 1 résultat' : `Voir ${count.toLocaleString('fr-FR')} résultats`;
});

/* L'habillage de la barre (coins droits, capsule pleine hauteur) suit cet attribut et
   non la presence de la feuille dans le document : celle-ci peut y trainer le temps
   d'une transition qui ne se termine pas, et la barre restait alors habillee pour un
   panneau qui n'etait plus la. */
const SHEET_FLAG = 'data-filter-sheet';
function flagSheet(on: boolean): void {
  if (typeof document === 'undefined') return;
  document.body.toggleAttribute(SHEET_FLAG, on);
}

/* Le panneau se cale sur le champ de la barre : meme bord gauche, meme largeur, pose
   juste sous son bord bas. Le champ change de place selon la page et l'etat du rail, et
   le panneau vit dans un portail hors de la barre : on mesure donc sa boite et on la
   publie en variables CSS, reprises par la geometrie du panneau (_components.scss). */
const ANCHOR_VARS = ['--filter-anchor-left', '--filter-anchor-width', '--filter-anchor-top'];
let observer: ResizeObserver | undefined;

function measureAnchor(): void {
  const field = document.querySelector<HTMLElement>('.app-topbar .ui-search-field, .app-topbar__filter-only');
  if (!field) return;
  const box = field.getBoundingClientRect();
  const root = document.documentElement.style;
  root.setProperty('--filter-anchor-left', `${Math.round(box.left)}px`);
  root.setProperty('--filter-anchor-width', `${Math.round(box.width)}px`);
  root.setProperty('--filter-anchor-top', `${Math.round(box.bottom)}px`);
}

function trackAnchor(on: boolean): void {
  if (typeof window === 'undefined') return;
  observer?.disconnect();
  observer = undefined;
  window.removeEventListener('resize', measureAnchor);
  if (!on) {
    ANCHOR_VARS.forEach((name) => document.documentElement.style.removeProperty(name));
    return;
  }
  measureAnchor();
  window.addEventListener('resize', measureAnchor);
  const bar = document.querySelector('.app-topbar');
  if (bar && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measureAnchor);
    observer.observe(bar);
  }
}

/* La feuille n'est pas modale : la page defile derriere elle. Sans verrou, ce defilement
   masquait la barre -- et avec elle le panneau qui en sort -- pendant qu'on filtrait. */
const { setHold } = useChromeAutoHide();
watch(
  () => props.open,
  (posee) => { flagSheet(posee); setHold('filter-sheet', posee); trackAnchor(posee); },
  { immediate: true }
);

onUnmounted(() => {
  flagSheet(false);
  setHold('filter-sheet', false);
  trackAnchor(false);
});
</script>

<style scoped lang="scss">
/* filter-group / group-label / filter-badge : styles globaux dans styles/layout/_layout.scss.
   Geometrie du panneau (ancrage a la barre) : styles/components/_components.scss. */
.filter-modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-2) 0;
}
.filter-modal-body :deep(select),
.filter-modal-body :deep(input[type="search"]) {
  width: 100%;
}
.filter-modal-body :deep(.ui-button),
.filter-modal-body :deep(button.danger) {
  width: 100%;
  justify-content: center;
}
</style>
