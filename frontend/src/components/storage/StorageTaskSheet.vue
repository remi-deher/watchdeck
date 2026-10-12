<template>
  <!-- Fiche d'une tache de transfert (gabarit Fiche) : l'etat et les actions dans l'en-tete,
       l'avancement, les titres et les objectifs en onglets. -->
  <DetailTemplate
    variant="card"
    back
    eyebrow="Tâche de transfert"
    :title="taskName(job)"
    :icon="ArrowRightLeft"
    :meta="[`Tâche #${job.id}`, ctx.instanceName(job), method]"
    :badges="taskBadges(job, ctx)"
    :actions="actions"
    :alert="taskAlert(job, ctx)"
    :tabs="tabs"
    :tab="tab"
    :facts="facts"
    @update:tab="tab = $event"
    @back="$emit('back')"
    @action="(key) => $emit('action', key)"
  >
    <template #tab-progress>
      <p v-if="job.status === 'draft'" class="sheet-note">Tâche enregistrée, aucun transfert lancé.</p>
      <StorageTransferMetrics v-else :job="job" />
      <StoragePlexFinalization :job="job" :gb="ctx.gb" />
      <StorageCurrentMedia :job="job" :status="ctx.status" hero />
      <p v-if="armNote" class="sheet-note">{{ armNote }}</p>
      <section v-if="reasons.length" class="sheet-issues" aria-label="Titres à traiter">
        <h3>{{ issueItems(job).length }} titre(s) à traiter</h3>
        <ul>
          <li v-for="issue in reasons" :key="issue.reason">{{ issue.count }} titre(s) : {{ issue.reason }}<small>{{ adviceFor(issue.reason) }}</small></li>
        </ul>
        <p>Corrigez le motif, puis réessayez : les autres titres peuvent continuer.</p>
      </section>
    </template>

    <template #tab-titles>
      <UiDataTable v-if="job.items.length" density="compact" :label="`Titres de la tâche ${job.id}`" :rows="job.items" :columns="columns" :row-key="(row: any) => row.id">
        <template #cell-size="{ row }">{{ ctx.gb(row.size_bytes) }}</template>
        <template #cell-state="{ row }">{{ ctx.status(row.status) }}<small v-if="row.reason">{{ row.reason }}</small></template>
        <template #cell-updated="{ row }">{{ ctx.date(row.updated_at) }}</template>
        <template #cell-details="{ row }"><UiButton variant="ghost" :aria-label="`Détails de ${row.title}`" @click="detailItem = row">Détails</UiButton></template>
      </UiDataTable>
      <UiEmptyState v-else title="Aucun titre" message="Cette tâche ne contient aucun titre." compact />
    </template>

    <template #tab-goals>
      <dl class="sheet-goals">
        <dt>Objectif</dt>
        <dd>{{ goalLabel }} : {{ ctx.gb((job.params?.goal_gb || 0) * 1e9) }} {{ perSource ? 'par source' : 'au total' }}</dd>
        <template v-if="job.params?.target_titles"><dt>Répartition</dt><dd>{{ job.params.target_titles }} titres</dd></template>
        <template v-for="(value, root) in job.params?.root_goals || {}" :key="root"><dt>{{ root }}</dt><dd>{{ ctx.gb(Number(value) * 1e9) }}</dd></template>
        <dt>Dernière activité</dt><dd>{{ ctx.date(job.updated_at) }}</dd>
        <dt>Créé</dt><dd>{{ ctx.date(job.created_at) }}</dd>
        <dt>Début</dt><dd>{{ jobStart(job) ? ctx.date(jobStart(job)) : 'Non enregistré' }}</dd>
        <dt>Fin</dt><dd>{{ jobEnd(job) ? ctx.date(jobEnd(job)) : 'Non enregistrée' }}</dd>
      </dl>
    </template>
  </DetailTemplate>
  <StorageItemDialog :item="detailItem" :status="ctx.status" :date="ctx.date" :gb="ctx.gb" @close="detailItem = null" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowRightLeft } from '@lucide/vue';
import DetailTemplate from '@/components/templates/DetailTemplate.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
import StorageCurrentMedia from './StorageCurrentMedia.vue';
import StorageItemDialog from './StorageItemDialog.vue';
import StoragePlexFinalization from './StoragePlexFinalization.vue';
import StorageTransferMetrics from './StorageTransferMetrics.vue';
import { adviceFor, issueItems, issueReasons, jobEnd, jobStart, taskActions, taskAlert, taskBadges, taskName, type TaskContext } from '@/storage/storageTasks';

const props = defineProps<{ job: any; ctx: TaskContext }>();
defineEmits<{ action: [key: string]; back: [] }>();

const METHODS: Record<string, string> = { arr: 'API Sonarr / Radarr', rsync_ssh: 'Rsync par SSH', rsync_local: 'Rsync local' };
const method = computed(() => METHODS[props.job.params?.transfer_mode as string] || 'Rsync');
const actions = computed(() => taskActions(props.job));
const reasons = computed(() => issueReasons(props.job, props.ctx.status));
const perSource = computed(() => Object.keys(props.job.params?.root_goals || {}).length > 0 || props.job.params?.mode === 'minimum_free');
const goalLabel = computed(() => props.job.params?.mode === 'minimum_free' ? 'Espace libre minimum' : props.job.params?.objective_mode === 'selection' ? 'Sélection de titres' : 'Espace à libérer');
const armNote = computed(() => {
  const active = props.job.items.find((i: any) => ['arr_pending', 'copying'].includes(i.status));
  if (!active || props.job.params?.transfer_mode !== 'arr') return '';
  return `Déplacement en cours dans ${props.job.items.some((i: any) => i.media_type === 'series') ? 'Sonarr' : 'Radarr'}. La progression de copie n’est pas fournie ; le suivi compte les titres terminés.`;
});

const awaiting = computed(() => props.job.items.filter((i: any) => ['switching', 'plex_pending', 'cleaning'].includes(i.status)).reduce((n: number, i: any) => n + i.size_bytes, 0));
const facts = computed(() => [
  { label: 'Depuis', value: props.job.params?.source_roots?.join(' · ') || props.ctx.locationName(props.job.source_id) },
  { label: 'Vers', value: props.job.params?.destination_root || props.ctx.locationName(props.job.destination_id) },
  { label: 'Vérification', value: props.job.params?.verification === 'sha256' ? 'SHA 256' : 'Standard' },
  { label: 'Réellement libéré', value: props.ctx.gb(props.job.released_bytes || 0) + (awaiting.value ? ` · ${props.ctx.gb(awaiting.value)} en attente de suppression` : '') },
]);

const tab = ref('progress');
const tabs = computed(() => [
  { key: 'progress', label: 'Avancement' },
  { key: 'titles', label: 'Titres', count: props.job.items.length },
  { key: 'goals', label: 'Objectifs et dates' },
]);
const detailItem = ref<any>(null);
const columns: UiColumn[] = [
  { key: 'title', label: 'Titre', card: 'title' },
  { key: 'size', label: 'Volume' },
  { key: 'state', label: 'Étape / état' },
  { key: 'updated', label: 'Dernière activité', card: 'hidden' },
  { key: 'details', label: 'Détails', card: 'actions' },
];
</script>

<style scoped>
.sheet-note { margin: 0 0 var(--space-3); color: var(--muted); font-size: var(--fs-sm); overflow-wrap: anywhere; }
.sheet-issues { margin-top: var(--space-4); padding: var(--space-3); border: 1px solid var(--accent); border-radius: var(--radius-md); background: var(--surface-2); font-size: var(--fs-sm); }
.sheet-issues h3 { margin: 0; color: var(--accent); font-size: var(--fs-base); }
.sheet-issues small { display: block; color: var(--muted); }
.sheet-goals { display: grid; gap: var(--space-1); margin: 0; min-width: 0; }
.sheet-goals dt { margin-top: var(--space-2); color: var(--muted); font-size: var(--fs-sm); }
.sheet-goals dd { margin: 0; overflow-wrap: anywhere; }
</style>
