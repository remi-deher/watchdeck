<template>
  <span class="vf-upgrade-wrap" @click.stop>
    <button v-if="!hideTrigger && label" type="button" class="badge mdh-link vf-upgrade-trigger" :class="{ active: hasSuggestion }" @click="toggle">
      <Search :size="14" /> {{ label }}<strong v-if="hasSuggestion" class="vf-upgrade-count">{{ publishedReleases.length }}</strong>
    </button>
    <UiButton v-else-if="!hideTrigger" class="vf-upgrade-trigger" :class="{ active: hasSuggestion }" :title="triggerTitle" :aria-label="triggerTitle" @click="toggle">
      <Search v-if="!hasSuggestion" :size="16" />
      <span v-else class="vf-upgrade-count vf-upgrade-badge">{{ publishedReleases.length }}</span>
    </UiButton>

    <ModalShell v-if="open" :title="modalTitle" :subtitle="`Recherche via ${arrName}`" size="lg" :error="error" :busy="Boolean(grabbing)" @close="open=false">
      <UiSegmentedControl :model-value="mode" :options="modeOptions" :ariaLabel="'Mode de recherche'" @update:model-value="handleModeChange" />
      <div class="vf-upgrade-toolbar">
        <UiButton size="sm" :loading="searching" :disabled="Boolean(grabbing)" @click="runSearch"><template #icon><RefreshCw :size="15" /></template>{{ searching ? `Recherche ${arrName} en cours…` : 'Relancer la recherche' }}</UiButton>
        <span class="release-result-count">{{ visibleReleases.length }} résultat{{ visibleReleases.length > 1 ? 's' : '' }}</span>
        <UiCheckboxField v-if="rejectedCount" v-model="hideRejected" :label="`Masquer les rejets (${rejectedCount})`" />
      </div>
      <p v-if="feedback" class="notice" :class="feedbackClass">{{ feedback }}</p>
      <div v-if="mode==='vf'&&suggestion?.arr_message" class="notice arr-status" :class="{ 'success-text': isActiveOrVerified }">
        <div><strong>{{ statusLabel }}</strong><span>{{ suggestion.arr_message }}</span></div>
      </div>

      <!-- Squelettes de chargement animés -->
      <div v-if="searching || (loading && !hasSuggestion)" class="release-skeletons" aria-hidden="true">
        <div v-for="i in 3" :key="`skel-${i}`" class="release-skeleton-card">
          <div class="skeleton-badges">
            <span class="skeleton-box skeleton-pill" style="width: 85px;" />
            <span class="skeleton-box skeleton-pill" style="width: 55px;" />
            <span class="skeleton-box skeleton-pill" style="width: 65px;" />
          </div>
          <span class="skeleton-box skeleton-title" />
          <div class="skeleton-meta">
            <span class="skeleton-box" style="width: 70px; height: 16px;" />
            <span class="skeleton-box" style="width: 90px; height: 16px;" />
            <span class="skeleton-box" style="width: 60px; height: 16px;" />
          </div>
        </div>
      </div>

      <UiEmptyState v-else-if="!searching && !hasSuggestion" title="Aucune release" :message="emptyMessage" compact />
      <UiEmptyState v-else-if="!searching && !visibleReleases.length" title="Aucune release visible" message="Toutes les releases sont masquées car elles ont été rejetées par *arr." compact />

      <ul v-if="!searching && visibleReleases.length" class="vf-upgrade-list">
        <ReleaseCandidateCard
          v-for="(release,index) in visibleReleases"
          :key="release.guid"
          :release="release"
          :arr-name="arrName"
          :recommended="index===0 && !isRejected(release)"
          :vf="mode==='vf'"
          :comparison="mode==='vf' ? comparisonFor(release) : null"
          :show-comparison="hasCurrentComparison"
          :grabbing="grabbing===release.guid"
          :grab-disabled="Boolean(grabbing) || grabDisabled"
          @grab="requestGrab"
          @copy="copyTitle"
        />
      </ul>
    </ModalShell>

    <ConfirmModal v-if="confirmRelease" :open="true" title="Grabber malgré les avertissements ?" message="Vérifie les risques détectés avant d’envoyer cette release à *arr." confirm-label="Grabber malgré les avertissements" :busy="grabbing===confirmRelease.guid" @cancel="confirmRelease=null" @confirm="confirmGrab">
      <div class="grab-confirm-details">
        <strong>{{ confirmRelease.title }}</strong>
        <ul>
          <li v-for="warning in confirmWarnings" :key="warning"><TriangleAlert :size="14" /> {{ warning }}</li>
        </ul>
      </div>
    </ConfirmModal>
  </span>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RefreshCw, Search, TriangleAlert } from '@lucide/vue';

import ConfirmModal from '@/components/ConfirmModal.vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import ReleaseCandidateCard from '@/components/media/ReleaseCandidateCard.vue';
import { useVfUpgradeSearch } from '@/composables/useVfUpgradeSearch';
import { isRejected } from '@/utils/releaseComparison';

const props = withDefaults(
  defineProps<{
    sourceType: string;
    sourceId: number;
    scope: string;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
    mediaTitle?: string;
    label?: string;
    /** Sans declencheur : la fenetre s'ouvre par `toggle()`, depuis un menu qui porte l'entree. */
    hideTrigger?: boolean;
  }>(),
  {
    seasonNumber: null,
    episodeNumber: null,
    mediaTitle: '',
    label: '',
    hideTrigger: false,
  }
);

const emit = defineEmits<{
  (e: 'updated'): void;
}>();

const {
  suggestion, loading, grabbing, error, feedback, mode, hideRejected, confirmRelease,
  publishedReleases, hasSuggestion, isActiveOrVerified, statusLabel, visibleReleases, modeOptions,
  rejectedCount, searching, grabDisabled, arrName, hasCurrentComparison, emptyMessage, feedbackClass,
  confirmWarnings, comparisonFor, copyTitle, requestGrab, confirmGrab, runSearch, handleModeChange,
  load, loadOnce,
} = useVfUpgradeSearch(props, () => emit('updated'));
const open = ref(false);

const scopeLabel = computed(() =>
  props.scope === 'season'
    ? `Saison ${props.seasonNumber}`
    : props.scope === 'episode'
    ? `S${String(props.seasonNumber).padStart(2, '0')}E${String(props.episodeNumber).padStart(2, '0')}`
    : ''
);
const modalTitle = computed(() => [props.mediaTitle || actionLabel.value, scopeLabel.value].filter(Boolean).join(' · '));
const actionLabel = computed(() => props.label || 'Rechercher');
const triggerTitle = computed(() => actionLabel.value);

async function toggle(): Promise<void> {
  open.value = true;
  await loadOnce();
}
onMounted(() => load());
defineExpose({ toggle, count: computed(() => publishedReleases.value.length) });
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.vf-upgrade-wrap { display: inline-flex; }
.vf-upgrade-trigger.active { color: var(--accent); border-color: var(--accent); }
.vf-upgrade-count { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; padding: 0 4px; border-radius: var(--radius-pill); background: var(--accent); color: var(--on-accent); font-size: var(--fs-xs); font-weight: 700; }
.vf-upgrade-badge { min-width: 20px; height: 20px; font-size: var(--fs-xs); }
.vf-upgrade-toolbar { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; padding: 9px 0 12px; border-bottom: 1px solid var(--border); }
.compact-search-button, .compact-check, .arr-status { display: flex; align-items: center; gap: 7px; }
.compact-search-button { min-height: 38px; }
.release-result-count { color: var(--muted); font-size: var(--fs-xs); white-space: nowrap; }
.compact-check { margin-left: auto; font-size: var(--fs-xs); white-space: nowrap; cursor: pointer; }
.arr-status > div { display: grid; gap: 2px; }
.arr-status span { color: var(--muted); font-size: var(--fs-xs); }

/* Squelettes animés */
.release-skeletons { display: grid; gap: 10px; max-height: 61vh; overflow-y: auto; padding: 2px; }
.release-skeleton-card { display: grid; gap: 10px; padding: 13px; border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface-hover); }
.skeleton-badges { display: flex; gap: 6px; }
.skeleton-box { display: block; border-radius: var(--radius-xs); background: linear-gradient(100deg, var(--surface-2) 20%, color-mix(in srgb, var(--surface-2) 55%, var(--border)) 40%, var(--surface-2) 60%); background-size: 220% 100%; animation: vf-shimmer 1.4s ease-in-out infinite; }
.skeleton-pill { height: 22px; border-radius: var(--radius-pill); }
.skeleton-title { height: 18px; width: 80%; }
.skeleton-meta { display: flex; gap: 16px; }
@keyframes vf-shimmer { to { background-position-x: -220%; } }

/* Les cartes de release portent leur propre style (ReleaseCandidateCard). */
.vf-upgrade-list { display: grid; gap: 10px; max-height: 61vh; margin: 0; padding: 0 2px; overflow-y: auto; list-style: none; }
.grab-confirm-[data-state] { display: grid; gap: 12px; margin-top: 14px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-md); overflow-wrap: anywhere; }
.grab-confirm-[data-state] ul { display: grid; gap: 7px; margin: 0; padding: 0; color: var(--amber-text); font-size: var(--fs-sm); list-style: none; }
.grab-confirm-[data-state] li { display: flex; gap: 6px; }
.spin { animation: vf-upgrade-spin 1s linear infinite; }
@keyframes vf-upgrade-spin { to { transform: rotate(360deg); } }
@include bp.until(tablet) {
  .vf-upgrade-toolbar { flex-wrap: wrap; }
  .compact-check { margin-left: 0; }
  .vf-upgrade-list { max-height: 56vh; }
}
@container panel (max-width: 429px) {
  .compact-search-button { width: 100%; justify-content: center; }
}
</style>
