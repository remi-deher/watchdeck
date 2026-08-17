<template>
  <aside class="torrent-sidebar-filters" aria-label="Filtres rapides">
    <div class="sidebar-head">
      <h3><Filter /> Filtres rapides</h3>
      <button v-if="hasActiveFilter" class="text-button text-xs" @click="resetAll">Réinitialiser</button>
    </div>

    <div class="filter-list">
      <!-- Statuts -->
      <FilterGroup label="Statut">
        <button class="filter-badge" :class="{ active: !hasAnyStatusActive }" @click="emit('update:status', [])">
          <span>Tous les torrents</span>
          <span class="count">{{ rows.length }}</span>
        </button>
        <button v-for="st in statusOptions" :key="st.key" class="filter-badge" :class="[st.key, filterState('activeStatus', st.key)]" @click="toggleItem('status', st.key)">
          <span>{{ st.label }}</span>
          <span class="count">{{ st.count }}</span>
        </button>
      </FilterGroup>

      <!-- Catégories -->
      <FilterGroup v-if="categories.length" label="Catégorie">
        <button v-for="cat in categories" :key="cat.name" class="filter-badge" :class="filterState('activeCategory', cat.name)" @click="toggleItem('category', cat.name)">
          <span>{{ cat.name }}</span>
          <span class="count">{{ cat.count }}</span>
        </button>
      </FilterGroup>

      <!-- Clients Torrent -->
      <FilterGroup v-if="clients.length > 1" label="Client">
        <button v-for="cl in clients" :key="cl.name" class="filter-badge" :class="{ active: isSelected('activeClient', cl.name) }" @click="toggleItem('client', cl.name)">
          <span>{{ cl.name }}</span>
          <span class="count">{{ cl.count }}</span>
        </button>
      </FilterGroup>

      <!-- Trackers -->
      <FilterGroup v-if="trackers.length" label="Trackers">
        <button v-for="tr in trackers" :key="tr.name" class="filter-badge" :class="filterState('activeTracker', tr.name)" @click="toggleItem('tracker', tr.name)">
          <span>{{ tr.name }}</span>
          <span class="count">{{ tr.count }}</span>
        </button>
      </FilterGroup>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Filter } from '@lucide/vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';

type FilterPropValue = string | string[] | Set<string> | null | undefined;

const props = withDefaults(
  defineProps<{
    rows?: any[];
    activeStatus?: FilterPropValue;
    activeCategory?: FilterPropValue;
    activeClient?: FilterPropValue;
    activeTracker?: FilterPropValue;
  }>(),
  {
    rows: () => [],
    activeStatus: () => [],
    activeCategory: () => [],
    activeClient: () => [],
    activeTracker: () => [],
  }
);

const emit = defineEmits<{
  (e: 'update:status', val: string[]): void;
  (e: 'update:category', val: string[]): void;
  (e: 'update:client', val: string[]): void;
  (e: 'update:tracker', val: string[]): void;
  (e: 'reset'): void;
}>();

function toSet(propVal: FilterPropValue): Set<string> {
  if (!propVal) return new Set();
  if (propVal instanceof Set) return propVal as Set<string>;
  if (Array.isArray(propVal)) return new Set(propVal.filter(Boolean));
  if (typeof propVal === 'string' && propVal.trim()) return new Set([propVal.trim()]);
  return new Set();
}

function isSelected(propName: keyof typeof props, val: string): boolean {
  const set = toSet(props[propName] as FilterPropValue);
  return set.has(val);
}
function filterState(propName: keyof typeof props, val: string): { active: boolean; excluded: boolean } {
  return { active: isSelected(propName, val), excluded: isSelected(propName, `!${val}`) };
}

const hasAnyStatusActive = computed(() => toSet(props.activeStatus).size > 0);
const hasActiveFilter = computed(() =>
  toSet(props.activeStatus).size > 0 ||
  toSet(props.activeCategory).size > 0 ||
  toSet(props.activeClient).size > 0 ||
  toSet(props.activeTracker).size > 0
);

function toggleItem(groupType: 'status' | 'category' | 'client' | 'tracker', itemValue: string): void {
  const propName = groupType === 'status' ? 'activeStatus' : groupType === 'category' ? 'activeCategory' : groupType === 'client' ? 'activeClient' : 'activeTracker';
  const set = new Set(toSet(props[propName] as FilterPropValue));
  if (set.has(itemValue)) {
    set.delete(itemValue);
    set.add(`!${itemValue}`);
  } else if (set.has(`!${itemValue}`)) {
    set.delete(`!${itemValue}`);
  } else {
    set.add(itemValue);
  }
  const arr = Array.from(set);
  if (groupType === 'status') emit('update:status', arr);
  else if (groupType === 'category') emit('update:category', arr);
  else if (groupType === 'client') emit('update:client', arr);
  else emit('update:tracker', arr);
}

function resetAll(): void { emit('reset'); }

function parseStatusKey(row: any): string {
  const value = String(row.status || '').toLowerCase();
  if (row.client_error || value.includes('error') || value.includes('missing')) return 'error';
  if (Number(row.progress) >= 100 || ['uploading', 'stalledup', 'pausedup', 'completed'].some((k) => value.includes(k))) return 'seeding';
  if (['queued', 'paused', 'stopped', 'checking'].some((k) => value.includes(k))) return 'paused';
  return 'downloading';
}

const statusOptions = computed(() => {
  const counts: Record<string, number> = { downloading: 0, seeding: 0, paused: 0, error: 0 };
  props.rows.forEach((r) => {
    const key = parseStatusKey(r);
    if (counts[key] !== undefined) counts[key]++;
  });
  return [
    { key: 'downloading', label: 'En téléchargement', count: counts.downloading },
    { key: 'seeding', label: 'En seed / Partage', count: counts.seeding },
    { key: 'paused', label: 'En pause / Attente', count: counts.paused },
    { key: 'error', label: 'Erreurs', count: counts.error },
  ].filter((item) => item.count > 0);
});

const categories = computed(() => {
  const map: Record<string, number> = {};
  props.rows.forEach((r) => {
    const cat = r.category || 'Non classé';
    map[cat] = (map[cat] || 0) + 1;
  });
  return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
});

const clients = computed(() => {
  const map: Record<string, number> = {};
  props.rows.forEach((r) => {
    const cl = r.client_name || 'Client';
    map[cl] = (map[cl] || 0) + 1;
  });
  return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
});

function formatTrackerHost(val?: string): string {
  if (!val) return '';
  const first = String(val).split(',')[0].trim();
  try {
    const raw = first.startsWith('http') || first.startsWith('udp') ? first : `http://${first}`;
    const host = new URL(raw).hostname;
    return host || first;
  } catch {
    return first;
  }
}

const trackers = computed(() => {
  const map: Record<string, number> = {};
  props.rows.forEach((r) => {
    const host = formatTrackerHost(r.trackers || r.tracker);
    if (host && host !== '—') map[host] = (map[host] || 0) + 1;
  });
  return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
});
</script>

<style scoped lang="scss">
/* Les styles filter-group / group-label / filter-badge viennent de FilterSidebar.vue
   via :deep() — pas besoin de les redéfinir ici. */
.torrent-sidebar-filters {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  min-width: 220px;
}
.filter-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-height: min(62vh, 620px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
  scrollbar-gutter: stable;
}
.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sidebar-head h3 {
  margin: 0;
  font-size: var(--fs-xs);
  display: flex;
  align-items: center;
  gap: 6px;
}
.sidebar-head svg {
  width: 14px;
  height: 14px;
  color: var(--accent);
}
@media(max-width: 900px) {
  .torrent-sidebar-filters { min-width: 0; padding: 10px 12px; }
  .filter-list { max-height: min(62dvh, 520px); margin-top: 2px; }
}
</style>
