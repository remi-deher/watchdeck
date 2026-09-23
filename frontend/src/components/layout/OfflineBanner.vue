<template>
  <Transition name="offline-banner">
    <p v-if="!enLigne" class="offline-banner" role="status">
      <WifiOff aria-hidden="true" />
      <span>Hors ligne — affichage des dernières données connues. Les actions reprendront au retour du réseau.</span>
    </p>
  </Transition>
</template>

<script setup lang="ts">
/**
 * Sans reseau, l'application reste consultable sur ses donnees conservees (voir
 * `offline/stockage`), mais rien ne peut partir vers le serveur : TanStack Query met les
 * requetes en pause jusqu'au retour de la connexion. Le bandeau le dit, pour qu'une
 * donnee un peu ancienne ou un bouton sans effet ne passent pas pour une panne.
 */
import { useOnline } from '@vueuse/core';
import { WifiOff } from '@lucide/vue';

const enLigne = useOnline();
</script>

<style scoped>
.offline-banner {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 var(--space-3);
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--warning, #e0a300) 40%, transparent);
  border-radius: var(--radius-md);
  color: var(--text);
  background: color-mix(in srgb, var(--warning, #e0a300) 12%, transparent);
  font-size: var(--fs-sm);
}
.offline-banner svg { flex: none; width: 16px; height: 16px; }
.offline-banner-enter-active,
.offline-banner-leave-active { transition: opacity var(--motion-duration-fast) var(--motion-ease-standard); }
.offline-banner-enter-from,
.offline-banner-leave-to { opacity: 0; }
</style>
