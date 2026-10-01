<template>
  <!-- Le suivi des lots de séries et la résolution des conflits vivaient dans les
       réglages, sous « Exploitation ». Ce sont des tâches du quotidien : la page rejoint
       l'Acquisition, dont elle devient une section. -->
  <AppPage title="Acquisitions & conflits">
    <AcquisitionsConflictsTab />
  </AppPage>
</template>

<script setup lang="ts">
import AppPage from '@/components/ui/AppPage.vue';
import AcquisitionsConflictsTab from '@/components/settings/AcquisitionsConflictsTab.vue';
</script>
