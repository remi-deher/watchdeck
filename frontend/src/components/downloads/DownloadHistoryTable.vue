<template>
  <section class="history-section" role="tabpanel" aria-label="Historique des téléchargements">
    <UiFeedback v-for="row in errors" :key="row.instance_id" type="error" :title="row.instance_name" message="Historique temporairement indisponible pour cette instance."/>
    <UiDataTable class="panel" label="Historique des téléchargements" :rows="rows" :columns="HISTORY_COLUMNS" :row-key="(row: any) => row.id" manual-sort :sort="sort" @update:sort="(value) => emit('update:sort', value || { key: 'completed', direction: 'desc' })">
      <template #empty><p class="empty">Aucun téléchargement terminé.</p></template>
      <template #cell-title="{ row }">
        <div class="history-item-wrap">
          <div class="history-poster-thumb">
            <img
              v-if="row.poster_url && !hasPosterError(row)"
              :src="proxyUrl(row.poster_url, { width: 120 }) ?? undefined"
              :alt="row.title"
              class="history-poster-img"
              loading="lazy"
              @error="onPosterError(row)"
            />
            <div v-else class="history-poster-fallback">
              <Film v-if="row.media_type==='movie'" />
              <Tv v-else />
            </div>
          </div>
          <div>
            <strong>{{ row.title }}</strong>
            <small v-if="row.year">{{ row.year }}</small>
          </div>
        </div>
      </template>
      <template #cell-type="{ row }">{{ mediaTypeLabel(row.media_type) }}</template>
      <template #cell-mode="{ row }"><span class="badge" :class="historyModeClass(row)">{{ historyModeLabel(row) }}</span></template>
      <template #cell-source="{ row }"><span class="badge">{{ row.source }}</span></template>
      <template #cell-instance="{ row }">{{ row.instance_name||'-' }}</template>
      <template #cell-completed="{ row }">{{ formatDate(row.completed_at) }}</template>
      <template #after><LoadMore :has-more="hasMore" :loading="loading" @load="emit('load-more')"/></template>
    </UiDataTable>
  </section>
</template>

<script setup lang="ts">
import { Film, Tv } from '@lucide/vue';
import LoadMore from '@/components/ui/LoadMore.vue';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import { usePosterErrors } from '@/composables/usePosterErrors';
import { historyModeClass, historyModeLabel } from '@/downloads/historyFormat';
import { mediaTypeLabel } from '@/utils/labels';
import { formatDateTime as formatDate } from '@/utils/format';
import { proxyUrl } from '@/utils/mediaImage';

defineProps<{
  rows: any[];
  errors: any[];
  hasMore: boolean;
  loading: boolean;
  /** Tri, fait par le serveur sur tout l'historique. */
  sort?: { key: string; direction: 'asc' | 'desc' } | null;
}>();
const emit = defineEmits<{
  (e: 'load-more'): void;
  (e: 'update:sort', value: { key: string; direction: 'asc' | 'desc' }): void;
}>();

const HISTORY_COLUMNS: UiColumn[] = [
  { key: 'title', label: 'Titre', card: 'title', sortable: true },
  { key: 'type', label: 'Type', sortable: true },
  { key: 'mode', label: 'Traitement', sortable: true },
  { key: 'source', label: 'Source', sortable: true },
  { key: 'instance', label: 'Instance', sortable: true },
  { key: 'completed', label: 'Terminé', sortable: true },
];

const { hasPosterError, onPosterError } = usePosterErrors();
</script>

<style scoped>
.history-item-wrap{display:flex;align-items:center;gap:10px}
.history-poster-thumb{width:36px;height:52px;border-radius:var(--radius-sm);overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.history-poster-img{width:100%;height:100%;object-fit:cover}
.history-poster-fallback svg{width:16px;height:16px;color:var(--muted)}
</style>
