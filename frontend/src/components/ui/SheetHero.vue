<template>
  <div class="sheet-hero" :class="[`is-${variant}`, { 'is-stacked': stackOnMobile, 'is-bleed': bleed, 'is-fade': fade }]">
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
      :fade="fade"
    >
      <template v-if="$slots.overlay" #overlay><slot name="overlay" /></template>
    </UiHeroBackdrop>
    <div class="sheet-hero__content" :class="contentClass">
      <!-- Grille : l'affiche, ce qui la prolonge dessous (`below`), le texte a droite, et
           `extra` au niveau de `below` quand le texte laisse de la place. Sans `extra`, le
           texte occupe toute la hauteur a droite. -->
      <div class="sheet-hero__row" :class="[rowClass, { 'has-poster': $slots.poster, 'has-extra': $slots.extra }]">
        <div v-if="$slots.poster" class="sheet-hero__poster"><slot name="poster" /></div>
        <div class="sheet-hero__info"><slot /></div>
        <div v-if="$slots.below" class="sheet-hero__below"><slot name="below" /></div>
        <div v-if="$slots.extra" class="sheet-hero__extra"><slot name="extra" /></div>
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
    /** Image plus haute qui s'efface vers le bas, derriere l'affiche et le texte. */
    fade?: boolean;
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
    fade: false,
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
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto 1fr;
  column-gap: var(--space-5);
  row-gap: var(--space-3);
  align-items: start;
}
.sheet-hero__row.has-poster { grid-template-columns: auto minmax(0, 1fr); }
.sheet-hero__poster {
  grid-column: 1;
  grid-row: 1;
  position: relative;
  z-index: 2;
  margin-top: calc(-1 * var(--sheet-hero-overlap));
}
.sheet-hero__info {
  grid-column: 1;
  grid-row: 1 / span 2;
  min-width: 0;
  padding-top: var(--space-4);
}
.sheet-hero__row.has-poster .sheet-hero__info { grid-column: 2; }
.sheet-hero__row.has-extra .sheet-hero__info { grid-row: 1; }
/* Sous l'affiche : sa largeur est celle de l'affiche, jamais plus (width 0 + min-width). */
.sheet-hero__below {
  grid-column: 1;
  grid-row: 2;
  position: relative;
  z-index: 2;
  width: 0;
  min-width: 100%;
}
.sheet-hero__extra { grid-column: 2; grid-row: 2; min-width: 0; }

/* Fondu : l'image est plus haute et se retire derriere l'affiche et le texte, qui
   commencent donc sur elle, a la meme hauteur. */
.sheet-hero { --sheet-hero-fade-depth: 240px; }
.sheet-hero.is-fade .sheet-hero__banner,
.sheet-hero.is-fade.is-sheet .sheet-hero__banner { min-height: clamp(380px, 56dvh, 600px); }
.sheet-hero.is-fade .sheet-hero__content { margin-top: calc(-1 * var(--sheet-hero-fade-depth)); }
.sheet-hero.is-fade .sheet-hero__poster { margin-top: 0; }

@include bp.until(tablet) {
  .sheet-hero { --sheet-hero-overlap: 70px; }
  .sheet-hero__banner,
  .sheet-hero.is-sheet .sheet-hero__banner {
    min-height: clamp(150px, 28vh, 230px);
  }
  .sheet-hero__row { column-gap: 12px; }
  .sheet-hero.is-stacked { --sheet-hero-overlap: 90px; --sheet-hero-fade-depth: 150px; }
  .sheet-hero.is-fade .sheet-hero__banner,
  .sheet-hero.is-fade.is-sheet .sheet-hero__banner { min-height: clamp(320px, 46dvh, 420px); }
  /* Empile, centre : affiche, ce qui est dessous, texte, puis le complement. */
  .sheet-hero.is-stacked .sheet-hero__row {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .sheet-hero.is-stacked .sheet-hero__info { width: 100%; padding-top: 0; }
  .sheet-hero.is-stacked .sheet-hero__below,
  .sheet-hero.is-stacked .sheet-hero__extra { width: 100%; min-width: 0; }
  .sheet-hero.is-stacked .sheet-hero__poster { order: 1; }
  .sheet-hero.is-stacked .sheet-hero__below { order: 2; }
  .sheet-hero.is-stacked .sheet-hero__info { order: 3; }
  .sheet-hero.is-stacked .sheet-hero__extra { order: 4; }
}

@include bp.from(tablet) {
  .sheet-hero.is-sheet .sheet-hero__banner {
    min-height: min(36dvh, 340px);
  }
  .sheet-hero.is-stacked { --sheet-hero-overlap: 150px; }
}
</style>
