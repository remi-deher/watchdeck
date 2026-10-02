<template>
  <div class="sheet-hero" :class="[`is-${variant}`, { 'is-stacked': stackOnMobile, 'is-bleed': bleed }]">
    <!-- En-tete commun des fiches (media, session de lecture...) : une banniere qui ne porte
         que l'image, l'affiche qui en chevauche le bas, et le texte dessous, sur le fond de
         la page. Pose sur l'image, le texte devenait illisible des qu'elle etait claire.
         Le contenu propre a chaque fiche (badges, dates, boutons) passe par les slots. -->
    <UiHeroBackdrop
      class="sheet-hero__banner"
      :class="bannerClass"
      :image-url="imageUrl || null"
      :position="position"
      :variant="variant"
      :min-height="minHeight"
    >
      <template v-if="$slots.overlay" #overlay><slot name="overlay" /></template>
    </UiHeroBackdrop>
    <div class="sheet-hero__content" :class="contentClass">
      <div class="sheet-hero__row" :class="rowClass">
        <div v-if="$slots.poster" class="sheet-hero__poster"><slot name="poster" /></div>
        <div class="sheet-hero__info"><slot /></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import UiHeroBackdrop from '@/components/ui/UiHeroBackdrop.vue';

withDefaults(
  defineProps<{
    imageUrl?: string | null;
    variant?: 'card' | 'sheet';
    position?: string;
    minHeight?: string;
    /** Empile affiche et texte, centres, sous la largeur tablette (fiche media). */
    stackOnMobile?: boolean;
    /** Deborde des marges de `SheetPage` pour toucher les bords de la feuille. */
    bleed?: boolean;
    bannerClass?: HTMLAttributes['class'];
    contentClass?: HTMLAttributes['class'];
    rowClass?: HTMLAttributes['class'];
  }>(),
  {
    imageUrl: null,
    variant: 'card',
    position: 'center 18%',
    minHeight: undefined,
    stackOnMobile: false,
    bleed: false,
    bannerClass: undefined,
    contentClass: undefined,
    rowClass: undefined,
  },
);
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.sheet-hero {
  /* Hauteur dont l'affiche remonte sur la banniere. */
  --sheet-hero-overlap: 120px;
}
/* Image seule : la banniere n'a plus a loger le texte. */
.sheet-hero__banner {
  min-height: clamp(180px, 28vw, 320px);
}
.sheet-hero.is-sheet .sheet-hero__banner {
  min-height: min(32dvh, 300px);
}
/* Dans une SheetPage : on annule ses marges (8px en haut, gouttieres sur les cotes). */
.sheet-hero.is-bleed.is-sheet .sheet-hero__banner {
  margin: -8px calc(-1 * max(18px, var(--safe-right))) 0 calc(-1 * max(18px, var(--safe-left)));
}
.sheet-hero__content {
  position: relative;
  z-index: 2;
  width: 100%;
}
.sheet-hero__row {
  display: flex;
  gap: var(--space-5);
  align-items: flex-start;
}
.sheet-hero__poster {
  flex: none;
  position: relative;
  z-index: 2;
  margin-top: calc(-1 * var(--sheet-hero-overlap));
}
.sheet-hero__info {
  flex: 1;
  min-width: 0;
  padding-top: var(--space-4);
}

@include bp.until(tablet) {
  .sheet-hero { --sheet-hero-overlap: 70px; }
  .sheet-hero__banner,
  .sheet-hero.is-sheet .sheet-hero__banner {
    min-height: clamp(150px, 28vh, 230px);
  }
  .sheet-hero__row { gap: 12px; }
  .sheet-hero.is-stacked { --sheet-hero-overlap: 90px; }
  .sheet-hero.is-stacked .sheet-hero__row {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .sheet-hero.is-stacked .sheet-hero__info { width: 100%; padding-top: 0; }
}

@include bp.from(tablet) {
  .sheet-hero.is-sheet .sheet-hero__banner {
    min-height: min(36dvh, 340px);
  }
  .sheet-hero.is-stacked { --sheet-hero-overlap: 150px; }
}
</style>
