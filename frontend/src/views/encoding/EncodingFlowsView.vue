<template>
  <!-- Flows FileFlows (gabarit Configurer), en lecture : revision, bibliotheques qui les
       utilisent, etapes depliables. L'edition reste dans l'editeur graphique de FileFlows ;
       pour essayer un flow sur un fichier, « Relancer avec un autre flow » depuis l'onglet
       Encodage d'une fiche media. -->
  <EncodingShell title="Flows" v-model:query="query" :search="{ placeholder: 'Rechercher un flow…', kind: 'filter', scope: 'Flows de l’encodage' }">
    <UiFeedback v-if="flowsQuery.isError.value" type="error" :message="humanizeError(flowsQuery.error.value)" />
    <ConfigureTemplate v-else :sections="sections" :query="query">
      <template #section-used>
        <p v-if="flowsQuery.isPending.value" class="flows-muted">Chargement des flows…</p>
        <ResourceList v-else :resources="used" empty-text="Aucun flow n’est utilisé par une bibliothèque.">
          <template #detail="{ resource }"><ol class="flow-steps"><li v-for="(step, index) in resource.steps" :key="index">{{ step }}</li></ol></template>
        </ResourceList>
      </template>
      <template #section-unused>
        <ResourceList :resources="unused" empty-text="Tous les flows sont utilisés.">
          <template #detail="{ resource }"><ol class="flow-steps"><li v-for="(step, index) in resource.steps" :key="index">{{ step }}</li></ol></template>
        </ResourceList>
      </template>
    </ConfigureTemplate>
  </EncodingShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { CircleOff, Workflow } from '@lucide/vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api';
import { useFileflowsStatus } from '@/composables/useFileflows';
import { queryKeys } from '@/queryKeys';
import { humanizeError } from '@/utils/apiError';
import { formatRelativeDate } from '@/utils/format';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import ConfigureTemplate, { type ConfigureResource } from '@/components/templates/ConfigureTemplate.vue';
import ResourceList from '@/components/templates/configure/ResourceList.vue';
import EncodingShell from '@/components/encoding/EncodingShell.vue';

interface Flow { uid: string; name: string; description: string; revision: number | null; modified: string | null; steps: string[]; used_by: string[] }

const { status } = useFileflowsStatus();
const flowsQuery = useQuery({
  queryKey: [...queryKeys.fileflows.all, 'flows'] as const,
  queryFn: ({ signal }) => api<{ flows: Flow[] }>('/api/fileflows/flows', { signal }),
  enabled: computed(() => Boolean(status.value?.connected)),
  staleTime: 60_000,
});
const flows = computed(() => flowsQuery.data.value?.flows || []);

/* Lecture seule : ni interrupteur ni « Modifier », les etapes en detail. */
function resource(flow: Flow): ConfigureResource {
  return {
    key: flow.uid,
    label: flow.name,
    subtitle: [flow.revision ? `révision ${flow.revision}` : null, flow.modified ? `modifié ${formatRelativeDate(flow.modified)}` : null, flow.description || null, `${flow.steps.length} étapes`].filter(Boolean).join(' · '),
    state: flow.used_by.length ? { tone: 'ok', text: flow.used_by.join(', ') } : { tone: 'off', text: 'Inutilisé' },
    editable: false,
    expandable: true,
    steps: flow.steps,
  };
}
const used = computed(() => flows.value.filter((flow) => flow.used_by.length).map(resource));
const unused = computed(() => flows.value.filter((flow) => !flow.used_by.length).map(resource));
const query = ref('');
const sections = computed(() => [
  { key: 'used', icon: Workflow, title: 'Flows utilisés', description: 'Ils se modifient dans FileFlows. Pour essayer un flow sur un fichier, « Relancer avec un autre flow » depuis l’onglet Encodage d’une fiche média.' },
  ...(unused.value.length ? [{ key: 'unused', icon: CircleOff, title: 'Flows inutilisés', description: 'Aucune bibliothèque ne les utilise.' }] : []),
]);
</script>

<style scoped lang="scss">
.flows-muted { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.flow-steps { margin: 0; padding-left: 1.4rem; }
</style>
