<template>
  <PageTemplate title="Mes demandes">
    <MyRequestsPanel @explore="router.push('/discover/movies')" />
  </PageTemplate>
</template>

<script setup lang="ts">
/* Mes demandes : le suivi de ce qu'on a demande, une page a part d'Explorer (le menu a sa
   propre entree). Son contenu est le panneau commun ; la page n'a ni recherche ni filtre. */
import { useRouter } from 'vue-router';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import MyRequestsPanel from '@/components/discover/MyRequestsPanel.vue';

const router = useRouter();
</script>
