<!--
  Filet de securite autour de la vue courante.

  Sans lui, une erreur levee pendant le rendu d'une page detruit l'arbre Vue et laisse
  l'utilisateur devant un shell de navigation vide, sans message ni moyen de repartir.
  Le pire cas n'est pas l'erreur elle-meme : c'est qu'elle soit silencieuse.

  La capture est volontairement large (`onErrorCaptured` retourne `false` : l'erreur ne
  remonte pas plus haut) mais l'etat se reinitialise a chaque changement de route, pour
  qu'une page cassee n'emprisonne pas la navigation.
-->
<template>
  <UiEmptyState
    v-if="failed"
    title="Cette page n’a pas pu s’afficher"
    :message="detail || 'Une erreur inattendue est survenue pendant le rendu.'"
  >
    <template #action>
      <UiButton variant="primary" @click="retry">Réessayer</UiButton>
      <UiButton @click="reload">Recharger l’application</UiButton>
    </template>
  </UiEmptyState>
  <slot v-else :key="attempt" />
</template>

<script setup lang="ts">
import { onErrorCaptured, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import UiButton from './UiButton.vue';
import UiEmptyState from './UiEmptyState.vue';

const route = useRoute();
const failed = ref(false);
const detail = ref('');
/* Change de valeur a chaque reprise : remonter le sous-arbre est le seul moyen de
   rejouer un rendu qui a echoue. */
const attempt = ref(0);

onErrorCaptured((err) => {
  failed.value = true;
  detail.value = (err as any)?.message ? String((err as any).message) : '';
  // Toujours tracer : l'utilisateur voit un message lisible, le journal navigateur
  // garde la pile complete pour le diagnostic.
  console.error('[Watchdeck] erreur de rendu capturee', err);
  return false;
});

function retry(): void {
  failed.value = false;
  detail.value = '';
  attempt.value += 1;
}

function reload(): void {
  window.location.reload();
}

/* Naviguer ailleurs doit toujours fonctionner, meme si la page precedente a echoue. */
watch(() => route.fullPath, () => {
  if (failed.value) retry();
});
</script>
