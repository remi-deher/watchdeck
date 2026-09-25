<template>
  <section class="panel breakdown-panel" :class="`tone-${tone}`">
    <div class="panel-head">
      <div><span v-if="eyebrow" class="eyebrow">{{eyebrow}}</span><h2>{{title}}</h2></div>
      <div class="chart-actions">
        <button type="button" :class="{active:mode==='pie'}" :aria-pressed="mode==='pie'" aria-label="Afficher le camembert" @click="mode='pie'"><ChartPie/></button>
        <button type="button" :class="{active:mode==='table'}" :aria-pressed="mode==='table'" aria-label="Afficher le tableau" @click="mode='table'"><TableProperties/></button>
        <slot name="action"/>
      </div>
    </div>
    <PieChart
      v-if="mode==='pie'"
      :items="normalized"
      :interactive="interactive"
      :selected="selected"
      :aria-label="title"
      @select="select"
    />
    <!-- Les colonnes se trient au clic : la repartition arrive ordonnee par valeur, mais
         chercher une categorie precise demande l'ordre alphabetique. Le tri reste ici,
         car « Autres » doit toujours rester en queue. -->
    <UiDataTable
      v-else
      class="breakdown-table"
      :label="title"
      :rows="normalized"
      :columns="columns"
      :row-key="(item: BreakdownItem) => item.label"
      :row-class="(item: BreakdownItem) => ({ selected: item.label === selected, 'is-grouped': Boolean(item.grouped) })"
      :sort="sortKey ? { key: sortKey, direction: sortDirection } : null"
      manual-sort
      :cards="false"
      @update:sort="(value) => value && toggleSort(value.key as 'label' | 'value')"
    >
      <template #cell-label="{ row: item }">
        <!-- La categorie est le bouton de filtre : atteignable au clavier, comme l'etait la ligne. -->
        <button v-if="interactive && !item.grouped" type="button" class="breakdown-pick" :aria-pressed="item.label === selected" @click="select(item)">{{ item.label }}</button>
        <span v-else>{{ item.label }}</span>
      </template>
      <template #cell-value="{ row: item }"><strong>{{ formatValue(item.value) }}{{ item.suffix || '' }}</strong></template>
      <template #cell-percent="{ row: item }">{{ formatValue(item.percent) }} %</template>
    </UiDataTable>
    <button v-if="hasHidden" type="button" class="show-all" @click="expanded=!expanded">{{expanded?'Réduire':`Afficher les ${items.length} catégories`}}</button>
  </section>
</template>

<script setup lang="ts">
import { formatNumber as formatValue } from '@/utils/format';
import { ChartPie, TableProperties } from '@lucide/vue';
import PieChart from '@/components/ui/charts/PieChart.vue';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

export interface BreakdownItem {
  label: string;
  value: number | string;
  suffix?: string;
  detail?: string;
  grouped?: boolean;
  rawValue?: any;
  [key: string]: any;
}

const props = withDefaults(
  defineProps<{
    title: string;
    eyebrow?: string;
    items?: BreakdownItem[];
    emptyText?: string;
    tone?: string;
    interactive?: boolean;
    /** Categorie retenue comme filtre par la page. */
    selected?: string;
  }>(),
  {
    eyebrow: '',
    items: () => [],
    emptyText: 'Aucune donnée.',
    tone: 'accent',
    interactive: false,
    selected: '',
  }
);
const emit = defineEmits<{
  (e: 'select', value: any): void;
}>();
/* Les barres ont disparu : a repartition egale, le camembert dit la meme chose sur
   deux fois moins de hauteur, ce qui permet d'aligner les cartes entre elles. */
const mode = ref<'pie' | 'table'>('pie');
const columns: UiColumn<BreakdownItem>[] = [
  { key: 'label', label: 'Catégorie', sortable: true },
  { key: 'value', label: 'Valeur', sortable: true },
  { key: 'percent', label: 'Part' },
];
const sortKey = ref<'label' | 'value' | null>(null);
const sortDirection = ref<'asc' | 'desc'>('desc');
const expanded = ref(false);
const viewport = ref(typeof window === 'undefined' ? 1200 : window.innerWidth);
const limit = computed(() => (viewport.value <= 640 ? 5 : viewport.value <= 1024 ? 7 : 10));
const hasHidden = computed(() => props.items.length > limit.value);
const visible = computed(() => {
  // Le regroupement en « Autres » se decide sur la valeur, jamais sur le tri choisi :
  // trier par libelle ne doit pas changer *quelles* categories sont repliees, seulement
  // l'ordre dans lequel les restantes s'affichent.
  const rows =
    expanded.value || !hasHidden.value
      ? [...props.items]
      : (() => {
          const n = Math.max(1, limit.value - 1);
          const tail = props.items.slice(n);
          return [
            ...props.items.slice(0, n),
            {
              label: 'Autres',
              value: tail.reduce((s, x) => s + Number(x.value || 0), 0),
              detail: `${tail.length} catégories regroupées`,
              grouped: true,
            },
          ];
        })();
  if (!sortKey.value) return rows;
  const direction = sortDirection.value === 'asc' ? 1 : -1;
  return rows.sort((a, b) => {
    // « Autres » reste en queue : c'est un reste, pas une categorie.
    if (a.grouped !== b.grouped) return a.grouped ? 1 : -1;
    if (sortKey.value === 'label') return direction * String(a.label).localeCompare(String(b.label), 'fr');
    return direction * (Number(a.value || 0) - Number(b.value || 0));
  });
});
const total = computed(() => props.items.reduce((s, x) => s + Number(x.value || 0), 0) || 1);
const maximum = computed(() => Math.max(1, ...visible.value.map((x) => Number(x.value || 0))));
const normalized = computed(() =>
  visible.value.map((x) => ({
    ...x,
    percent: (Number(x.value || 0) / total.value) * 100,
    width: Math.max(x.value ? 4 : 0, (Number(x.value || 0) / maximum.value) * 100),
  }))
);
function toggleSort(key: 'label' | 'value'): void {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  sortKey.value = key;
  // Un libelle se lit de A a Z, une valeur de la plus grande a la plus petite.
  sortDirection.value = key === 'label' ? 'asc' : 'desc';
}
const ariaSort = (key: 'label' | 'value') =>
  sortKey.value === key ? (sortDirection.value === 'asc' ? 'ascending' : 'descending') : 'none';
function select(x: BreakdownItem): void {
  if (props.interactive && !x.grouped) emit('select', x.rawValue ?? x.label);
}
function resize(): void {
  viewport.value = window.innerWidth;
}
onMounted(() => window.addEventListener('resize', resize, { passive: true }));
onBeforeUnmount(() => window.removeEventListener('resize', resize));
</script>

<style scoped lang="scss">
.breakdown-panel{--chart-color:var(--accent);--chart-end:var(--amber-text);display:flex;flex-direction:column;height:100%}.breakdown-panel>.breakdown-table,.breakdown-panel :deep(.pie-chart){flex:1;min-height:0}.tone-blue{--chart-color:var(--blue);--chart-end:#2563eb}.tone-green{--chart-color:var(--green-text);--chart-end:#16a34a}.tone-red{--chart-color:#fb7185;--chart-end:#dc2626}.tone-purple{--chart-color:#c084fc;--chart-end:#7c3aed}.chart-actions{display:flex;align-items:center;gap: var(--space-1)}.chart-actions>button{display:grid;place-items:center;width:34px;height:34px;padding:0;border:1px solid transparent;border-radius:var(--radius-sm);background:transparent;color:var(--muted)}.chart-actions>button.active{border-color:var(--border);background:var(--surface-2);color:var(--chart-color)}.chart-actions svg{width:15px}.breakdown-table{margin-top:12px}.breakdown-table :deep(th),.breakdown-table :deep(td){padding:6px;border-bottom:1px solid var(--border);font-size:var(--fs-xs)}.breakdown-table :deep(th){color:var(--muted);text-transform:uppercase}.breakdown-table :deep(th:nth-child(n+2)),.breakdown-table :deep(td:nth-child(n+2)){text-align:right;font-variant-numeric:tabular-nums}.breakdown-table :deep(tr.selected){background:color-mix(in srgb,var(--accent) 14%,transparent)}.breakdown-table :deep(.ui-data-table__sort:hover){color:var(--chart-color)}.breakdown-pick{min-height:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}.breakdown-pick:hover,.breakdown-pick[aria-pressed=true]{color:var(--chart-color)}.breakdown-pick:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.show-all{margin-top:10px;padding:6px 0;border:0;background:transparent;color:var(--chart-color);font-size:var(--fs-xs)}@media(max-width:640px){.chart-actions>button{width:44px;height:44px}}
</style>
