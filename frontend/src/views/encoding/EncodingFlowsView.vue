<template>
  <!-- Flows FileFlows en lecture : etapes, revision, bibliotheques qui les utilisent.
       L'edition reste dans FileFlows (son editeur graphique). -->
  <EncodingShell title="Flows">
    <UiFeedback v-if="flowsQuery.isError.value" type="error" :message="humanizeError(flowsQuery.error.value)" />
    <p v-else-if="flowsQuery.isPending.value" class="flows-muted">Chargement des flows…</p>
    <template v-else>
      <p class="flows-muted">
        Les flows se modifient dans FileFlows. Pour tester un flow sur un fichier sans changer de bibliothèque,
        utilisez « Relancer avec un autre flow » depuis l'onglet Encodage d'une fiche média.
      </p>
      <UiChipGroup label="Afficher" :options="viewOptions" :model-value="view" @update:model-value="(value) => (view = String(value))" />
      <article v-for="flow in shown" :key="flow.uid" class="flow" :class="{ 'is-unused': !flow.used_by.length }">
        <header class="flow-head">
          <Workflow aria-hidden="true" />
          <strong>{{ flow.name }}</strong>
          <span v-if="flow.revision" class="flow-rev">révision {{ flow.revision }}</span>
          <span class="flow-spacer" />
          <small v-if="flow.modified">Modifié {{ formatRelativeDate(flow.modified) }}</small>
        </header>
        <p v-if="flow.description" class="flow-desc">{{ flow.description }}</p>
        <div class="flow-used">
          <span v-if="!flow.used_by.length" class="flows-muted">Utilisé par aucune bibliothèque</span>
          <span v-for="name in flow.used_by" :key="name" class="flow-chip">{{ name }}</span>
        </div>
        <details class="flow-steps">
          <summary>{{ flow.steps.length }} étapes</summary>
          <ol><li v-for="(step, index) in flow.steps" :key="index">{{ step }}</li></ol>
        </details>
      </article>
    </template>
  </EncodingShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { Workflow } from '@lucide/vue';
import { api } from '@/api';
import { useFileflowsStatus } from '@/composables/useFileflows';
import { queryKeys } from '@/queryKeys';
import { humanizeError } from '@/utils/apiError';
import { formatRelativeDate } from '@/utils/format';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
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
const view = ref('used');
const viewOptions = computed(() => [
  { value: 'used', label: `Utilisés (${flows.value.filter((f) => f.used_by.length).length})` },
  { value: 'all', label: `Tous (${flows.value.length})` },
]);
const shown = computed(() => flows.value.filter((flow) => view.value === 'all' || flow.used_by.length));
</script>

<style scoped lang="scss">
.flows-muted { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.flow { display: grid; gap: var(--space-2); padding: var(--space-3) var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); }
.flow.is-unused { background: var(--surface-2); }
.flow-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.flow-head svg { width: 16px; height: 16px; color: var(--muted); }
.flow-rev, .flow-head small { color: var(--muted); font-size: var(--fs-xs); }
.flow-spacer { flex: 1; }
.flow-desc { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.flow-used { display: flex; flex-wrap: wrap; gap: 6px; }
.flow-chip { padding: 2px 9px; border-radius: var(--radius-pill); background: var(--surface-2); font-size: var(--fs-xs); }
.flow-steps summary { cursor: pointer; color: var(--muted); font-size: var(--fs-sm); }
.flow-steps ol { margin: var(--space-2) 0 0; padding-left: 1.4rem; font-size: var(--fs-sm); }
</style>
