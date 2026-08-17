<template>
  <PageShell
    title="Problèmes signalés"
    description="Gestion des signalements utilisateur et problèmes remontés."
    eyebrow="Administration"
    :error="error"
    retry
    @retry="load"
  >

    <FilterBar :active-count="statusFilter ? 1 : 0" :result-count="issues.length" @reset="resetFilters">
      <template #filters><select v-model="statusFilter" @change="load">
        <option value="">Tous les statuts</option>
        <option value="open">Ouverts</option>
        <option value="investigating">En cours</option>
        <option value="closed">Clos</option>
      </select></template>
    </FilterBar>

    <section class="panel table-wrap table-cards rich">
      <table>
        <thead>
          <tr>
            <th>Média / Type</th>
            <th>Message</th>
            <th>Statut</th>
            <th>Date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="issue in issues" :key="issue.id">
            <td class="card-title">
              <strong>{{ issue.media_title || issue.issue_type }}</strong>
            </td>
            <td data-label="Message">{{ issue.message || 'Sans commentaire' }}</td>
            <td data-label="Statut">
              <StatusBadge :status="issue.status" />
            </td>
            <td data-label="Date">{{ formatDate(issue.created_at) }}</td>
            <td class="actions card-actions">
              <UiButton variant="ghost" icon-only title="Prendre en charge" aria-label="Prendre en charge" v-if="issue.status !== 'investigating' && issue.status !== 'closed'" @click="updateIssue(issue, 'investigating')"><ScanSearch /></UiButton>
              <UiButton variant="ghost" icon-only title="Relancer" aria-label="Relancer" v-if="issue.status !== 'closed'" @click="retryIssue(issue)"><RotateCcw /></UiButton>
              <UiButton variant="ghost" icon-only class="success" title="Clore" aria-label="Clore" v-if="issue.status !== 'closed'" @click="updateIssue(issue, 'closed')"><Check /></UiButton>
            </td>
          </tr>
        </tbody>
      </table>
      <UiEmptyState v-if="!loading && !issues.length" message="Aucun signalement." />
    </section>
  </PageShell>
</template>

<script setup lang="ts">
import { formatDateTime as formatDate } from '@/utils/format';
import { onMounted, ref } from 'vue';
import { Check, RotateCcw, ScanSearch } from '@lucide/vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';

interface Issue {
  id: number | string;
  media_title?: string;
  issue_type?: string;
  message?: string;
  status?: string;
  created_at?: string;
}

const issues = ref<Issue[]>([]);
const loading = ref(false);
const error = ref('');
const statusFilter = ref('open');
function resetFilters(): void { statusFilter.value = ''; load(); }

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const url = `/api/media/issues${statusFilter.value ? '?status=' + statusFilter.value : ''}`;
    issues.value = await api(url);
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function updateIssue(issue: Issue, status: string): Promise<void> {
  try {
    await api(`/api/media/issues/${issue.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load();
  } catch (e: any) {
    error.value = e.message;
  }
}

async function retryIssue(issue: Issue): Promise<void> {
  try {
    await api(`/api/media/issues/${issue.id}/retry`, { method: 'POST' });
    await load();
  } catch (e: any) {
    error.value = e.message;
  }
}

onMounted(load);
useRealtime(['request.updated'], () => load());
</script>
