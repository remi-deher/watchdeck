<template>
  <!-- Gabarit « Suivre » : repond a « ou en est ce qui tourne ? ».
         1. le resume des etats, qui sert aussi de filtre ;
         2. les elements groupes par etat, dans un ordre fixe : bloques (avec leur cause
            et l'action qui debloque), en cours (progression, temps restant), en pause,
            en attente (liste compacte dans l'ordre de passage, repliee au-dela de quelques lignes) ;
         3. les derniers termines, puis le lien vers l'historique complet.
       Pas de reglage ni d'analyse : ce sont les besoins des gabarits Configurer et
       Comprendre. La page fournit les elements et reagit aux actions (`action`). -->
  <div class="track">
    <div class="track__summary">
      <UiSegmentedControl v-model="filter" :options="filterOptions" ariaLabel="Filtrer par état" />
      <small v-if="updated" class="track__updated" aria-live="polite">{{ updated }}</small>
    </div>

    <p v-if="loading && !items.length" class="track__loading">Chargement des {{ text.items }}…</p>
    <template v-else-if="visibleGroups.length">
      <template v-for="group in visibleGroups" :key="group.state">
      <!-- Ce qui tourne : le bandeau commun (LiveStrip), image, etape et progression ; un
           clic ouvre la fiche de l'element. -->
      <LiveStrip
        v-if="group.state === 'running'"
        class="track__group is-running"
        :items="group.items.map(toLive)"
        :title="`${group.items.length} en cours`"
        live-label="En cours"
        :idle="{ title: 'Rien en cours' }"
        @select="(live) => live.to && router.push(live.to)"
      />
      <section v-else class="track__group" :class="`is-${group.state}`" :aria-labelledby="`track-${group.state}`">
        <header class="track__group-head">
          <component :is="GROUPS[group.state].icon" aria-hidden="true" />
          <h2 :id="`track-${group.state}`">{{ GROUPS[group.state].title }}</h2>
          <span class="track__count">{{ group.items.length }}</span>
        </header>
        <!-- L'attente est une liste compacte dans l'ordre de passage ; le reste, des cartes. -->
        <TrackQueue v-if="group.state === 'waiting'" :items="group.items" :limit="queueLimit" @action="(target, key) => emit('action', target, key)" />
        <ol v-else class="track__list">
          <li v-for="item in group.items" :key="item.key">
            <TrackCard :item="item" @action="(target, key) => emit('action', target, key)" />
          </li>
        </ol>
      </section>
      </template>
    </template>
    <UiEmptyState v-else :icon="CheckCircle2" :title="text.empty" :message="text.emptyDetail" />

    <section v-if="recent.length" class="track__recent" aria-labelledby="track-recent">
      <header class="track__group-head">
        <History aria-hidden="true" />
        <h2 id="track-recent">{{ text.recent }}</h2>
        <RouterLink v-if="historyTo" class="track__history" :to="historyTo">{{ text.history }}</RouterLink>
      </header>
      <ul class="track__recent-list">
        <li v-for="entry in recent" :key="entry.key" :class="{ 'is-failed': entry.failed }">
          <component :is="entry.failed ? XCircle : CheckCircle2" aria-hidden="true" />
          <component :is="entry.to ? RouterLink : 'span'" :to="entry.to || undefined" class="track__recent-title">{{ entry.title }}</component>
          <small v-if="entry.detail">{{ entry.detail }}</small>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import LiveStrip, { type LiveItem } from '@/components/ui/LiveStrip.vue';
import { AlertTriangle, CheckCircle2, Clock, History, Loader, PauseCircle, XCircle } from '@lucide/vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import TrackCard from './track/TrackCard.vue';
import TrackQueue from './track/TrackQueue.vue';
import type { TrackItem, TrackLabels, TrackRecent, TrackState } from './track/types';

export type { TrackAction, TrackCause, TrackItem, TrackLabels, TrackRecent, TrackState } from './track/types';

const props = withDefaults(
  defineProps<{
    items: TrackItem[];
    recent?: TrackRecent[];
    /** Page de l'historique complet (gabarit Comprendre). */
    historyTo?: string | Record<string, any> | null;
    /** « Mis a jour il y a 10 s » : la page sait quand ses donnees ont ete lues. */
    updated?: string;
    loading?: boolean;
    labels?: TrackLabels;
    /** Lignes d'attente montrees avant repli. */
    queueLimit?: number;
  }>(),
  { recent: () => [], historyTo: null, updated: '', loading: false, labels: () => ({}), queueLimit: 5 },
);
const emit = defineEmits<{ action: [item: TrackItem, key: string] }>();

const ORDER: TrackState[] = ['blocked', 'running', 'paused', 'waiting'];
const GROUPS: Record<TrackState, { title: string; filter: string; icon: any }> = {
  blocked: { title: 'Demande une intervention', filter: 'Bloqués', icon: AlertTriangle },
  running: { title: 'En cours', filter: 'En cours', icon: Loader },
  paused: { title: 'En pause', filter: 'En pause', icon: PauseCircle },
  waiting: { title: 'En attente', filter: 'En attente', icon: Clock },
};

const text = computed(() => {
  const items = props.labels.items || 'éléments';
  return {
    items,
    empty: props.labels.empty || 'Rien ne tourne',
    emptyDetail: props.labels.emptyDetail || `Aucun ${items.replace(/s$/, '')} en cours ni en attente.`,
    recent: props.labels.recent || 'Derniers terminés',
    history: props.labels.history || 'Voir l’historique',
  };
});

const router = useRouter();
/* Un element en cours, en carte du bandeau commun : l'etape en badge, le temps restant
   sous le titre, l'identification dessous, les etiquettes en faits. */
function toLive(item: TrackItem): LiveItem {
  return {
    key: item.key,
    title: item.title,
    status: item.eta || '',
    progress: item.progress ?? null,
    poster: item.poster || null,
    icon: item.icon,
    badge: item.step ? { label: item.step, tone: 'accent' } : null,
    who: item.subtitle || '',
    facts: (item.tags || []).map((tag) => ({ key: tag, label: tag })),
    note: item.note || '',
    to: item.to || null,
  };
}

const filter = ref<'all' | TrackState>('all');
const groups = computed(() =>
  ORDER.map((state) => ({ state, items: props.items.filter((item) => item.state === state) })).filter((group) => group.items.length),
);
/* « Tout » et les etats presents ; un etat filtre qui se vide reste propose tant qu'il
   est choisi, pour ne pas faire sauter le selecteur sous le doigt. */
const filterOptions = computed(() => [
  { value: 'all' as const, label: 'Tout', count: props.items.length },
  ...ORDER.filter((state) => filter.value === state || groups.value.some((group) => group.state === state))
    .map((state) => ({ value: state, label: GROUPS[state].filter, count: props.items.filter((item) => item.state === state).length })),
]);
const visibleGroups = computed(() => (filter.value === 'all' ? groups.value : groups.value.filter((group) => group.state === filter.value)));
</script>

<style scoped lang="scss">
.track { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-5); min-width: 0; }
.track__summary { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); }
.track__updated, .track__loading { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.track__group, .track__recent { display: grid; gap: var(--space-3); min-width: 0; }
.track__group-head { display: flex; align-items: center; gap: var(--space-2); }
.track__group-head svg { width: 18px; height: 18px; color: var(--muted); }
.track__group.is-blocked .track__group-head svg { color: var(--red-text); }
.track__group-head h2 { margin: 0; font-size: var(--fs-md); }
.track__count { padding: 1px 8px; border-radius: var(--radius-pill); background: var(--surface-2); color: var(--muted); font-size: var(--fs-xs); font-weight: 700; }
.track__history { margin-left: auto; color: var(--accent); font-size: var(--fs-sm); text-decoration: none; }
.track__list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.track__recent-list { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.track__recent-list li { display: flex; align-items: center; gap: var(--space-2); min-width: 0; padding: 6px var(--space-2); border-radius: var(--radius-sm); font-size: var(--fs-sm); }
.track__recent-list li svg { flex: none; width: 16px; height: 16px; color: var(--green); }
.track__recent-list li.is-failed svg { color: var(--red-text); }
.track__recent-title { overflow: hidden; color: var(--text); text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
.track__recent-list small { margin-left: auto; flex: none; color: var(--muted); }
</style>
