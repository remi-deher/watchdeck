<template>
  <!-- Vue d'ensemble d'Acquisition (gabarit Surveiller) : tout va-t-il bien du côté de ce
       qui télécharge ? Le verdict n'apparaît que s'il y a quelque chose à traiter ; ce qui
       tourne passe dans le bandeau commun ; chaque point d'attention mène à la page qui le
       règle (la file, les clients, le stockage). Pas de liste : elles ont leurs pages. -->
  <PageTemplate title="Vue d’ensemble" :state="pageState" :error="error" @retry="reload">
    <MonitorTemplate
      :items="overview.items"
      :kpis="overview.kpis"
      :zones="overview.zones"
      :icons="overview.icons"
      :loading="pending"
      :labels="{ okTitle: 'Les téléchargements se passent bien', okDetail: 'Rien ne demande votre intervention.', kpisLabel: 'Indicateurs d’Acquisition', zonesLabel: 'Gestionnaires, indexeurs et clients', checkingTitle: 'Lecture des téléchargements…' }"
    >
      <template v-if="overview.live.length" #live>
        <LiveStrip :items="overview.live" title="Téléchargements en cours" live-label="En cours" :idle="{ title: 'Aucun téléchargement' }" @select="(item) => item.to && router.push(item.to)" />
      </template>
      <template v-if="volumes.length" #details><DiskSpacePanel :volumes="volumes" /></template>
    </MonitorTemplate>
  </PageTemplate>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAcquisitionOverview } from '@/composables/useAcquisitionOverview';
import DiskSpacePanel from '@/components/dashboard/DiskSpacePanel.vue';
import PageTemplate, { type PageState } from '@/components/templates/PageTemplate.vue';
import MonitorTemplate from '@/components/templates/MonitorTemplate.vue';
import LiveStrip from '@/components/ui/LiveStrip.vue';

const router = useRouter();
const { overview, volumes, pending, error, reload } = useAcquisitionOverview();
const pageState = computed<PageState>(() => (error.value && pending.value ? 'error' : 'ready'));
</script>
