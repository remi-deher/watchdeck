<template>
  <!-- Gabarit « Analyser » : repond a « que contient ma bibliotheque, et comment ca
       evolue ? ». On analyse pour decider :
         1. le perimetre : la periode (7 jours… 10 ans, Tout), comparee a la precedente
            (sauf « Tout ») ; les filtres passent par la feuille commune du socle ;
         2. les chiffres cles et leur evolution (MetricCard) ;
         3. les pistes : constats chiffres calcules par le serveur, tries par impact, cinq
            puis « Voir toutes les pistes » ;
         4. les blocs d'analyse (emplacement `blocks`), faits des composants communs :
            repartition (BreakdownPanel), tendance (LineChart), classement
            (PopularMediaPanel), habitudes (ActivityHeatmap) ;
         5. une piste ou un element de bloc ouvre, dans la page et au-dessus des blocs, la
            liste des elements concernes (emplacement `drill`), avec « Ouvrir dans Explorer »
            et « Traiter » quand il y a quelque chose a corriger.
       Des constats, pas des alertes : les alertes relevent de Surveiller. -->
  <div class="analyze">
    <div class="analyze__scope">
      <UiSegmentedControl :model-value="period" :options="PERIODS" ariaLabel="Période" @update:model-value="emit('update:period', $event as AnalyzePeriod)" />
      <small class="analyze__compare">{{ period === 'all' ? 'Depuis le début · pas de comparaison' : `Comparé aux ${periodLabel} précédents` }}</small>
    </div>

    <MetricGrid v-if="kpis.length" class="analyze__kpis" aria-label="Chiffres clés">
      <MetricCard
        v-for="kpi in kpis"
        :key="kpi.key"
        :label="kpi.label"
        :value="kpi.value"
        :detail="kpi.detail"
        :loading="loading"
        :trend="period === 'all' || kpi.change == null ? null : trendOf(kpi)"
      />
    </MetricGrid>

    <section v-if="leads.length" class="analyze__leads" aria-labelledby="analyze-leads">
      <h2 id="analyze-leads">Pistes</h2>
      <ul>
        <li v-for="lead in shownLeads" :key="lead.key">
          <button type="button" class="analyze-lead" :class="{ 'is-open': lead.key === drillKey }" :aria-expanded="lead.key === drillKey" @click="emit('drill', { key: lead.key, title: lead.text, kind: 'lead', action: lead.action })">
            <Lightbulb aria-hidden="true" />
            <span>{{ lead.text }}</span>
            <ChevronRight aria-hidden="true" />
          </button>
        </li>
      </ul>
      <button v-if="leads.length > LEADS_SHOWN && !allLeads" type="button" class="analyze__more" @click="allLeads = true">Voir toutes les pistes ({{ leads.length }})</button>
    </section>

    <section v-if="drill" class="analyze__drill" :aria-label="drill.title">
      <header>
        <h2>{{ drill.title }}</h2>
        <UiButton size="sm" variant="ghost" icon-only aria-label="Fermer la liste" title="Fermer" @click="emit('close-drill')"><X /></UiButton>
      </header>
      <slot name="drill" :drill="drill" />
      <footer>
        <UiButton v-if="drill.exploreTo" size="sm" :to="drill.exploreTo">Ouvrir dans Explorer</UiButton>
        <UiButton v-if="drill.handleTo" size="sm" variant="primary" :to="drill.handleTo">Traiter</UiButton>
      </footer>
    </section>

    <div class="analyze__blocks"><slot name="blocks" /></div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronRight, Lightbulb, X } from '@lucide/vue';
import MetricCard from '@/components/ui/MetricCard.vue';
import MetricGrid from '@/components/ui/MetricGrid.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import type { AnalyzeDrill, AnalyzeKpi, AnalyzeLead, AnalyzePeriod } from './analyze/types';

export type { AnalyzeDrill, AnalyzeDrillRequest, AnalyzeKpi, AnalyzeLead, AnalyzePeriod } from './analyze/types';

const props = withDefaults(
  defineProps<{
    period: AnalyzePeriod;
    kpis?: AnalyzeKpi[];
    /** Constats du serveur, deja tries par impact. */
    leads?: AnalyzeLead[];
    /** Liste ouverte (piste ou element de bloc) ; la page la charge sur `drill`. */
    drill?: AnalyzeDrill | null;
    loading?: boolean;
  }>(),
  { kpis: () => [], leads: () => [], drill: null, loading: false },
);
const emit = defineEmits<{
  'update:period': [period: AnalyzePeriod];
  /** Ouvrir la liste d'une piste (les blocs emettent eux-memes vers la page). */
  drill: [request: { key: string; title: string; kind: 'lead'; action?: 'explore' | 'handle' }];
  'close-drill': [];
}>();

const PERIODS: Array<{ value: AnalyzePeriod; label: string }> = [
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '1y', label: '1 an' },
  { value: '5y', label: '5 ans' },
  { value: '10y', label: '10 ans' },
  { value: 'all', label: 'Tout' },
];
const periodLabel = computed(() => PERIODS.find((entry) => entry.value === props.period)?.label || '');

const LEADS_SHOWN = 5;
const allLeads = ref(false);
const shownLeads = computed(() => (allLeads.value ? props.leads : props.leads.slice(0, LEADS_SHOWN)));
const drillKey = computed(() => props.drill?.key || '');

/* Le sens de la fleche suit le chiffre ; sa couleur dit si c'est une bonne nouvelle
   (moins de films sans VF est un progres). */
function trendOf(kpi: AnalyzeKpi): { direction: string; label: string } {
  const change = kpi.change!;
  const label = change === 0 ? 'stable' : `${change > 0 ? '▲ +' : '▼ −'}${Math.abs(change).toLocaleString('fr-FR')} %`;
  if (change === 0) return { direction: 'stable', label };
  const good = (kpi.better || 'up') === (change > 0 ? 'up' : 'down');
  return { direction: good ? 'up' : 'down', label };
}
</script>

<style scoped lang="scss">
.analyze { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-4); min-width: 0; }
.analyze__scope { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); }
.analyze__compare { color: var(--muted); font-size: var(--fs-sm); }
.analyze__leads { display: grid; gap: var(--space-2); }
.analyze__leads h2, .analyze__drill h2 { margin: 0; font-size: var(--fs-md); }
.analyze__leads ul { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.analyze-lead { display: flex; align-items: center; gap: var(--space-2); width: 100%; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); font: inherit; font-size: var(--fs-sm); text-align: left; cursor: pointer; }
.analyze-lead:hover, .analyze-lead.is-open { border-color: var(--accent); }
.analyze-lead svg { flex: none; width: 16px; height: 16px; color: var(--muted); }
.analyze-lead svg:first-child { color: var(--amber-text); }
.analyze-lead span { flex: 1; min-width: 0; }
.analyze__more { justify-self: start; border: 0; background: none; color: var(--accent); font: inherit; font-size: var(--fs-sm); cursor: pointer; }
.analyze__drill { display: grid; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--accent); border-radius: var(--panel-radius); background: var(--surface); }
.analyze__drill header, .analyze__drill footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); }
.analyze__drill footer { justify-content: flex-start; }
.analyze__blocks { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); gap: var(--space-4); align-items: start; }
</style>
