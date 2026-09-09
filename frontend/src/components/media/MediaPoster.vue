<template>
  <div class="poster-shell" :class="{ 'is-loaded': isLoaded }">
    <img
      v-if="posterUrl && !failed"
      :src="proxyUrl(posterUrl, { width: 500 }) ?? undefined"
      :alt="alt"
      :sizes="sizes"
      loading="lazy"
      decoding="async"
      @load="isLoaded = true"
      @error="failed = true"
    >
    <!-- Une affiche morte laissait un cadre vide : le repli est desormais le meme que
         pour un media sans affiche. Il sert aux sources disparues dont le proxy n'a
         jamais eu de copie en cache. -->
    <div v-else class="poster-fallback">
      <Music2 v-if="isMusic" />
      <Film v-else />
    </div>
    <slot name="badges" />
    <slot name="overlay" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Film, Music2 } from '@lucide/vue';
import { proxyUrl } from '@/utils/mediaImage';

const props = withDefaults(
  defineProps<{
    posterUrl?: string | null;
    alt?: string;
    isMusic?: boolean;
    sizes?: string;
  }>(),
  {
    posterUrl: null,
    alt: '',
    isMusic: false,
    sizes: '(max-width: 639px) 46vw, (max-width: 1199px) 22vw, 180px',
  }
);

const isLoaded = ref(false);
const failed = ref(false);
// Une carte reutilisee pour un autre media doit retenter : `failed` porte sur l'affiche,
// pas sur le composant.
watch(() => props.posterUrl, () => { failed.value = false; isLoaded.value = false; });
</script>

<style scoped lang="scss">
.poster-shell {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
  background: var(--surface-2);
}

.poster-shell > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
  opacity: 0;
  transition: opacity 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: opacity;
}

.poster-shell.is-loaded > img {
  opacity: 1;
}

.poster-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  color: var(--muted);
}

@media (prefers-reduced-motion: reduce) {
  .poster-shell > img {
    transition: none;
    opacity: 1;
  }
}
</style>
