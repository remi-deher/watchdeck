<template>
  <!-- Dialogue Reka UI NON modal, et c'est voulu : en mode modal, Reka masque toute
       l'application aux lecteurs d'ecran et bloque les appuis sur <body>, ce qui coutait a
       Safari un recalcul complet a l'ouverture et a la fermeture (on l'avait deja retire
       une fois sous la forme d'un `inert`). Reka garde ici le role de dialogue, Echap et
       le clic a cote ; le focus est tenu par `FocusScope`, le defilement verrouille a part. -->
  <DialogRoot :open="open" :modal="false" @update:open="(o) => { if (!o) $emit('close'); }">
  <Teleport to="body">
    <!-- Transition CSS pure, sur `transform` et `opacity` seulement : Safari la confie au
         GPU, et elle reste fluide pendant que la fiche se construit sur le fil principal.
         Un ressort pilote en script (motion-v) saccadait justement a ce moment-la. -->
    <Transition name="media-overlay" @after-leave="$emit('after-leave')">
      <div
        v-if="open"
        ref="voileRef"
        class="media-overlay"
      >
        <!-- Deux etages : l'enveloppe porte l'ouverture et la fermeture, le panneau porte
             le geste. Leurs translations s'additionnent sans se defaire. -->
        <div class="media-overlay__frame">
          <DialogContent
            as-child
            force-mount
            :aria-describedby="undefined"
            :aria-label="ariaLabel"
          >
          <FocusScope trapped loop as-child>
          <div ref="panelRef" class="media-overlay__panel">
            <!-- La poignee reste le repere du geste, et son point de depart a la souris.
                 Au doigt, toute la fiche se tire des qu'elle est lue depuis le haut. -->
            <div class="media-overlay__grab" aria-hidden="true">
              <span></span>
            </div>
            <button class="media-overlay__close" type="button" aria-label="Fermer" @click="$emit('close')">
              <X />
            </button>
            <div class="media-overlay__scroll">
              <slot />
            </div>
          </div>
          </FocusScope>
          </DialogContent>
        </div>
      </div>
    </Transition>
  </Teleport>
  </DialogRoot>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, toRef, watch } from 'vue';
import { X } from '@lucide/vue';
import { DialogContent, DialogRoot, FocusScope } from 'reka-ui';
import { useSheetGesture } from '@/composables/useSheetGesture';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    ariaLabel?: string;
  }>(),
  { open: false, ariaLabel: 'Fiche du média' }
);

const emit = defineEmits<{ (e: 'close'): void; (e: 'after-leave'): void }>();

/* La page de fond reste visible mais ne defile plus : sans ce verrou, faire glisser la
   fiche entrainait la grille derriere elle, et l'on perdait la place qu'on voulait
   justement garder. */
/* Verrou minimal, et pas celui de Reka : le sien rend aussi <body> insensible aux appuis
   (`pointer-events: none`), ce qui suppose un dialogue modal qui s'en excepte -- la fiche,
   non modale, ne recevait plus un seul toucher. Le verrou porte sur les deux elements
   racine : `overflow: hidden` sur <body> seul ne retient pas iOS. */
function verrouiller(actif: boolean): void {
  for (const el of [document.documentElement, document.body]) el.style.overflow = actif ? 'hidden' : '';
}
watch(() => props.open, verrouiller, { immediate: true });
onBeforeUnmount(() => verrouiller(false));


const panelRef = ref<HTMLElement | null>(null);
const voileRef = ref<HTMLElement | null>(null);

/* Pas d'entree d'historique supplementaire : la fiche EST deja une entree (sa route), et
   « retour » la referme naturellement. En ajouter une obligeait chaque fermeture a reculer
   deux fois -- la seconde passant par un aller-retour `popstate` de plus. */

/* Tirer la fiche vers le bas la referme : c'est le geste qu'on attend d'une surface posee
   sur une page, et il evite d'aller chercher la croix a l'autre bout de l'ecran. Voir
   `useSheetGesture` pour les regles -- notamment l'arret en haut du contenu. */
/* Des qu'on ferme, la page reprend la main : le voile, plein ecran, restait sinon en
   place le temps de sa sortie et avalait les appuis -- on croyait l'application figee
   quelques dixiemes de seconde apres chaque fermeture. */
watch(() => props.open, (ouverte) => {
  if (ouverte) return;
  if (voileRef.value) voileRef.value.style.pointerEvents = 'none';
}, { flush: 'sync' });

useSheetGesture(panelRef, toRef(props, 'open'), {
  onClose: () => emit('close'),
  poignee: '.media-overlay__grab',
  voile: () => voileRef.value,
});
</script>

<style scoped lang="scss">
.media-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-sheet);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  /* Le fond s'assombrit sans disparaitre : c'est ce qui dit qu'on a ouvert quelque chose
     par-dessus la grille, et non change de page.
     Pas de `backdrop-filter` ici : flouter un fond pendant qu'un panneau se deplace
     au-dessus oblige Safari a recomposer la scene entiere a chaque image, et c'est ce qui
     faisait clignoter l'ouverture. L'assombrissement seul dit deja ce qu'il faut. */
  background: rgba(0, 0, 0, calc(0.72 * (1 - 0.9 * var(--sheet-progress, 0))));
}

.media-overlay__frame {
  display: flex;
  justify-content: center;
  width: 100%;
}

/* Ouverture : le fond se fonce, la feuille monte de tout son long. Fermeture : plus
   courte, en accelerant -- on ne fait pas attendre sur ce qu'on quitte. */
.media-overlay-enter-active { transition: opacity var(--motion-duration-base) var(--motion-ease-standard); }
.media-overlay-leave-active { transition: opacity var(--motion-duration-fast) var(--motion-ease-exit); }
.media-overlay-enter-active .media-overlay__frame {
  transition: transform var(--motion-duration-base) var(--motion-ease-emphasized);
}
.media-overlay-leave-active .media-overlay__frame {
  transition: transform var(--motion-duration-fast) var(--motion-ease-exit);
}
.media-overlay-enter-from,
.media-overlay-leave-to { opacity: 0; }
.media-overlay-enter-from .media-overlay__frame,
.media-overlay-leave-to .media-overlay__frame { transform: translate3d(0, 100%, 0); }
.media-overlay-enter-active .media-overlay__frame,
.media-overlay-leave-active .media-overlay__frame { will-change: transform; }

.media-overlay__panel {
  position: relative;
  width: min(1100px, 100%);
  max-height: 94dvh;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: 0;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  box-shadow: 0 -24px 70px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  transform-origin: center bottom;
  /* La surface est promue sur sa propre couche avant de bouger. Sans cela Safari la
     recompose en cours de route, et l'on voit passer une image a demi dessinee. */
  will-change: transform;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

/* `touch-action: none` est l'element essentiel : sans lui, le navigateur lit le
   glissement comme un defilement et ne nous rend jamais la main. La barre sert aussi de
   reperage -- une surface qui se tire doit le montrer. */
.media-overlay__grab {
  position: relative;
  z-index: 2;
  padding: 10px 0 6px;
  touch-action: none;
  cursor: grab;
}
/* Pendant le geste, plus aucune transition ne doit rattraper le doigt. */
.media-overlay__panel.is-dragging { transition: none; }
.media-overlay__grab > span {
  display: block;
  width: 42px;
  height: 4px;
  margin: 0 auto;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.34);
}
.media-overlay__grab:active { cursor: grabbing; }

/* En bas d'ecran, la feuille a d'emblee sa hauteur definitive, comme celles d'iOS : pendant
   le chargement elle montait courte, puis grandissait d'un coup a l'arrivee du contenu,
   en pleine animation. Au-dela, la carte centree garde une hauteur ajustee au contenu. */
@media (max-width: 767.98px) {
  .media-overlay__panel { height: 94dvh; }
}

.media-overlay__scroll {
  max-height: calc(94dvh - 26px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}
.media-overlay__scroll::-webkit-scrollbar { width: 0; height: 0; }

.media-overlay__close {
  position: absolute;
  /* Le flou de cette pastille reste : elle ne bouge pas, donc il ne coute qu'une fois. */
  top: calc(12px + var(--safe-top, 0px));
  right: 14px;
  z-index: 3;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(8px);
  cursor: pointer;
}
.media-overlay__close svg { width: 19px; height: 19px; }

@media (min-width: 768px) {
  .media-overlay { align-items: center; }
  /* Carte centree : elle ne vient pas du bord, elle se pose. */
  .media-overlay-enter-from .media-overlay__frame,
  .media-overlay-leave-to .media-overlay__frame { transform: translate3d(0, 24px, 0); }
  .media-overlay__panel {
    max-height: 90dvh;
    border-bottom: 1px solid var(--border);
    border-radius: var(--radius-lg);
    transform-origin: center;
  }
  .media-overlay__scroll { max-height: calc(90dvh - 26px); }
}

/* La fiche garde sa propre fleche « Retour » pour le mode pleine page. Posee en surface,
   elle ferait double emploi avec la croix -- deux moyens de fermer au meme endroit, dont
   l'un evoque une navigation qui n'a pas lieu. */
.media-overlay :deep(.mdh-back) { display: none; }

/* ─────────────────── L'en-tete prend toute la surface ───────────────────
 *
 * En pleine page, la banniere est une carte posee dans une colonne : elle garde ses
 * marges, son contour et ses coins arrondis. Ici elle EST le haut de la surface, du bord
 * gauche au bord droit, et c'est ce qui donne au transport quelque chose a franchir --
 * une vignette de 172 px qui devient une image pleine largeur. Sans cet ecart, l'affiche
 * se contentait de glisser de quelques centimetres sans changer de taille, et l'on ne
 * voyait rien.
 */
.media-overlay :deep(.mdh-backdrop) {
  min-height: min(46dvh, 420px);
  margin-bottom: var(--space-5);
  border: 0;
  border-radius: 0;
  background-position: center 18%;
}

/* Le degrade descend plus bas et plus fort : le titre et l'affiche se posent dessus, et
   une image claire les rendait illisibles. */
.media-overlay :deep(.mdh-scrim) {
  background:
    linear-gradient(to top, var(--bg) 2%, rgba(9, 9, 11, 0.92) 26%, rgba(9, 9, 11, 0.45) 62%, rgba(9, 9, 11, 0.1) 100%),
    linear-gradient(to right, rgba(9, 9, 11, 0.7) 0%, rgba(9, 9, 11, 0.25) 55%, transparent 85%);
}

/* L'affiche grandit avec la surface : c'est elle qu'on a touchee, elle doit arriver
   quelque part de visiblement plus grand que la vignette dont elle vient. */
.media-overlay :deep(.mdh-poster) {
  flex-basis: 156px;
  width: 156px;
}

@media (min-width: 768px) {
  .media-overlay :deep(.mdh-backdrop) { min-height: min(52dvh, 480px); }
  .media-overlay :deep(.mdh-poster) {
    flex-basis: 232px;
    width: 232px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .media-overlay__panel { will-change: auto; }
  .media-overlay-enter-active, .media-overlay-leave-active,
  .media-overlay-enter-active .media-overlay__frame,
  .media-overlay-leave-active .media-overlay__frame { transition: none; }
}
</style>
