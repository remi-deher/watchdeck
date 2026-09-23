<template>
  <slot />
</template>

<script setup lang="ts">
/**
 * Donne a la page de fond la route qu'elle affiche, et non celle de la fiche.
 *
 * `RouterView` sait rendre une autre route que la courante (sa prop `route`), mais
 * `useRoute()` ne le sait pas : il renvoie toujours la route globale. Posee derriere une
 * fiche, la mediatheque lisait donc l'adresse de la fiche, concluait qu'on avait quitte
 * sa recherche, et vidait sa grille -- pour la reconstruire entiere a la fermeture. Sur
 * mobile, c'etait une seconde de gel a chaque aller-retour, et la position perdue.
 *
 * On surcharge ici la meme cle d'injection que le routeur : tout `useRoute()` en dessous
 * lit la route de fond tant qu'une fiche est posee, puis la route courante.
 */
import { computed, inject, provide, reactive } from 'vue';
import { routeLocationKey, type RouteLocationNormalizedLoaded } from 'vue-router';

const props = defineProps<{ route?: RouteLocationNormalizedLoaded | null }>();

const courante = inject(routeLocationKey) as RouteLocationNormalizedLoaded;
const affichee = computed(() => props.route ?? courante);

// Meme forme que la route reactive du routeur : un objet dont chaque cle suit la source.
const portee = reactive(
  Object.fromEntries(
    (Object.keys(courante) as (keyof RouteLocationNormalizedLoaded)[]).map((cle) => [
      cle,
      computed(() => affichee.value[cle]),
    ]),
  ),
) as unknown as RouteLocationNormalizedLoaded;

provide(routeLocationKey, portee);
</script>
