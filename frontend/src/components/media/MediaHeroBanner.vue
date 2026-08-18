<template>
  <section
    v-if="activeItem"
    class="media-hero-banner"
    tabindex="0"
    @mouseenter="pauseAutoplay"
    @mouseleave="resumeAutoplay"
    @focusin="pauseAutoplay"
    @focusout="resumeAutoplay"
    @keydown.left="prev"
    @keydown.right="next"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
  >
    <div class="hero-slider">
      <Transition :name="transitionName">
        <div class="hero-slide" :key="itemKey">
          <div class="hero-backdrop" :style="backdropStyle" />
          <div class="hero-shade" />
          <div class="hero-content">
            <span class="eyebrow">{{ eyebrowText }}</span>
            <h1>{{ activeItem.title || activeItem.name }}</h1>
            <p v-if="activeItem.overview" class="hero-overview">{{ activeItem.overview }}</p>
            <div class="hero-meta">
              <MediaStatusBadge v-if="showStatus" :item="activeItem" />
              <span v-if="activeItem.year">{{ activeItem.year }}</span>
              <span v-if="activeItem.vote">★ {{ Number(activeItem.vote).toFixed(1) }}</span>
              <span v-else-if="mediaTypeLabel">{{ mediaTypeLabel }}</span>
            </div>
            <div class="hero-actions" @pointerdown.stop>
              <RouterLink v-if="to" class="primary hero-btn" :to="to">Voir la fiche</RouterLink>
              <button v-else class="primary hero-btn" type="button" @click="$emit('open', activeItem)">Voir la fiche</button>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Points de pagination -->
    <div
      v-if="normalizedItems.length > 1"
      class="hero-dots"
      role="tablist"
      aria-label="Sélection à la une"
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
    >
      <button
        v-for="(_, i) in normalizedItems"
        :key="i"
        type="button"
        role="tab"
        class="hero-dot"
        :class="{ active: i === activeIndex }"
        :aria-selected="i === activeIndex"
        :aria-label="`Voir la sélection ${i + 1}`"
        @click.stop="goTo(i)"
      />
    </div>
  </section>
  <div v-else-if="loading" class="media-hero-banner hero-loading" aria-label="Chargement de la sélection" />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { mediaDetailPath } from '@/mediaUrl';
import MediaStatusBadge from '@/components/media/MediaStatusBadge.vue';

const props = withDefaults(
  defineProps<{
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

const AUTOPLAY_MS = 7000;
const LABELS: Record<string, string> = { movie: 'Film', show: 'Série', artist: 'Artiste', album: 'Album', track: 'Titre' };

const normalizedItems = computed(() => {
  if (props.items?.length) return props.items.filter(Boolean);
  if (props.item) return [props.item];
  return [];
});

const activeIndex = ref(0);
const direction = ref<'next' | 'prev'>('next');
const activeItem = computed(() => normalizedItems.value[activeIndex.value] || null);

const transitionName = computed(() => `hero-slide-${direction.value}`);

const itemKey = computed(() => {
  if (!activeItem.value) return 0;
  const id = activeItem.value.tmdb_id ?? activeItem.value.id ?? activeIndex.value;
  return `${activeItem.value.media_type || 'item'}-${id}-${activeIndex.value}`;
});

const backdropStyle = computed(() => {
  const url = activeItem.value?.backdrop_url || activeItem.value?.art_url;
  return url ? { backgroundImage: `url("${url}")` } : {};
});

const eyebrowText = computed(() => {
  if (props.eyebrow) return props.eyebrow;
  return 'À la une';
});

const mediaTypeLabel = computed(() => {
  const type = activeItem.value?.media_type;
  return type ? LABELS[type] || '' : '';
});

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

let timer: any = null;
const reducedMotion = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

const SWIPE_THRESHOLD = 35;
let dragStartX: number | null = null;
let dragStartY: number | null = null;
let isHorizontal: boolean | null = null;
let dragging = false;

function onPointerDown(event: PointerEvent): void {
  if (normalizedItems.value.length <= 1) return;
  if ((event.target as HTMLElement)?.closest('button, a, .hero-dots, .hero-actions')) return;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  isHorizontal = null;
  dragging = true;
  pauseAutoplay();
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging || dragStartX === null || dragStartY === null) return;
  const diffX = event.clientX - dragStartX;
  const diffY = event.clientY - dragStartY;

  if (isHorizontal === null && (Math.abs(diffX) > 8 || Math.abs(diffY) > 8)) {
    isHorizontal = Math.abs(diffX) > Math.abs(diffY);
  }

  if (isHorizontal && event.cancelable) {
    event.preventDefault();
  }
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging || dragStartX === null) return;
  const delta = event.clientX - dragStartX;
  if (isHorizontal && Math.abs(delta) >= SWIPE_THRESHOLD) {
    if (delta < 0) next();
    else prev();
  } else {
    resumeAutoplay();
  }
  dragging = false;
  dragStartX = null;
  dragStartY = null;
  isHorizontal = null;
}

function onPointerCancel(): void {
  dragging = false;
  dragStartX = null;
  dragStartY = null;
  isHorizontal = null;
  resumeAutoplay();
}

function goTo(index: number): void {
  if (index === activeIndex.value) return;
  direction.value = index > activeIndex.value ? 'next' : 'prev';
  activeIndex.value = index;
  resetAutoplay();
}

function next(): void {
  if (normalizedItems.value.length <= 1) return;
  direction.value = 'next';
  activeIndex.value = (activeIndex.value + 1) % normalizedItems.value.length;
  resetAutoplay();
}

function prev(): void {
  if (normalizedItems.value.length <= 1) return;
  direction.value = 'prev';
  activeIndex.value = (activeIndex.value - 1 + normalizedItems.value.length) % normalizedItems.value.length;
  resetAutoplay();
}

function startAutoplay(): void {
  if (reducedMotion || normalizedItems.value.length <= 1) return;
  stopAutoplay();
  timer = setInterval(() => {
    direction.value = 'next';
    activeIndex.value = (activeIndex.value + 1) % normalizedItems.value.length;
  }, AUTOPLAY_MS);
}

function stopAutoplay(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function pauseAutoplay(): void {
  stopAutoplay();
}

function resumeAutoplay(): void {
  startAutoplay();
}

function resetAutoplay(): void {
  stopAutoplay();
  startAutoplay();
}

watch(() => normalizedItems.value.length, (length) => {
  if (activeIndex.value >= length) {
    activeIndex.value = 0;
  }
  resetAutoplay();
});

onMounted(startAutoplay);
onUnmounted(stopAutoplay);
</script>

<style scoped lang="scss">
.media-hero-banner {
  position: relative;
  min-height: clamp(300px, 42vw, 460px);
  margin-bottom: var(--space-6);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
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
  display: flex;
  align-items: flex-end;
  border-radius: inherit;
  overflow: hidden;
}

.hero-backdrop {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center 20%;
  transform: scale(1.02);
  transition: transform 5s cubic-bezier(0.25, 1, 0.5, 1);
  will-change: transform;
}

.hero-slide:hover .hero-backdrop {
  transform: scale(1.05);
}

.hero-shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to top, rgba(9, 9, 11, 0.98) 0%, rgba(9, 9, 11, 0.65) 45%, rgba(9, 9, 11, 0.15) 100%),
    linear-gradient(to right, rgba(9, 9, 11, 0.88) 0%, rgba(9, 9, 11, 0.4) 50%, transparent 80%);
  pointer-events: none;
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
  color: #fff;
  font-size: clamp(1.5rem, 3.5vw, 2.3rem);
  font-weight: 800;
  line-height: 1.15;
  text-wrap: balance;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}

.hero-overview {
  margin: var(--space-1) 0 var(--space-2);
  color: rgba(255, 255, 255, 0.88);
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
  color: rgba(255, 255, 255, 0.8);
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

.hero-dots {
  position: absolute;
  right: var(--space-4);
  bottom: var(--space-4);
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  background: rgba(10, 12, 16, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.hero-dot {
  position: relative;
  display: block;
  box-sizing: border-box;
  width: 8px;
  min-width: 8px;
  max-width: 8px;
  height: 8px;
  min-height: 8px;
  max-height: 8px;
  flex: 0 0 8px;
  flex-shrink: 0;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.38);
  border: none;
  padding: 0;
  margin: 0;
  font-size: 0;
  line-height: 0;
  cursor: pointer;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.25s ease, box-shadow 0.25s ease;
}

/* Zone de clic tactile élargie */
.hero-dot::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 24px;
  height: 24px;
  border-radius: 50%;
}

.hero-dot:hover,
.hero-dot:focus-visible {
  background: rgba(255, 255, 255, 0.85);
}

.hero-dot:focus-visible {
  box-shadow: 0 0 0 2px var(--accent);
}

.hero-dot.active {
  width: 26px;
  min-width: 26px;
  max-width: 26px;
  height: 8px;
  min-height: 8px;
  max-height: 8px;
  flex: 0 0 26px;
  background: var(--accent);
  box-shadow: 0 0 12px rgba(229, 160, 13, 0.6);
  transform: none;
}

.hero-loading {
  background: var(--surface-2);
  animation: hero-pulse 1.5s ease-in-out infinite;
}

@keyframes hero-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 0.3; }
}

.hero-slide-next-enter-active,
.hero-slide-next-leave-active,
.hero-slide-prev-enter-active,
.hero-slide-prev-leave-active {
  transition: transform 0.48s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.38s ease;
  will-change: transform, opacity;
}

.hero-slide-next-enter-from {
  transform: translateX(100%);
  opacity: 0;
}
.hero-slide-next-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

.hero-slide-prev-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}
.hero-slide-prev-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .hero-slide-next-enter-active,
  .hero-slide-next-leave-active,
  .hero-slide-prev-enter-active,
  .hero-slide-prev-leave-active {
    transition: opacity 0.3s ease;
    transform: none !important;
  }
}

@media (max-width: 640px) {
  .media-hero-banner {
    min-height: clamp(320px, 58vh, 420px);
    border-radius: var(--radius-md);
  }
  .hero-backdrop {
    background-position: center 15%;
  }
  .hero-shade {
    background:
      linear-gradient(to top, rgba(9, 9, 11, 0.98) 0%, rgba(9, 9, 11, 0.75) 55%, rgba(9, 9, 11, 0.2) 100%),
      linear-gradient(to right, rgba(9, 9, 11, 0.7) 0%, transparent 100%);
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
    gap: 6px;
    padding: 4px 8px;
  }
  .hero-dot {
    width: 6px;
    min-width: 6px;
    max-width: 6px;
    height: 6px;
    min-height: 6px;
    max-height: 6px;
    flex: 0 0 6px;
  }
  .hero-dot.active {
    width: 20px;
    min-width: 20px;
    max-width: 20px;
    flex: 0 0 20px;
  }
}
</style>
