<template>
  <!-- Couverture d'un média dans une ligne (derniers terminés, historique…) : l'affiche du
       média quand on le reçoit entier (MediaRef), sinon l'image fournie, sinon l'icône. -->
  <span class="media-cover" :class="`is-${size}`" aria-hidden="true">
    <img v-if="url && !failed" :src="url" alt="" loading="lazy" decoding="async" @error="failed = true" />
    <component :is="icon || Clapperboard" v-else />
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Clapperboard } from '@lucide/vue';
import { proxyUrl } from '@/utils/mediaImage';
import type { MediaRef } from '@/types';

const props = withDefaults(defineProps<{
  media?: MediaRef | null;
  /** Image hors média de la bibliothèque (capture Plex, pochette…). */
  src?: string | null;
  icon?: any;
  size?: 'sm' | 'md';
}>(), { media: null, src: null, icon: undefined, size: 'md' });

const failed = ref(false);
const source = computed(() => props.media?.poster_url || props.media?.backdrop_url || props.src || '');
watch(source, () => { failed.value = false; });

/* Trois fois la largeur du cadre pour un écran dense, sans charger l'image entière ; les
   captures servies par l'application (`/api/playback/thumb`) se redimensionnent à la source. */
const WIDTH = { sm: 40, md: 52 };
const url = computed(() => {
  if (!source.value) return undefined;
  const width = WIDTH[props.size] * 3;
  if (source.value.startsWith('/api/playback/thumb')) {
    const target = new URL(source.value, window.location.origin);
    target.searchParams.set('width', String(width));
    return target.pathname + target.search;
  }
  return proxyUrl(source.value, { width }) ?? undefined;
});
</script>

<style scoped lang="scss">
.media-cover { display: grid; flex: none; place-items: center; overflow: hidden; border-radius: var(--radius-sm); background: var(--surface-2); color: var(--muted); aspect-ratio: 2 / 3; }
.media-cover.is-sm { width: 32px; }
.media-cover.is-md { width: 44px; }
.media-cover img { width: 100%; height: 100%; object-fit: cover; }
.media-cover svg { width: 40%; height: 40%; }
</style>
