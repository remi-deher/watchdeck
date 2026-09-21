<template>
  <Teleport to="body">
    <AnimatePresence>
      <motion.div
        v-if="open"
        key="media-overlay"
        class="media-overlay"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }"
        @click.self="$emit('close')"
      >
        <!-- La surface monte depuis le bas en prenant sa taille. Le depassement leger a
             l'arrivee -- le ressort plutot qu'une simple deceleration -- est ce qui
             distingue une surface qu'on ouvre d'un panneau qui apparait. -->
        <!-- Le geste est confie a `motion-v` plutot qu'a nos propres ecouteurs : c'est
             lui qui tient la transformation de ce panneau, et un style pose a la main
             etait efface a l'image suivante. `dragElastic` a 0 vers le haut : la fiche
             ne monte pas au-dela de sa place, elle ne fait que descendre. -->
        <motion.div
          ref="panelRef"
          class="media-overlay__panel"
          role="dialog"
          aria-modal="true"
          :aria-label="ariaLabel"
          :initial="{ opacity: 0, y: 48, scale: 0.94 }"
          :animate="{ opacity: 1, y: 0, scale: 1 }"
          :exit="{ opacity: 0, y: 32, scale: 0.96 }"
          :transition="{ type: 'spring', stiffness: 260, damping: 28, mass: 0.9 }"
          drag="y"
          :drag-constraints="{ top: 0, bottom: 0 }"
          :drag-elastic="{ top: 0, bottom: 0.55 }"
          :drag-listener="true"
          :on-drag-end="onDragEnd"
        >
          <button class="media-overlay__close" type="button" aria-label="Fermer" @click="$emit('close')">
            <X />
          </button>
          <div class="media-overlay__scroll">
            <slot />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, toRef } from 'vue';
import { AnimatePresence, motion } from 'motion-v';
import { X } from '@lucide/vue';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    ariaLabel?: string;
  }>(),
  { open: false, ariaLabel: 'Fiche du média' }
);

const emit = defineEmits<{ (e: 'close'): void }>();

/* La page de fond reste visible mais ne defile plus : sans ce verrou, faire glisser la
   fiche entrainait la grille derriere elle, et l'on perdait la place qu'on voulait
   justement garder. */
useBodyScrollLock(toRef(props, 'open'));

const panelRef = ref<HTMLElement | null>(null);

/* La fiche se tire vers le bas pour se refermer : c'est le geste qu'on attend d'une
   surface posee sur une page, et il evite d'aller chercher la croix a l'autre bout de
   l'ecran. Passe le quart de la hauteur, ou lancee assez vite, elle part ; sinon le
   ressort la remet en place tout seul. */
const SEUIL_PROPORTION = 0.25;
const SEUIL_VITESSE = 520;

function onDragEnd(_event: unknown, info: { offset: { y: number }; velocity: { y: number } }): void {
  const hauteur = panelHauteur();
  if (info.offset.y > hauteur * SEUIL_PROPORTION || info.velocity.y > SEUIL_VITESSE) emit('close');
}

function panelHauteur(): number {
  const valeur = panelRef.value as unknown as { $el?: unknown } | HTMLElement | null;
  const el = valeur instanceof HTMLElement ? valeur : ((valeur as { $el?: unknown })?.$el as HTMLElement | undefined);
  return el?.offsetHeight || window.innerHeight || 1;
}
</script>

<style scoped lang="scss">
.media-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  /* Le fond s'assombrit sans disparaitre : c'est ce qui dit qu'on a ouvert quelque chose
     par-dessus la grille, et non change de page. */
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(3px);
}

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
}

.media-overlay__scroll {
  max-height: 94dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}
.media-overlay__scroll::-webkit-scrollbar { width: 0; height: 0; }

.media-overlay__close {
  position: absolute;
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
  .media-overlay__panel {
    max-height: 90dvh;
    border-bottom: 1px solid var(--border);
    border-radius: var(--radius-lg);
    transform-origin: center;
  }
  .media-overlay__scroll { max-height: 90dvh; }
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
  .media-overlay { backdrop-filter: none; }
}
</style>
