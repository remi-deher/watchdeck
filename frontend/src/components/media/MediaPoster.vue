<template>
  <div class="poster-shell" :class="{ 'is-loaded': isLoaded }">
    <img
      v-if="posterUrl && !failed"
      :src="proxyUrl(posterUrl, { width: 780 }) ?? undefined"
      :srcset="srcSetFor(posterUrl, { width: 780 })"
      :alt="alt"
      :sizes="sizes"
      loading="lazy"
      decoding="async"
      @load="isLoaded = true"
      @error="failed = true"
    >
    <!-- Le miroitement n'est rendu que tant qu'on attend une image. Il etait auparavant
         un pseudo-element eteint par `:not(:has(> img))` : cette condition se reevalue a
         chaque changement du document, et une grille qui se remplit au defilement en
         declenchait des rafales. Une condition portee par le composant coute zero calcul
         de style. -->
    <span v-if="posterUrl && !failed && !isLoaded" class="poster-shell__shimmer" aria-hidden="true"></span>
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
import { proxyUrl, srcSetFor } from '@/utils/mediaImage';

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

/* Le squelette devient l'affiche, il n'est pas remplace par elle.
 *
 * Le chargement se faisait en deux temps : une barre grise qui scintille, puis une
 * substitution nette. A chaque grille rechargee, la page clignotait. Ici le miroitement
 * vit dans le fond de la boite -- l'affiche se fond par-dessus, a la meme place et a la
 * meme taille, et rien ne saute.
 */
/* Le miroitement se deplace, il ne se repeint pas.
 *
 * Il animait `background-position`, qui n'est pas une propriete composee : le navigateur
 * redessinait chaque affiche a chaque image, vingt fois par grille. Sur Safari cela se
 * voyait -- l'ecran clignotait. Une bande large translatee en `transform` produit le meme
 * reflet en restant sur la couche graphique, sans un seul repaint.
 *
 * `overflow: hidden` est deja porte par `.poster-shell` : la bande deborde sans se voir.
 */
.poster-shell__shimmer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -40%;
  width: 60%;
  border-radius: inherit;
  background: linear-gradient(
    100deg,
    transparent 0%,
    color-mix(in srgb, var(--text, #fff) 7%, transparent) 50%,
    transparent 100%
  );
  animation: poster-shimmer 1.4s ease-in-out infinite;
  pointer-events: none;
  transition: opacity var(--motion-duration-base) var(--motion-ease-standard);
  will-change: transform;
}

@keyframes poster-shimmer {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(280%, 0, 0); }
}

@media (prefers-reduced-motion: reduce) {
  .poster-shell__shimmer { animation: none; }
}

.poster-shell > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
  opacity: 0;
  transition: opacity var(--motion-duration-base) var(--motion-ease-standard);
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
