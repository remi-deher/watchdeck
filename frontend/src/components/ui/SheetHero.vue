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
      <!-- Grille : l'affiche, le texte a droite, et dessous le « dock » : les elements annexes
           (statut, dates, boutons), declares par `dock` et fournis chacun par un emplacement
           `dock-<cle>`. La limite est le bas de l'affiche : chaque element, dans l'ordre, se
           glisse a droite sous le texte tant qu'il tient sans la depasser ; le premier qui ne
           tient pas, et ceux qui le suivent, restent dessous, sur une ligne. Les mesures
           se refont en direct (largeur, texte replie ou deplie), avec une petite animation. -->
      <div class="sheet-hero__row" :class="[rowClass, { 'has-poster': $slots.poster }]">
        <div v-if="$slots.poster" ref="posterEl" class="sheet-hero__poster"><slot name="poster" /></div>
        <div ref="infoEl" class="sheet-hero__info">
          <div ref="mainEl" class="sheet-hero__main"><slot /></div>
          <div v-if="sideKeys.length" class="sheet-hero__aside">
            <div v-for="key in sideKeys" :key="key" class="sheet-hero__dock-item" :style="transitionName(key)"><slot :name="`dock-${key}`" /></div>
          </div>
        </div>
        <div v-if="belowKeys.length" class="sheet-hero__dock">
          <div v-for="key in belowKeys" :key="key" class="sheet-hero__dock-item" :style="transitionName(key)"><slot :name="`dock-${key}`" /></div>
        </div>
        <!-- Sonde : les memes elements, invisibles, a la largeur de la colonne de droite --
             on y lit leur hauteur et si l'un d'eux est vide. -->
        <div v-if="dock.length" ref="probeEl" class="sheet-hero__probe" aria-hidden="true" inert>
          <div v-for="key in dock" :key="key" class="sheet-hero__dock-item"><slot :name="`dock-${key}`" /></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useId, watch, type HTMLAttributes } from 'vue';
import UiHeroBackdrop from '@/components/ui/UiHeroBackdrop.vue';

const props = withDefaults(
  defineProps<{
    imageUrl?: string | null;
    variant?: 'card' | 'sheet';
    position?: string;
    minHeight?: string;
    /** Empile affiche et texte, centres, sous la largeur tablette (fiche media). */
    stackOnMobile?: boolean;
    /** Deborde des marges de `SheetPage` pour toucher les bords de la feuille. */
    bleed?: boolean;
    /** Elements annexes, dans l'ordre : chacun est fourni par l'emplacement `dock-<cle>`. */
    dock?: string[];
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
    dock: () => [],
    fade: false,
    bannerClass: undefined,
    contentClass: undefined,
    rowClass: undefined,
  },
);

/* ---- Le dock : a droite de l'affiche s'il tient, sinon dessous ---- */
const GAP_PX = 12;
const uid = useId();
const posterEl = ref<HTMLElement | null>(null);
const infoEl = ref<HTMLElement | null>(null);
const mainEl = ref<HTMLElement | null>(null);
const probeEl = ref<HTMLElement | null>(null);
/* Sans mesure possible (premiere image, tests), tout reste dessous : c'est la disposition sure. */
const present = ref<string[]>([...props.dock]);
const placement = reactive<Record<string, 'side' | 'below'>>({});
const sideKeys = computed(() => present.value.filter((key) => placement[key] === 'side'));
const belowKeys = computed(() => present.value.filter((key) => placement[key] !== 'side'));
const transitionName = (key: string) => ({ viewTransitionName: `dock-${uid.replace(/[^a-zA-Z0-9]/g, '')}-${key}` });

function same(next: Record<string, 'side' | 'below'>, keys: string[]): boolean {
  return keys.length === present.value.length && keys.every((key, index) => key === present.value[index] && next[key] === placement[key]);
}
function apply(next: Record<string, 'side' | 'below'>, keys: string[]): void {
  const commit = () => {
    present.value = keys;
    for (const key of Object.keys(placement)) delete placement[key];
    Object.assign(placement, next);
  };
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const transition = typeof document !== 'undefined' ? (document as any).startViewTransition?.bind(document) : null;
  if (!transition || reduced || !Object.keys(placement).length) commit();
  else transition(async () => { commit(); await nextTick(); });
}

function measure(): void {
  const probe = probeEl.value;
  const main = mainEl.value;
  if (!probe || !main || !props.dock.length) return;
  const items = [...probe.children] as HTMLElement[];
  const keys = props.dock.filter((_, index) => items[index] && (items[index].childElementCount > 0 || (items[index].textContent || '').trim()));
  const info = infoEl.value;
  if (info) probe.style.width = `${info.clientWidth}px`;
  const poster = posterEl.value?.getBoundingClientRect();
  /* La limite : le bas de l'affiche. Sans affiche mesurable, ou si le texte la depasse deja
     (empile sur telephone), rien ne se glisse a droite. */
  let open = Boolean(poster && poster.height > 0);
  let y = main.getBoundingClientRect().bottom + GAP_PX;
  const next: Record<string, 'side' | 'below'> = {};
  for (const key of keys) {
    const height = items[props.dock.indexOf(key)].offsetHeight;
    if (open && poster && y + height <= poster.bottom + 0.5) {
      next[key] = 'side';
      y += height + GAP_PX;
    } else {
      open = false;
      next[key] = 'below';
    }
  }
  if (!same(next, keys)) apply(next, keys);
}

let frame = 0;
function schedule(): void {
  if (typeof requestAnimationFrame !== 'function') return;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(measure);
}
let observer: ResizeObserver | null = null;
onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return;
  observer = new ResizeObserver(schedule);
  for (const el of [posterEl.value, infoEl.value, mainEl.value, probeEl.value]) if (el) observer.observe(el);
  void nextTick(measure);
});
onBeforeUnmount(() => { observer?.disconnect(); if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame); });
watch(() => props.dock.join('|'), () => { present.value = [...props.dock]; void nextTick(measure); });
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.sheet-hero {
  /* Hauteur dont l'affiche remonte sur la banniere (sans fade). */
  --sheet-hero-overlap: 120px;
  --sheet-hero-pad-x: 28px;
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
  box-sizing: border-box;
  padding-inline: var(--sheet-hero-pad-x);
}
.sheet-hero__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
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
  grid-row: 1;
  min-width: 0;
  padding-top: var(--space-4);
}
.sheet-hero__row.has-poster .sheet-hero__info { grid-column: 2; }
/* Le dock : a droite sous le texte (colonne), ou dessous sur toute la largeur (ligne). */
.sheet-hero__aside { display: grid; gap: var(--space-3); margin-top: var(--space-3); }
.sheet-hero__dock {
  grid-column: 1 / -1;
  grid-row: 2;
  position: relative;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3) var(--space-5);
}
.sheet-hero__dock-item { min-width: 0; }
.sheet-hero__probe { position: absolute; left: 0; top: 0; display: grid; gap: var(--space-3); visibility: hidden; pointer-events: none; }

/* Fondu : l'image s'etend derriere le haut de la fiche et s'efface vers le bas.
   L'affiche et le texte s'installent haut sur le fond pour eliminer le vide
   superieur sans couper l'arriere-plan. */
.sheet-hero.is-fade {
  --sheet-hero-banner-h: clamp(320px, 44dvh, 440px);
  --sheet-hero-fade-depth: clamp(280px, 39dvh, 395px);
}
.sheet-hero.is-fade .sheet-hero__banner,
.sheet-hero.is-fade.is-sheet .sheet-hero__banner {
  min-height: var(--sheet-hero-banner-h);
}
.sheet-hero.is-fade .sheet-hero__content {
  margin-top: calc(-1 * var(--sheet-hero-fade-depth));
  padding-top: var(--space-2);
}
.sheet-hero.is-fade .sheet-hero__poster {
  margin-top: 0;
}
.sheet-hero.is-fade .sheet-hero__info {
  padding-top: var(--space-2);
}

@include bp.until(tablet) {
  .sheet-hero {
    --sheet-hero-overlap: 70px;
    --sheet-hero-pad-x: 16px;
  }
  .sheet-hero__banner,
  .sheet-hero.is-sheet .sheet-hero__banner {
    min-height: clamp(150px, 28vh, 230px);
  }
  .sheet-hero__row { column-gap: 12px; }
  .sheet-hero.is-stacked { --sheet-hero-overlap: 90px; }
  .sheet-hero.is-fade {
    --sheet-hero-banner-h: clamp(260px, 36dvh, 340px);
    --sheet-hero-fade-depth: clamp(230px, 32dvh, 305px);
  }
  .sheet-hero.is-fade .sheet-hero__banner,
  .sheet-hero.is-fade.is-sheet .sheet-hero__banner {
    min-height: var(--sheet-hero-banner-h);
  }
  /* Empile, centre : affiche, texte, puis le dock sur toute la largeur. */
  .sheet-hero.is-stacked .sheet-hero__row {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .sheet-hero.is-stacked .sheet-hero__info { width: 100%; padding-top: 0; }
  .sheet-hero.is-stacked .sheet-hero__dock { width: 100%; justify-content: center; }
}

@include bp.from(tablet) {
  .sheet-hero {
    --sheet-hero-pad-x: 28px;
  }
  .sheet-hero.is-sheet:not(.is-fade) .sheet-hero__banner {
    min-height: min(36dvh, 340px);
  }
  .sheet-hero.is-stacked { --sheet-hero-overlap: 150px; }
}
</style>
