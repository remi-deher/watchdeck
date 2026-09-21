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
        <motion.div
          class="media-overlay__panel"
          role="dialog"
          aria-modal="true"
          :aria-label="ariaLabel"
          :initial="{ opacity: 0, y: 48, scale: 0.94 }"
          :animate="{ opacity: 1, y: 0, scale: 1 }"
          :exit="{ opacity: 0, y: 32, scale: 0.96 }"
          :transition="{ type: 'spring', stiffness: 260, damping: 28, mass: 0.9 }"
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
import { toRef } from 'vue';
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

defineEmits<{ (e: 'close'): void }>();

/* La page de fond reste visible mais ne defile plus : sans ce verrou, faire glisser la
   fiche entrainait la grille derriere elle, et l'on perdait la place qu'on voulait
   justement garder. */
useBodyScrollLock(toRef(props, 'open'));
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

@media (prefers-reduced-motion: reduce) {
  .media-overlay { backdrop-filter: none; }
}
</style>
