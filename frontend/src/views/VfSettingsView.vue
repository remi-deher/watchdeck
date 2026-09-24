<template>
  <!-- Reglages des ameliorations VF, dans la feuille depuis la page des ameliorations, ou
       en pleine page par leur adresse. -->
  <SheetPage eyebrow="Améliorations VF" title="Réglages des améliorations VF" subtitle="Les mêmes réglages que la page Réglages — toute modification enregistrée ici s'y applique aussi.">
    <VfSettingsPanel @close="close" @saved="saved" />
  </SheetPage>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import SheetPage from '@/components/layout/SheetPage.vue';
import VfSettingsPanel from '@/components/vf-upgrades/VfSettingsPanel.vue';
import { useMediaOverlay } from '@/composables/useMediaOverlay';

const router = useRouter();
const { actif: enSurface, fermer } = useMediaOverlay();

function close(): void {
  if (enSurface.value) fermer();
  else void router.push('/vf-upgrades');
}

/* La page des ameliorations, restee derriere, relit sa liste : un reglage change ce que
   les cycles retiennent (seuil de confiance, garde-fous, portees). */
function saved(): void {
  window.dispatchEvent(new CustomEvent('watchdeck:vf-settings-saved'));
  close();
}
</script>
