<template>
  <div
    class="ui-hero-backdrop theme-dark-scope"
    :class="[`is-${variant}`, { 'is-zoomable': zoomOnHover }]"
    :style="rootStyle"
  >
    <div class="ui-hero-backdrop__image" :style="imageStyle" />
    <div class="ui-hero-backdrop__scrim" />
    <div class="ui-hero-backdrop__overlay">
      <slot name="overlay" />
    </div>
    <div class="ui-hero-backdrop__content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    imageUrl?: string | null;
    position?: string;
    minHeight?: string;
    variant?: 'card' | 'sheet';
    zoomOnHover?: boolean;
  }>(),
  {
    imageUrl: null,
    position: 'center 20%',
    minHeight: undefined,
    variant: 'card',
    zoomOnHover: false,
  }
);

const rootStyle = computed(() => (props.minHeight ? { minHeight: props.minHeight } : undefined));
const imageStyle = computed(() => ({
  backgroundImage: props.imageUrl ? `url("${props.imageUrl}")` : undefined,
  backgroundPosition: props.position,
}));
</script>

<style scoped lang="scss">
.ui-hero-backdrop {
  --hero-scrim-side-strong: rgba(9, 9, 11, 0.88);
  --hero-scrim-side-medium: rgba(9, 9, 11, 0.4);

  position: relative;
  display: flex;
  align-items: flex-end;
  min-height: clamp(300px, 42vw, 460px);
  overflow: hidden;
  background: var(--surface);
}

/* Pas de trait autour d'une image : le voile en dessine deja le bord, egal partout. */
.ui-hero-backdrop.is-card {
  border-radius: var(--radius-lg);
}

.ui-hero-backdrop__image,
.ui-hero-backdrop__scrim,
.ui-hero-backdrop__overlay {
  position: absolute;
  inset: 0;
}

.ui-hero-backdrop__image {
  background-size: cover;
  background-color: var(--surface);
}

/* Voile en deux temps. Une vignette identique sur les quatre bords : les anciens
   degrades (bas + gauche) assombrissaient deux cotes seulement, et le bord de la
   banniere paraissait lourd d'un cote, net de l'autre. Puis un voile plus dense, mais
   seulement dans le coin ou se pose le texte, pour qu'il reste lisible sur n'importe
   quelle image. Le voile couvre toute la banniere : pas de liseré ni de bordure. */
.ui-hero-backdrop__scrim {
  border-radius: inherit;
  /* Le texte d'une fiche (titre, badges, resume, boutons) occupe toute la moitie
     gauche, pas seulement le coin : un voile limite au coin le laissait illisible sur une
     image claire. Une ellipse large couvre donc la zone de texte, sur un voile uniforme
     qui assombrit l'image partout pareil -- le bord reste egal sur les quatre cotes. */
  background:
    radial-gradient(ellipse 80% 115% at 22% 62%, var(--hero-scrim-side-strong) 0%, var(--hero-scrim-side-medium) 55%, transparent 88%),
    linear-gradient(var(--hero-scrim-side-medium), var(--hero-scrim-side-medium));
  box-shadow: inset 0 0 64px 10px var(--hero-scrim-side-medium);
  pointer-events: none;
}

.ui-hero-backdrop__overlay {
  z-index: 2;
  pointer-events: none;
}

.ui-hero-backdrop__overlay :deep(*) {
  pointer-events: auto;
}

.ui-hero-backdrop__content {
  position: relative;
  z-index: 1;
  width: 100%;
}

.ui-hero-backdrop.is-zoomable .ui-hero-backdrop__image {
  transform: scale(1.02);
  transition: transform 5s cubic-bezier(0.25, 1, 0.5, 1);
  will-change: transform;
}

@media (hover: hover) and (pointer: fine) {
  .ui-hero-backdrop.is-zoomable:hover .ui-hero-backdrop__image {
    transform: scale(1.05);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ui-hero-backdrop.is-zoomable .ui-hero-backdrop__image {
    transform: none;
    transition: none;
  }
}
</style>
