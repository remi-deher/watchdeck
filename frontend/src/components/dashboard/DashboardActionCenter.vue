<template>
  <section class="dashboard-action-center" :class="{clear:!attentionCount}">
    <header class="dashboard-section-head">
      <div><span>Priorité</span><h2>À traiter</h2><p>{{ attentionCount ? `${attentionCount} élément${attentionCount>1?'s':''} demande${attentionCount>1?'nt':''} votre attention.` : 'Aucune intervention nécessaire pour le moment.' }}</p></div>
      <StatusBadge :status="attentionCount?'warning':'active'" :label="attentionCount?`${attentionCount} à traiter`:'Tout est en ordre'"/>
    </header>

    <div v-if="attentionCount" class="dashboard-action-grid">
      <section v-if="pending.length" class="action-stack">
        <div class="action-stack-head"><div><strong>Approbations</strong><span>{{ pending.length }} demande{{ pending.length>1?'s':'' }}</span></div><RouterLink to="/library?status=pending_approval">Tout voir</RouterLink></div>
        <article v-for="row in pending.slice(0,3)" :key="row.id" class="dashboard-action-row">
          <div><strong>{{ row.title }}</strong><span v-if="requesterName(row)">{{ requesterName(row) }}</span></div>
          <div class="actions"><UiButton icon-only class="success" title="Approuver" aria-label="Approuver" @click="$emit('action',row,'approve')"><Check/></UiButton><UiButton variant="danger" icon-only title="Refuser" aria-label="Refuser" @click="$emit('action',row,'reject')"><X/></UiButton></div>
        </article>
      </section>

      <section v-if="blocked.length" class="action-stack is-danger">
        <div class="action-stack-head"><div><strong>Téléchargements bloqués</strong><span>{{ blocked.length }} intervention{{ blocked.length>1?'s':'' }}</span></div><RouterLink to="/downloads">Ouvrir la file</RouterLink></div>
        <article v-for="row in blocked.slice(0,3)" :key="row.id||row.queue_id||row.title" class="dashboard-action-row">
          <div><strong>{{ row.title }}</strong><span>{{ row.instance || 'Sonarr / Radarr' }} · {{ reason(row) }}</span></div>
          <StatusBadge status="blocked" label="À vérifier"/>
        </article>
      </section>

      <RouterLink v-if="failedCount" class="action-summary-link" :to="{path:'/library',query:{status:'failed'}}"><AlertTriangle/><div><strong>{{ failedCount }} demande{{ failedCount>1?'s':'' }} en échec</strong><span>Consulter et relancer les demandes concernées</span></div><ChevronRight/></RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { requesterName } from '@/utils/userLabels';
import UiButton from '@/components/ui/UiButton.vue';
import { computed } from 'vue';
import { AlertTriangle, Check, ChevronRight, X } from '@lucide/vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';

export interface ActionRow {
  id?: number | string;
  queue_id?: number | string;
  title?: string;
  requested_by?: string;
  plex_user?: string;
  plex_user_id?: string;
  instance?: string;
  status?: string;
  tracked_state?: string;
  error?: string;
  waiting_reason?: string;
  [key: string]: any;
}

const props = withDefaults(
  defineProps<{
    pending?: ActionRow[];
    queue?: ActionRow[];
    failedCount?: number;
  }>(),
  {
    pending: () => [],
    queue: () => [],
    failedCount: 0,
  }
);
defineEmits<{
  (e: 'action', row: ActionRow, actionType: 'approve' | 'reject'): void;
}>();
const blocked = computed(() =>
  props.queue.filter((row) => {
    const value = `${row.status || ''} ${row.tracked_state || ''}`.toLowerCase();
    return Boolean(row.error) || ['error', 'warning', 'failed', 'importpending'].some((key) => value.includes(key));
  })
);
const attentionCount = computed(() => props.pending.length + blocked.value.length + Number(props.failedCount || 0));
function reason(row: ActionRow): string {
  return (
    row.error ||
    row.waiting_reason ||
    ((row.tracked_state || '').toLowerCase() === 'importpending' ? 'Import en attente' : 'Téléchargement en erreur')
  );
}
</script>
