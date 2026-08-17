<template>
  <div class="my-requests-panel">
    <div class="sticky-stack">
      <div class="my-requests-toolbar">
        <MediaFiltersBar
          v-model:query="query"
          v-model:view="view"
          v-model:status-filters="statusFilters"
          v-model:type-filters="typeFilters"
          v-model:vf="vf"
          @search="onSearch"
        />
        <label class="sort-select">Trier par
          <select v-model="sort">
            <option value="recent">Plus récentes</option>
            <option value="oldest">Plus anciennes</option>
            <option value="title">Titre A→Z</option>
          </select>
        </label>
      </div>
    </div>

    <UiFeedback v-if="error" type="error" title="Impossible de charger vos demandes" :message="error" retry @retry="load" />
    <UiFeedback v-else-if="loading && !items.length" type="loading" message="Chargement de vos demandes…" />
    <p v-else class="my-requests-count" aria-live="polite">{{ sorted.length }} demande{{ sorted.length > 1 ? 's' : '' }} affichée{{ sorted.length > 1 ? 's' : '' }}</p>

    <section v-if="sorted.length" :class="view === 'grid' ? 'media-grid library-grid' : 'panel media-list'" :aria-busy="loading">
      <LibraryCard
        v-for="item in sorted"
        :key="item.id"
        :item="{ ...item, _kind: 'request' }"
        :view="view"
        :can-moderate="canModerate"
        :busy="busy"
        @open="openDetail"
        @act="act"
      />
    </section>

    <UiEmptyState v-else-if="!loading" title="Aucune demande" message="Vous n'avez pas encore fait de demande.">
      <template #action><UiButton variant="primary" @click="$emit('explore')">Explorer le catalogue</UiButton></template>
    </UiEmptyState>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api';
import { mediaDetailPath } from '@/mediaUrl';
import { useDebounced } from '@/composables/useDebounced';
import { useLatestRequest } from '@/composables/useLatestRequest';
import { useRealtimeList } from '@/composables/useRealtimeList';
import { canModerateSession, loadSession } from '@/composables/useSession';
import MediaFiltersBar from '@/components/media/MediaFiltersBar.vue';
import LibraryCard from '@/components/library/LibraryCard.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';

defineEmits<{
  (e: 'explore'): void;
}>();

const router = useRouter();
const request = useLatestRequest();

const items = ref<any[]>([]);
const canModerate = ref(false);
const plexUserId = ref('');
const loading = ref(false);
const busy = ref(false);
const error = ref('');

const query = ref('');
const statusFilters = ref<string[]>([]);
const typeFilters = ref<string[]>([]);
const vf = ref('');
const sort = ref('recent');
const view = ref(localStorage.getItem('library.view') || 'grid');

function _params(): URLSearchParams {
  const p = new URLSearchParams({ limit: '500', requesters: plexUserId.value });
  const q = query.value.trim();
  if (q) p.set('query', q);
  if (statusFilters.value.length) p.set('statuses', statusFilters.value.join(','));
  if (typeFilters.value.length) p.set('media_types', typeFilters.value.join(','));
  if (vf.value) p.set('vf', vf.value);
  return p;
}

async function load(): Promise<void> {
  if (!plexUserId.value) return;
  const { signal, isCurrent } = request.begin();
  loading.value = true;
  error.value = '';
  try {
    const payload = await api<{ items?: any[] }>(`/api/requests-list?${_params()}`, { signal });
    if (!isCurrent()) return;
    items.value = payload.items || [];
  } catch (e: any) {
    if (!request.isAbort(e) && isCurrent()) error.value = e?.message || String(e);
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

const sorted = computed(() => {
  const list = [...items.value];
  if (sort.value === 'oldest') list.sort((a, b) => (a.requested_at || '').localeCompare(b.requested_at || ''));
  else if (sort.value === 'title') list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  else list.sort((a, b) => (b.requested_at || '').localeCompare(a.requested_at || ''));
  return list;
});

function openDetail(item: any): void {
  router.push(mediaDetailPath(item, 'request', { discover: true }));
}

async function act(row: any, action: string): Promise<void> {
  busy.value = true;
  try {
    await api(`/api/requests/${row.id}/${action}`, { method: 'POST' });
    await load();
  } catch (e: any) {
    error.value = e?.message || String(e);
  } finally {
    busy.value = false;
  }
}

const scheduleLoad = useDebounced(load, 250);
function onSearch(): void {
  request.abort();
  scheduleLoad();
}

watch(view, (value) => localStorage.setItem('library.view', value));
watch([statusFilters, typeFilters, vf], () => load(), { deep: true });

useRealtimeList(items, ['request.updated', 'download.updated'], {
  keyFields: ['request_id', 'id'],
  onFallbackReload: () => load(),
});

onMounted(async () => {
  const session = await loadSession();
  canModerate.value = canModerateSession(session);
  plexUserId.value = session?.plex_user_id || '';
  await load();
});
</script>

<style scoped lang="scss">
.my-requests-panel {
  display: grid;
  gap: var(--space-4);
}
.my-requests-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}
.my-requests-toolbar .filters-panel {
  flex: 1 1 auto;
  min-width: 0;
}
.sort-select {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--muted);
  font-size: var(--fs-sm);
  font-weight: 600;
  white-space: nowrap;
}
.my-requests-count {
  margin: 0;
  color: var(--muted);
  font-size: var(--fs-sm);
  text-align: right;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: 40px 0;
  color: var(--muted);
  text-align: center;
}
:deep(.select-tag) {
  display: none;
}
@media (min-width: 1201px) {
  .library-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
