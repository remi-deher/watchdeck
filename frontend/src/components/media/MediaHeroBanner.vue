<template>
  <section
    v-if="activeItem"
    class="media-hero-banner"
    tabindex="0"
    @mouseenter="carousel.pause"
    @mouseleave="carousel.resume"
    @focusin="carousel.pause"
    @focusout="carousel.resume"
    @keydown.left="carousel.prev"
    @keydown.right="carousel.next"
    @pointerdown="carousel.onPointerDown"
    @pointermove="carousel.onPointerMove"
    @pointerup="carousel.onPointerUp"
    @pointercancel="carousel.onPointerCancel"
  >
    <div class="hero-slider">
      <Transition :name="transitionName">
        <UiHeroBackdrop
          :key="itemKey"
          class="hero-slide"
          :image-url="backdropOf(activeItem)"
          zoom-on-hover
        >
          <div class="hero-content">
            <span class="eyebrow">{{ eyebrow || 'À la une' }}</span>
            <h1>{{ activeItem.title || activeItem.name }}</h1>
            <p v-if="activeItem.overview" class="hero-overview">{{ activeItem.overview }}</p>
            <div class="hero-meta">
              <MediaStatusBadge v-if="showStatus" :item="activeItem" />
              <span v-if="activeItem.year">{{ activeItem.year }}</span>
              <span v-if="activeItem.vote">★ {{ Number(activeItem.vote).toFixed(1) }}</span>
              <span v-else-if="mediaTypeLabel">{{ mediaTypeLabel }}</span>
            </div>
            <div class="hero-actions" @pointerdown.stop>
              <RouterLink v-if="to" class="primary hero-btn" :to="to" @click="ouvrirEnSurface">Voir la fiche</RouterLink>
              <UiButton variant="primary" v-else class="hero-btn" @click="$emit('open', activeItem)">Voir la fiche</UiButton>
            </div>
          </div>
          <template #overlay>
            <UiCarouselDots
              v-if="normalizedItems.length > 1"
              class="hero-dots"
              :count="normalizedItems.length"
              :model-value="activeIndex"
              label="Sélection à la une"
              :item-label="(i) => `Voir la sélection ${i + 1}`"
              @update:model-value="carousel.goTo"
              @pointerdown.stop
              @pointermove.stop
              @pointerup.stop
            />
          </template>
        </UiHeroBackdrop>
      </Transition>
    </div>
  </section>
  <div v-else-if="loading" class="media-hero-banner hero-loading" aria-label="Chargement de la sélection" />
</template>

<script setup lang="ts">
import type { MediaRef } from '@/types';
import UiButton from '@/components/ui/UiButton.vue';
import { computed, watch } from 'vue';
import { mediaDetailPath } from '@/mediaUrl';
import { useRoute, useRouter } from 'vue-router';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import { memoriserApercu } from '@/composables/useFicheApercu';
import { useCarousel } from '@/composables/useCarousel';
import MediaStatusBadge from '@/components/media/MediaStatusBadge.vue';
import UiCarouselDots from '@/components/ui/UiCarouselDots.vue';
import UiHeroBackdrop from '@/components/ui/UiHeroBackdrop.vue';
import { proxyUrl } from '@/utils/mediaImage';

const props = withDefaults(
  defineProps<{
    media?: MediaRef;
    backdrop?: string | null;
    item?: any;
    items?: any[];
    loading?: boolean;
    eyebrow?: string;
    showStatus?: boolean;
    discoverContext?: boolean;
  }>(),
  {
    item: null,
    items: () => [],
    loading: false,
    eyebrow: '',
    showStatus: true,
    discoverContext: true,
  }
);

defineEmits<{
  (e: 'open', item: any): void;
}>();

const LABELS: Record<string, string> = { movie: 'Film', show: 'Série', artist: 'Artiste', album: 'Album', track: 'Titre' };

const normalizedItems = computed(() => {
  if (props.items?.length) return props.items.filter(Boolean);
  if (props.media) return [props.media];
  if (props.item) return [props.item];
  return [];
});

/* Defilement, clavier et glissement : la mecanique commune des carrousels. Un appui sur
   les pastilles ou le bouton ne lance pas de glissement. */
const carousel = useCarousel(() => normalizedItems.value.length, {
  ignoreSwipeFrom: 'button, a, .hero-dots, .hero-actions',
});
const activeIndex = carousel.index;
const activeItem = computed(() => normalizedItems.value[activeIndex.value] || null);

const transitionName = computed(() => `hero-slide-${carousel.direction.value}`);

const itemKey = computed(() => {
  if (!activeItem.value) return 0;
  const id = activeItem.value.tmdb_id ?? activeItem.value.id ?? activeIndex.value;
  return `${activeItem.value.media_type || 'item'}-${id}-${activeIndex.value}`;
});

const backdropOf = (item: any): string | null => proxyUrl(props.backdrop || item?.backdrop_url || null, { kind: 'backdrop' });
/* Les fonds sont charges d'avance : une diapositive qui entrait avant son image glissait
   vide, et le defilement montrait un trou le temps du chargement. Les images restent
   referencees pour que le navigateur les garde decodees. */
const prechargees = new Map<string, HTMLImageElement>();
watch(normalizedItems, (items) => {
  if (typeof Image === 'undefined') return;
  for (const item of items) {
    const url = backdropOf(item);
    if (!url || prechargees.has(url)) continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    prechargees.set(url, img);
  }
}, { immediate: true });

const mediaTypeLabel = computed(() => {
  const type = activeItem.value?.media_type;
  return type ? LABELS[type] || '' : '';
});

const router = useRouter();
const route = useRoute();

/* La fiche se pose par-dessus Explorer, comme depuis une affiche : suivi en lien simple,
   ce bouton REMPLACAIT la page par la fiche, qui s'affichait alors vide le temps de son
   chargement, et le retour reconstruisait Explorer entier -- affiches vides comprises.
   Le lien garde son adresse pour le clic milieu et « ouvrir dans un nouvel onglet ». */
function ouvrirEnSurface(event: MouseEvent): void {
  if (!to.value || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
  event.preventDefault();
  memoriserApercu(activeItem.value);
  ouvrirFiche(router, to.value as any, route.fullPath);
}

const to = computed(() => {
  if (!activeItem.value) return null;
  const item = activeItem.value;
  const kind =
    item._kind ||
    (item.library_id
      ? 'library'
      : item.request_id
      ? 'request'
      : props.discoverContext
      ? 'discover'
      : 'library');
  return mediaDetailPath(item, kind, { discover: props.discoverContext });
});
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.media-hero-banner {
  position: relative;
  min-height: clamp(300px, 42vw, 460px);
  margin-bottom: var(--space-6);
  border-radius: var(--radius-lg);
  overflow: hidden;
  touch-action: pan-y;
  user-select: none;
  outline: none;
}

.media-hero-banner:focus-visible {
  box-shadow: 0 0 0 2px var(--accent);
}

.hero-slider {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
}

.hero-slide {
  position: absolute;
  inset: 0;
}

.hero-content {
  position: relative;
  z-index: 2;
  max-width: 680px;
  padding: var(--space-6) var(--space-5) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.hero-content .eyebrow {
  color: var(--accent);
  font-size: var(--fs-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.hero-content h1 {
  margin: 0;
  color: var(--text);
  font-size: clamp(1.5rem, 3.5vw, 2.3rem);
  font-weight: 800;
  line-height: 1.15;
  text-wrap: balance;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}

/* Texte pose sur l'image : blanc. La banniere force le theme sombre (theme-dark-scope),
   ou --text est quasi blanc dans les deux themes ; un gris n'a pas de contraste fiable
   sur une photo. */
.hero-overview {
  margin: var(--space-1) 0 var(--space-2);
  color: var(--text);
  font-size: var(--fs-sm);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.hero-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  color: var(--text);
  font-size: var(--fs-xs);
  font-weight: 600;
}

.hero-actions {
  margin-top: var(--space-2);
  display: flex;
  gap: var(--space-3);
  position: relative;
  z-index: 2;
}

.hero-btn {
  align-self: flex-start;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
}

/* Le CTA du heros est un lien : la regle tactile globale de `_base.scss` ne vise que
   les `button`, et il restait a 38px de haut sur telephone. */
@media (pointer: coarse) {
  .hero-btn { min-height: var(--touch-target); }
}

/* Les pastilles se posent en bas a droite, au-dessus de l'image. */
.hero-dots {
  position: absolute;
  right: var(--space-4);
  bottom: var(--space-4);
  z-index: 10;
}

.hero-loading {
  background: var(--surface-2);
  animation: hero-pulse 1.5s ease-in-out infinite;
}

@keyframes hero-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 0.3; }
}

/* Les deux diapositives glissent ensemble, collees bord a bord : meme duree, meme
   courbe, et aucune ne s'efface. Le fondu a zero des deux cotes laissait voir le fond
   noir entre elles au milieu du mouvement -- le « trou » du defilement. */
.hero-slide-next-enter-active,
.hero-slide-next-leave-active,
.hero-slide-prev-enter-active,
.hero-slide-prev-leave-active {
  transition: transform 0.6s cubic-bezier(0.65, 0, 0.35, 1);
  will-change: transform;
}

.hero-slide-next-enter-from { transform: translateX(100%); }
.hero-slide-next-leave-to { transform: translateX(-100%); }
.hero-slide-prev-enter-from { transform: translateX(-100%); }
.hero-slide-prev-leave-to { transform: translateX(100%); }

@media (prefers-reduced-motion: reduce) {
  .hero-slide-next-enter-active,
  .hero-slide-next-leave-active,
  .hero-slide-prev-enter-active,
  .hero-slide-prev-leave-active {
    transition: opacity var(--motion-duration-base) var(--motion-ease-standard);
    transform: none !important;
  }
  /* Sans mouvement, un fondu enchaine : la sortante reste pleine sous l'entrante. */
  .hero-slide-next-enter-from,
  .hero-slide-prev-enter-from { opacity: 0; }
}

@include bp.until(phablet) {
  .media-hero-banner {
    min-height: clamp(320px, 58vh, 420px);
    border-radius: var(--radius-md);
  }
  .hero-content {
    padding: var(--space-4) var(--space-4) calc(var(--space-6) + 12px);
  }
  .hero-content h1 {
    font-size: clamp(1.4rem, 5.5vw, 1.8rem);
  }
  .hero-overview {
    -webkit-line-clamp: 2;
    font-size: var(--fs-xs);
  }
  .hero-dots {
    right: var(--space-3);
    bottom: var(--space-3);
  }
}
</style>
