<template>
  <!-- Gabarit « Choisir » : repond a « lequel prendre ? ». On retient un candidat parmi
       plusieurs (releases d'une demande, version VF d'un media…). Repris de la recherche
       de version VF (VfUpgradeButton) :
         1. le contexte : ce qu'on cherche et d'ou viennent les candidats (emplacement
            `context`) ;
         2. un mode (VF / toutes…), un tri, « Relancer la recherche », le nombre de
            resultats et « Masquer les rejets » (decoche par defaut) ;
         3. la recommandation en tete : le meilleur candidat non rejete selon `recommendBy` ;
         4. chaque candidat : badges de criteres dans un ordre fixe, puis ses chiffres, et
            « Choisir ». Les rejetes restent a leur place dans le tri, comme dans Sonarr et
            Radarr -- un rejet peut venir d'une configuration *arr a revoir --, estompes, avec
            leur raison, et « Forcer » apres confirmation ;
         5. le retour apres le choix (`result`), et « Choisir une autre ». -->
  <div class="choose">
    <div v-if="$slots.context" class="choose__context"><slot name="context" /></div>

    <div class="choose__toolbar">
      <UiSegmentedControl v-if="modes.length > 1" :model-value="mode" :options="modes" ariaLabel="Mode de recherche" @update:model-value="emit('update:mode', String($event))" />
      <UiSegmentedControl v-if="sorts.length > 1" v-model="sortKey" :options="sorts.map((s) => ({ value: s.key, label: s.label }))" ariaLabel="Trier" />
      <UiButton size="sm" :loading="searching" :disabled="busy" @click="emit('refresh')"><template #icon><RefreshCw /></template>{{ searching ? 'Recherche en cours…' : 'Relancer la recherche' }}</UiButton>
      <span class="choose__count" aria-live="polite">{{ visible.length }} résultat{{ visible.length > 1 ? 's' : '' }}</span>
      <UiCheckboxField v-if="rejectedCount" v-model="hideRejected" :label="`Masquer les rejets (${rejectedCount})`" />
    </div>

    <p v-if="notice" class="choose__notice">{{ notice }}</p>

    <div v-if="result" class="choose__result" role="status">
      <CheckCircle2 aria-hidden="true" />
      <span>{{ result.message }}</span>
      <UiButton v-if="result.to" size="sm" variant="ghost" :to="result.to">{{ result.linkLabel || 'Suivre' }}</UiButton>
      <UiButton size="sm" @click="emit('reset')">Choisir une autre</UiButton>
    </div>

    <div v-else-if="searching" class="choose__skeletons" aria-hidden="true">
      <div v-for="i in 3" :key="i" class="choose__skeleton" />
    </div>
    <ul v-else-if="visible.length" class="choose__list">
      <li v-for="candidate in visible" :key="candidate.key" class="choose-card" :class="{ 'is-recommended': candidate.key === recommendedKey, 'is-rejected': candidate.rejected }">
        <div class="choose-card__main">
          <ul class="choose-card__badges">
            <li v-if="candidate.key === recommendedKey" class="is-recommended"><Sparkles aria-hidden="true" />Recommandée</li>
            <li v-for="badge in candidate.badges" :key="badge.label" :class="badge.tone ? `is-${badge.tone}` : ''">{{ badge.label }}</li>
          </ul>
          <strong class="choose-card__title" :title="candidate.title">{{ candidate.title }}</strong>
          <p v-if="candidate.rejected" class="choose-card__rejected">Rejetée : {{ candidate.rejected }}</p>
          <ul class="choose-card__facts">
            <li v-for="fact in candidate.facts" :key="fact">{{ fact }}</li>
          </ul>
        </div>
        <UiButton
          size="sm"
          :variant="candidate.key === recommendedKey ? 'primary' : 'secondary'"
          :loading="choosing === candidate.key"
          :disabled="busy"
          @click="choose(candidate)"
        >{{ candidate.rejected ? 'Forcer' : 'Choisir' }}</UiButton>
      </li>
    </ul>
    <UiEmptyState v-else :title="candidates.length ? 'Aucun résultat visible' : 'Aucun candidat'" :message="candidates.length ? 'Tous les résultats sont des rejets masqués.' : emptyMessage" compact />

    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { CheckCircle2, RefreshCw, Sparkles } from '@lucide/vue';
import ConfirmModal from '@/components/ConfirmModal.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import { useConfirm } from '@/composables/useConfirm';
import type { ChooseCandidate, ChooseResult, ChooseSort } from './choose/types';

export type { ChooseBadge, ChooseCandidate, ChooseResult, ChooseSort } from './choose/types';

const props = withDefaults(
  defineProps<{
    candidates: ChooseCandidate[];
    /** Tris proposes ; le premier est celui par defaut. */
    sorts?: ChooseSort[];
    /** Mesure qui designe la recommandation (la plus haute, hors rejets). */
    recommendBy?: string;
    modes?: Array<{ value: string; label: string }>;
    mode?: string;
    searching?: boolean;
    /** Une action en cours (choix envoye) : boutons inactifs. */
    busy?: boolean;
    choosing?: string;
    /** Message de la source (etat *arr…). */
    notice?: string;
    result?: ChooseResult | null;
    emptyMessage?: string;
  }>(),
  {
    sorts: () => [],
    recommendBy: 'score',
    modes: () => [],
    mode: '',
    searching: false,
    busy: false,
    choosing: '',
    notice: '',
    result: null,
    emptyMessage: 'La recherche n’a rien trouvé.',
  },
);
const emit = defineEmits<{
  'update:mode': [mode: string];
  refresh: [];
  /** `forced` : un candidat rejete, choisi apres confirmation. */
  choose: [candidate: ChooseCandidate, forced: boolean];
  reset: [];
}>();

const sortKey = ref(props.sorts[0]?.key || '');
const hideRejected = ref(false);
const rejectedCount = computed(() => props.candidates.filter((c) => c.rejected).length);

/* Rejetes compris : ils restent a leur place dans le tri. */
const sorted = computed(() => {
  const sort = props.sorts.find((s) => s.key === sortKey.value);
  if (!sort) return props.candidates;
  const direction = sort.direction === 'asc' ? 1 : -1;
  return props.candidates.slice().sort((a, b) => direction * ((a.metrics?.[sort.key] ?? 0) - (b.metrics?.[sort.key] ?? 0)));
});
const visible = computed(() => (hideRejected.value ? sorted.value.filter((c) => !c.rejected) : sorted.value));
const recommendedKey = computed(() => {
  let best: ChooseCandidate | null = null;
  for (const candidate of props.candidates) {
    if (candidate.rejected) continue;
    if (!best || (candidate.metrics?.[props.recommendBy] ?? -Infinity) > (best.metrics?.[props.recommendBy] ?? -Infinity)) best = candidate;
  }
  return best?.key || '';
});

const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
async function choose(candidate: ChooseCandidate): Promise<void> {
  if (candidate.rejected) {
    const ok = await askConfirm({
      title: 'Forcer cette release ?',
      message: `Elle a été rejetée : ${candidate.rejected}. La forcer peut contredire votre profil de qualité.`,
      confirmLabel: 'Forcer',
      danger: true,
    });
    if (!ok) return;
  }
  emit('choose', candidate, Boolean(candidate.rejected));
}
</script>

<style scoped lang="scss">
.choose { display: grid; gap: var(--space-3); min-width: 0; }
.choose__toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); }
.choose__count { color: var(--muted); font-size: var(--fs-sm); }
.choose__notice { margin: 0; padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); background: var(--surface-2); font-size: var(--fs-sm); }
.choose__result { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); padding: var(--space-3); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--green) 12%, var(--surface)); color: var(--green-text, var(--green)); font-size: var(--fs-sm); }
.choose__result svg { flex: none; width: 18px; height: 18px; }
.choose__result > span { flex: 1 1 14rem; }
.choose__skeletons { display: grid; gap: var(--space-2); }
.choose__skeleton { height: 84px; border-radius: var(--panel-radius); background: var(--surface-2); animation: choose-pulse 1.4s ease-in-out infinite; }
@keyframes choose-pulse { 50% { opacity: .5; } }
@media (prefers-reduced-motion: reduce) { .choose__skeleton { animation: none; } }
.choose__list { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.choose-card { display: flex; align-items: center; gap: var(--space-3); min-width: 0; padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface); }
.choose-card.is-recommended { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.choose-card.is-rejected { opacity: .62; }
.choose-card__main { display: grid; flex: 1; gap: 4px; min-width: 0; }
.choose-card__badges, .choose-card__facts { display: flex; flex-wrap: wrap; gap: 4px var(--space-3); margin: 0; padding: 0; list-style: none; }
.choose-card__badges li { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: var(--radius-pill); background: var(--surface-2); color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.choose-card__badges li svg { width: 12px; height: 12px; }
.choose-card__badges .is-recommended, .choose-card__badges .is-accent { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); color: var(--accent); }
.choose-card__badges .is-success { background: color-mix(in srgb, var(--green) 14%, var(--surface)); color: var(--green-text, var(--green)); }
.choose-card__badges .is-warning { background: color-mix(in srgb, var(--amber) 16%, var(--surface)); color: var(--amber-text); }
.choose-card__title { overflow: hidden; font-size: var(--fs-sm); text-overflow: ellipsis; white-space: nowrap; }
.choose-card__rejected { margin: 0; color: var(--red-text); font-size: var(--fs-xs); }
.choose-card__facts { color: var(--muted); font-size: var(--fs-xs); }
</style>
