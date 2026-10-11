<template>
  <!-- Barre fine en haut de l'ecran, allumee tant qu'une destination se charge. Elle
       n'apparait qu'apres un court delai (voir `useNavigationFeedback`) et avance par
       `transform`, sans recalcul de mise en page. -->
  <Transition name="nav-progress">
    <div v-if="active" class="ui-nav-progress" role="progressbar" aria-label="Chargement de la page" aria-busy="true">
      <span class="ui-nav-progress__bar" />
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{ active: boolean }>();
</script>

<style scoped lang="scss">
.ui-nav-progress {
  position: fixed;
  inset: 0 0 auto 0;
  z-index: var(--z-toast, 1000);
  height: 3px;
  overflow: hidden;
  pointer-events: none;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}
.ui-nav-progress__bar {
  display: block;
  width: 45%;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--accent);
  animation: nav-progress-slide 1.1s var(--motion-ease-standard) infinite;
}
@keyframes nav-progress-slide {
  from { transform: translateX(-100%); }
  to { transform: translateX(230%); }
}
.nav-progress-enter-active { transition: opacity var(--motion-duration-fast) var(--motion-ease-standard); }
.nav-progress-leave-active { transition: opacity var(--motion-duration-base) var(--motion-ease-standard); }
.nav-progress-enter-from,
.nav-progress-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .ui-nav-progress__bar { width: 100%; animation: none; opacity: 0.7; }
}
</style>
