<template>
  <!-- Historique des téléchargements (gabarit Comprendre) : qu'est-ce qui est arrivé, et
       quand ? Une chronologie par jour des téléchargements terminés, sans action ; la
       recherche est celle de la barre du haut. La file en cours est sur sa propre page. -->
  <PageTemplate
    title="Historique"
    v-model:query="query"
    :search="{ placeholder: 'Filtrer l’historique…', scope: 'Acquisition', kind: 'filter' }"
    :match-count="events.length"
    :total-count="history.length"
    :state="error ? 'error' : 'ready'"
    :error="error"
    @retry="load"
  >
    <UiFeedback v-for="entry in errors" :key="entry.instance_id" type="warning" :title="entry.instance_name" message="Historique temporairement indisponible pour cette instance." />
    <UnderstandTemplate
      :events="events"
      :exportable="false"
      :has-more="hasMore"
      :loading="loading"
      :loading-more="loading && history.length > 0"
      empty-title="Aucun téléchargement terminé"
      empty-message="Rien n’est encore arrivé dans la bibliothèque par ce chemin."
      @open="open"
      @load-more="loadMore"
    />
  </PageTemplate>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDownloadHistory } from '@/composables/useDownloadHistory';
import { historyToEvent } from '@/downloads/queueTrack';
import { queueDetailPath } from '@/downloads/queueRules';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import UnderstandTemplate, { type UnderstandEvent } from '@/components/templates/UnderstandTemplate.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';

const route = useRoute();
const router = useRouter();
const query = ref('');
const error = ref('');
const { history, errors, loading, hasMore, load, loadMore } = useDownloadHistory(() => ({ source: '', instanceId: '' }), (message) => { error.value = message; });
onMounted(() => { void load(); });

const events = computed<UnderstandEvent[]>(() => {
  const needle = query.value.trim().toLocaleLowerCase('fr');
  return history.value
    .filter((row) => row.completed_at && (!needle || String(row.title || '').toLocaleLowerCase('fr').includes(needle)))
    .map(historyToEvent);
});

/* Pas de détail propre : un téléchargement terminé mène à la fiche de son média. */
function open(event: UnderstandEvent): void {
  const row = history.value.find((entry) => String(entry.id) === event.key);
  const to = row && queueDetailPath(row);
  if (to) void router.push({ path: to, query: { from: route.fullPath } });
}
</script>
