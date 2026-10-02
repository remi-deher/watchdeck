<template>
  <div class="media-artwork" :class="size">
    <img v-if="src && !failed" :src="imageUrl" :alt="alt" loading="lazy" decoding="async" @error="failed=true">
    <component :is="fallbackIcon" v-else />
  </div>
</template>

<script setup lang="ts">
import { proxyUrl } from '@/utils/mediaImage';
import { Clapperboard, Music2 } from '@lucide/vue';
import { computed, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    src?: string;
    alt?: string;
    type?: string;
    size?: 'small' | 'medium' | 'history' | 'large' | string;
  }>(),
  {
    src: '',
    alt: '',
    type: '',
    size: 'medium',
  }
);
const failed = ref(false);
watch(() => props.src, () => { failed.value = false; });
const fallbackIcon = computed(() => (props.type === 'track' ? Music2 : Clapperboard));

/* Largeur demandee au serveur : trois fois celle du cadre, pour un ecran a haute densite
   sans telecharger l'image pleine. `/api/playback/thumb` est servie par l'application
   elle-meme : `proxyUrl` la laissait telle quelle et l'on recevait la capture Plex
   entiere (1800 px), reduite 7 fois par le navigateur -- d'ou une vignette crenelee. */
const FRAME_WIDTHS: Record<string, number> = { small: 42, medium: 54, history: 64, large: 104, poster: 210 };
const imageUrl = computed(() => {
  if (!props.src) return undefined;
  const width = Math.min(1600, (FRAME_WIDTHS[props.size] || 104) * 3);
  if (props.src.startsWith('/api/playback/thumb')) {
    return `${props.src}${props.src.includes('?') ? '&' : '?'}width=${width}`;
  }
  return proxyUrl(props.src, { width }) ?? undefined;
});
</script>

<style scoped lang="scss">
.media-artwork{display:grid;place-items:center;flex:none;overflow:hidden;border:0;border-radius:var(--radius-sm);background:linear-gradient(145deg,#252525,#121212);color:var(--muted)}.media-artwork.small{width:42px;height:58px}.media-artwork.medium{width:54px;height:76px}.media-artwork.history{width:64px;height:92px}.media-artwork.large{width:104px;height:150px}.media-artwork.poster{width:100%;height:100%;border-radius:0}.media-artwork img{width:100%;height:100%;object-fit:cover}.media-artwork svg{width:30%;height:auto}@container page (max-width: 444px) {.media-artwork.history{width:58px;height:84px}}
</style>
