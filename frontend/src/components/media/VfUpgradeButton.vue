<template>
  <span class="vf-upgrade-wrap" @click.stop>
    <button v-if="label" type="button" class="badge mdh-link vf-upgrade-trigger" :class="{ active: hasSuggestion }" @click="toggle">
      <Search :size="14" /> {{ label }}<strong v-if="hasSuggestion" class="vf-upgrade-count">{{ publishedReleases.length }}</strong>
    </button>
    <UiButton v-else class="vf-upgrade-trigger" :class="{ active: hasSuggestion }" :title="triggerTitle" :aria-label="triggerTitle" @click="toggle">
      <Search v-if="!hasSuggestion" :size="16" />
      <span v-else class="vf-upgrade-count vf-upgrade-badge">{{ publishedReleases.length }}</span>
    </UiButton>

    <ModalShell v-if="open" :title="modalTitle" :subtitle="`Recherche via ${arrName}`" panel-class="vf-upgrade-modal" :error="error" :busy="Boolean(grabbing)" @close="open=false">
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
        <li v-for="(release,index) in visibleReleases" :key="release.guid" class="vf-upgrade-release" :class="{ rejected: isRejected(release), recommended: index===0 && !isRejected(release) }">
          <header class="release-head">
            <div class="release-title-wrap">
              <div class="release-badges badge-row">
                <span v-if="index===0 && !isRejected(release)" class="badge available recommended-badge">
                  <Sparkles :size="12" /> Recommandée
                </span>
                <span v-if="releaseTechnical(release).resolution" class="badge" :class="{'badge-4k': releaseTechnical(release).resolution==='2160p'}">
                  {{ releaseTechnical(release).resolution }}
                </span>
                <span v-if="releaseTechnical(release).french" class="badge available">
                  {{ releaseTechnical(release).french }}
                </span>
                <span v-if="releaseTechnical(release).dolbyVision || releaseTechnical(release).hdr" class="badge hdr-badge">
                  {{ releaseTechnical(release).dolbyVision ? 'DV · HDR' : 'HDR' }}
                </span>
                <span v-if="releaseTechnical(release).source" class="badge pending">
                  {{ releaseTechnical(release).source }}
                </span>
                <span v-if="releaseTechnical(release).codec" class="badge pending">
                  {{ releaseTechnical(release).codec }}
                </span>
                <span v-if="release.custom_format_score" class="badge pending score-badge" title="Score Custom Format">
                  Score: +{{ release.custom_format_score }}
                </span>
              </div>
              <strong class="vf-upgrade-release-title">{{ release.title }}</strong>
            </div>
            <UiButton icon-only class="copy-button" title="Copier le nom" aria-label="Copier le nom de la release" @click="copyTitle(release.title)"><Copy :size="15" /></UiButton>
          </header>

          <!-- Motif de rejet explicite et lisible directement -->
          <div v-if="isRejected(release)" class="release-rejections-box">
            <div class="rejection-box-header">
              <span class="badge danger"><TriangleAlert :size="12" /> Rejeté par {{ arrName }}</span>
            </div>
            <ul class="rejection-reasons-list">
              <li v-for="reason in release.rejections" :key="reason">{{ translateRejection(reason) }}</li>
            </ul>
          </div>

          <dl class="vf-upgrade-release-meta release-primary-meta">
            <div><dt>Qualité</dt><dd>{{ release.quality || releaseTechnical(release).resolution || '—' }}</dd></div>
            <div><dt>Taille</dt><dd>{{ formatSize(release.size) }}</dd></div>
            <div><dt>Indexeur</dt><dd>{{ release.indexer || '—' }}</dd></div>
            <div>
              <dt>Sources</dt>
              <dd>
                <span class="badge seed-badge" :class="(release.seeders ?? 0) > 5 ? 'available' : (release.seeders ?? 0) > 0 ? 'pending_approval' : 'danger'">
                  {{ release.protocol === 'usenet' ? 'Usenet' : `${release.seeders || 0} seed${(release.seeders ?? 0) > 1 ? 's' : ''}` }}
                </span>
              </dd>
            </div>
          </dl>

          <div class="vf-upgrade-release-actions">
            <UiButton v-if="release.info_url" size="sm" :href="release.info_url" target="_blank" rel="noopener noreferrer"><template #icon><ExternalLink :size="14" /></template>Indexeur</UiButton>
            <UiButton variant="primary" size="sm" :loading="grabbing===release.guid" :disabled="Boolean(grabbing) || grabDisabled" @click="requestGrab(release)"><template #icon><Download :size="14" /></template>{{ grabbing===release.guid ? 'Envoi…' : 'Grab' }}</UiButton>
          </div>

          <CollapsibleRoot v-if="hasReleaseDetails(release)" class="release-details" :unmount-on-hide="false">
            <CollapsibleTrigger class="collapsible-trigger">Détails complémentaires</CollapsibleTrigger><CollapsibleContent class="collapsible-content">
            <dl class="vf-upgrade-release-meta release-secondary-meta">
              <div><dt>Publiée le</dt><dd>{{ formatReleaseDate(release.publish_date) }}</dd></div>
              <div><dt>Score CF</dt><dd>{{ release.custom_format_score ?? 0 }}</dd></div>
              <div v-if="mode==='vf'"><dt>Confiance VF</dt><dd>{{ release.vf_confidence || 0 }} %</dd></div>
            </dl>
            <div v-if="mode==='vf' && hasCurrentComparison()" class="release-comparison">
              <div><span>Actuel</span><strong>{{ technicalSummary(comparisonFor(release).current) }}</strong></div>
              <ArrowRight :size="16" />
              <div><span>Candidate</span><strong>{{ technicalSummary(comparisonFor(release).candidate) }}</strong></div>
            </div>
            <ul v-if="mode==='vf' && comparisonFor(release).warnings.length" class="technical-warnings">
              <li v-for="warning in comparisonFor(release).warnings" :key="warning"><TriangleAlert :size="13" /> {{ warning }}</li>
            </ul>
            <p v-if="release.vf_evidence?.length" class="vf-upgrade-evidence">{{ release.vf_evidence.join(' · ') }}</p>
          </CollapsibleContent></CollapsibleRoot>
        </li>
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
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui';
import { humanizeError } from '@/utils/apiError';
import { computed, onMounted, ref } from 'vue';
import { ArrowRight, Copy, Download, ExternalLink, RefreshCw, Search, Sparkles, TriangleAlert } from '@lucide/vue';

import ConfirmModal from '@/components/ConfirmModal.vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import { useVfUpgrade } from '@/composables/useVfUpgrade';
import { api } from '@/api';
import { compareReleaseTitles, parseReleaseTitle, releaseDecisionScore, translateRejection } from '@/utils/releaseTitle';
import type { VfUpgradeRelease } from '@/types/vfUpgrades';
import { formatDate as formatSharedDate } from '@/utils/format';

const props = withDefaults(
  defineProps<{
    sourceType: string;
    sourceId: number;
    scope: string;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
    mediaTitle?: string;
    label?: string;
  }>(),
  {
    seasonNumber: null,
    episodeNumber: null,
    mediaTitle: '',
    label: '',
  }
);

const emit = defineEmits<{
  (e: 'updated'): void;
}>();

const { suggestion, loading, scanning, grabbing, error, feedback, scanSummary, load, scan, grab } =
  useVfUpgrade(props.sourceType, props.sourceId, props.scope, props.seasonNumber, props.episodeNumber);
const open = ref(false);
const hideRejected = ref(false);
const confirmRelease = ref<VfUpgradeRelease | any | null>(null);
const mode = ref<'all' | 'vf'>('all');
const normalReleases = ref<VfUpgradeRelease[]>([]);
const normalLoading = ref(false);
let loaded = false;

const activeReleases = computed(() => (mode.value === 'vf' ? ((suggestion.value?.releases || []) as VfUpgradeRelease[]) : normalReleases.value));
const publishedReleases = computed(() => activeReleases.value.filter((release: VfUpgradeRelease) => !(release.protocol === 'torrent' && !release.seeders)));
const hasSuggestion = computed(() => Boolean(publishedReleases.value.length));
const isActiveOrVerified = computed(() => ['accepted', 'downloading', 'importing', 'awaiting_verification', 'verified', 'grabbed'].includes(suggestion.value?.status || ''));
const statusLabel = computed(() => {
  const map: Record<string, string> = {
    accepted: 'Acceptée par *arr',
    downloading: 'Téléchargement en cours',
    importing: 'Import en cours',
    awaiting_verification: 'Vérification VF en attente',
    verified: 'VF vérifiée',
    grabbed: 'Envoyée à *arr',
  };
  return (suggestion.value?.status && map[suggestion.value.status]) || 'Suggestion';
});
const sortedReleases = computed(() => [...publishedReleases.value].sort((a, b) => releaseDecisionScore(a) - releaseDecisionScore(b)));
const visibleReleases = computed(() => (hideRejected.value ? sortedReleases.value.filter((release) => !isRejected(release)) : sortedReleases.value));
const normalReleaseCount = computed(() => normalReleases.value.filter((release) => !(release.protocol === 'torrent' && !release.seeders)).length);
const vfReleaseCount = computed(() => ((suggestion.value?.releases || []) as VfUpgradeRelease[]).filter((release: VfUpgradeRelease) => !(release.protocol === 'torrent' && !release.seeders)).length);
const modeOptions = computed(() => [
  { value: 'all' as const, label: 'Toutes les releases', count: normalReleaseCount.value },
  { value: 'vf' as const, label: 'VF', count: vfReleaseCount.value },
]);
const rejectedCount = computed(() => sortedReleases.value.filter(isRejected).length);
const searching = computed(() => scanning.value || normalLoading.value);
const grabDisabled = computed(() => mode.value === 'vf' && isActiveOrVerified.value);
const arrName = computed(() => (props.scope === 'movie' ? 'Radarr' : 'Sonarr'));
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
const emptyMessage = computed(() =>
  mode.value === 'vf' && (scanSummary.value?.raw ?? 0) > 0
    ? 'Des releases existent, mais aucune ne correspond aux critères VF configurés.'
    : 'Aucune release retournée par les indexeurs pour cette portée.'
);
const feedbackClass = computed(() => (scanSummary.value?.matched === 0 && !isActiveOrVerified.value ? 'warning-text' : 'success-text'));
const confirmWarnings = computed(() =>
  confirmRelease.value
    ? [...comparisonFor(confirmRelease.value).warnings, ...(confirmRelease.value.rejections || []).map(translateRejection)]
    : []
);

function isRejected(release: any): boolean {
  return Boolean(release.rejected || release.rejections?.length);
}
function releaseTechnical(release: any): any {
  return parseReleaseTitle(release.title);
}
/* Deux comparatifs se superposent, et celui du serveur fait autorité.
 *
 * Le comparatif client ne lit que les titres de release : il ignore donc le HDR connu
 * du seul `mediaInfo` de *arr et le score de custom format. Le serveur, lui, compare le
 * profil réel du fichier en place (voir services/vf_technical_guard.py) et c'est lui
 * qui refuse le grab. On affiche donc ses conclusions quand il en a, et on retombe sur
 * l'analyse des titres pour une release qu'il n'a pas annotée (ancienne suggestion
 * enregistrée avant cette version, ou recherche *arr classique hors mode VF). */
function serverComparison(release: any): any | null {
  return release?.vf_technical || null;
}
function technicalWarnings(release: any): string[] {
  const fromServer = release?.vf_technical_reasons || [];
  if (fromServer.length) return fromServer;
  if (serverComparison(release)) return [];
  return compareReleaseTitles(suggestion.value?.current_release_titles || [], release.title).warnings;
}
function comparisonFor(release: any): any {
  const authoritative = serverComparison(release);
  if (authoritative) {
    return {
      current: serverProfileSummary(authoritative.current),
      candidate: serverProfileSummary(authoritative.candidate),
      warnings: technicalWarnings(release),
    };
  }
  const parsed = compareReleaseTitles(suggestion.value?.current_release_titles || [], release.title);
  return { ...parsed, warnings: technicalWarnings(release) };
}
function serverProfileSummary(profile: any): any {
  return {
    resolution: profile?.resolution ? `${profile.resolution}p` : null,
    hdr: (profile?.dynamic_range || []).includes('hdr'),
    dolbyVision: (profile?.dynamic_range || []).includes('dv'),
    source: profile?.quality || null,
    customFormatScore: profile?.custom_format_score,
  };
}
function hasCurrentComparison(): boolean {
  return Boolean(suggestion.value?.current_release_titles?.length);
}
function technicalSummary(value: any): string {
  const entries = [
    value.resolution,
    value.dolbyVision ? 'Dolby Vision' : value.hdr ? 'HDR' : null,
    value.codec,
    ...(value.codecs || []),
    value.source,
    ...(value.sources || []),
  ];
  return [...new Set(entries.filter(Boolean))].join(' · ') || 'Marqueurs inconnus';
}
function formatSize(value: number | undefined): string {
  return value ? `${(value / 1024 ** 3).toFixed(1)} Go` : '—';
}
function formatReleaseDate(value: string | number): string {
  return formatSharedDate(value, '—');
}
function hasReleaseDetails(release: any): boolean {
  return Boolean(
    release.publish_date ||
      release.custom_format_score ||
      release.vf_confidence ||
      release.vf_evidence?.length ||
      (mode.value === 'vf' && (hasCurrentComparison() || comparisonFor(release).warnings.length))
  );
}
async function copyTitle(title: string | undefined): Promise<void> {
  if (!title) return;
  try {
    await navigator.clipboard.writeText(title);
    feedback.value = 'Nom de la release copié.';
  } catch {
    feedback.value = 'Impossible de copier automatiquement ce nom.';
  }
}
async function grabNormal(release: any): Promise<void> {
  grabbing.value = release.guid;
  error.value = '';
  try {
    const result = await api<{ message?: string }>('/api/arr/grab', {
      method: 'POST',
      body: JSON.stringify({
        media_type: props.scope === 'movie' ? 'movie' : 'show',
        guid: release.guid,
        indexer_id: release.indexer_id,
        instance_id: release.arr_instance_id,
        source_type: props.sourceType,
        source_id: props.sourceId,
        scope: props.scope,
        season_number: props.seasonNumber,
        episode_number: props.episodeNumber,
      }),
    });
    feedback.value = result.message || 'Release envoyée à *arr.';
    await load({ preserveFeedback: true });
    emit('updated');
  } catch (e: any) {
    error.value = humanizeError(e);
  } finally {
    grabbing.value = null;
  }
}
async function requestGrab(release: any): Promise<void> {
  if (
    isRejected(release)
    || release.vf_technical_blocked
    || (mode.value === 'vf' && comparisonFor(release).warnings.length)
  ) {
    confirmRelease.value = release;
    return;
  }
  if (mode.value === 'vf') {
    /* Volontairement SANS `force` : ce chemin est celui d'une release qu'on croit
       saine. Forcer systématiquement ici désarmait les garde-fous du serveur (release
       refusée par le profil *arr, régression technique) pour tout grab passant par
       cette interface. Une release à risque passe par la confirmation ci-dessous, qui
       est le seul endroit légitime pour forcer. */
    await grab(release);
    emit('updated');
  } else {
    await grabNormal(release);
  }
}
async function confirmGrab(): Promise<void> {
  const release = confirmRelease.value;
  if (!release) return;
  if (mode.value === 'vf') {
    await grab(release, { force: true });
    emit('updated');
  } else {
    await grabNormal(release);
  }
  if (!error.value) confirmRelease.value = null;
}
async function searchNormal(): Promise<void> {
  normalLoading.value = true;
  error.value = '';
  feedback.value = '';
  try {
    const params = new URLSearchParams({
      media_type: props.scope === 'movie' ? 'movie' : 'show',
      source_type: props.sourceType,
      source_id: String(props.sourceId),
      prefer_french: 'false',
    });
    if (props.seasonNumber != null) params.set('season_number', String(props.seasonNumber));
    if (props.episodeNumber != null) params.set('episode_number', String(props.episodeNumber));
    normalReleases.value = await api<VfUpgradeRelease[]>(`/api/arr/releases?${params}`);
  } catch (e: any) {
    error.value = humanizeError(e);
  } finally {
    normalLoading.value = false;
  }
}
async function runSearch(): Promise<void> {
  await Promise.allSettled([scan(), searchNormal()]);
  emit('updated');
}
function handleModeChange(value: string | number): void {
  if (value === 'all' || value === 'vf') void selectMode(value);
}

async function selectMode(value: 'all' | 'vf'): Promise<void> {
  mode.value = value;
  if (value === 'all' && !normalReleases.value.length) await searchNormal();
  if (value === 'vf') {
    await load();
    if (!hasSuggestion.value) await scan();
  }
}
async function toggle(): Promise<void> {
  open.value = true;
  if (!loaded) {
    loaded = true;
    await Promise.allSettled([load(), searchNormal()]);
  }
}
onMounted(load);
</script>

<style scoped lang="scss">
.vf-upgrade-wrap { display: inline-flex; }
.vf-upgrade-trigger.active { color: var(--accent); border-color: var(--accent); }
.vf-upgrade-count { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; padding: 0 4px; border-radius: var(--radius-pill); background: var(--accent); color: var(--on-accent); font-size: var(--fs-xs); font-weight: 700; }
.vf-upgrade-badge { min-width: 20px; height: 20px; font-size: var(--fs-xs); }
:deep(.vf-upgrade-modal) { width: min(880px, 96vw); max-height: 92vh; }
.vf-upgrade-toolbar { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; padding: 9px 0 12px; border-bottom: 1px solid var(--border); }
.compact-search-button, .compact-check, .release-head, .vf-upgrade-release-actions, .arr-status { display: flex; align-items: center; gap: 7px; }
.compact-search-button { min-height: 38px; }
.release-result-count { color: var(--muted); font-size: var(--fs-xs); white-space: nowrap; }
.compact-check { margin-left: auto; font-size: var(--fs-xs); white-space: nowrap; cursor: pointer; }
.arr-status > div { display: grid; gap: 2px; }
.arr-status span { color: var(--muted); font-size: var(--fs-xs); }

/* Squelettes animés */
.release-skeletons { display: grid; gap: 10px; max-height: 61vh; overflow-y: auto; padding: 2px; }
.release-skeleton-card { display: grid; gap: 10px; padding: 13px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-hover); }
.skeleton-badges { display: flex; gap: 6px; }
.skeleton-box { display: block; border-radius: var(--radius-xs); background: linear-gradient(100deg, var(--surface-2) 20%, color-mix(in srgb, var(--surface-2) 55%, var(--border)) 40%, var(--surface-2) 60%); background-size: 220% 100%; animation: vf-shimmer 1.4s ease-in-out infinite; }
.skeleton-pill { height: 22px; border-radius: var(--radius-pill); }
.skeleton-title { height: 18px; width: 80%; }
.skeleton-meta { display: flex; gap: 16px; }
@keyframes vf-shimmer { to { background-position-x: -220%; } }

.vf-upgrade-list { display: grid; gap: 10px; max-height: 61vh; margin: 0; padding: 0 2px; overflow-y: auto; list-style: none; }
.vf-upgrade-release { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px 14px; padding: 13px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-hover); transition: border-color var(--motion-duration-instant) var(--motion-ease-standard), background var(--motion-duration-instant) var(--motion-ease-standard); }
.vf-upgrade-release.recommended { border-color: color-mix(in srgb, var(--accent) 70%, var(--border)); background: color-mix(in srgb, var(--accent) 4%, var(--surface-hover)); }
.vf-upgrade-release.rejected { opacity: .88; border-left: 3px solid var(--danger); }
.release-head { grid-column: 1 / -1; align-items: flex-start; justify-content: space-between; }
.release-title-wrap { display: grid; gap: 6px; min-width: 0; }
.release-badges { gap: 6px; }
.recommended-badge { border-color: var(--accent); color: var(--accent); font-weight: 700; background: color-mix(in srgb, var(--accent) 15%, var(--surface)); }
.badge-4k { border-color: color-mix(in srgb, var(--blue) 60%, transparent); color: var(--blue-text); background: color-mix(in srgb, var(--blue) 12%, transparent); }
.hdr-badge { border-color: color-mix(in srgb, var(--violet) 60%, transparent); color: var(--violet-text); background: color-mix(in srgb, var(--violet) 12%, transparent); }
.score-badge { border-color: color-mix(in srgb, var(--accent) 50%, transparent); color: var(--accent); }
.seed-badge { font-weight: 600; }
.vf-upgrade-release-title { font-size: var(--fs-sm); line-height: 1.4; overflow-wrap: anywhere; word-break: break-word; }
.copy-button { flex: 0 0 auto; }

/* Bloc de rejets clair et immédiat */
.release-rejections-box { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 5px; padding: 8px 10px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--danger) 10%, var(--surface)); border-left: 3px solid var(--danger); }
.rejection-box-header { display: flex; align-items: center; gap: 6px; }
.rejection-reasons-list { margin: 0; padding-left: 18px; color: var(--red-text); font-size: var(--fs-xs); display: grid; gap: 3px; }

.vf-upgrade-release-meta { display: grid; gap: 7px; margin: 0; }
.release-primary-meta { grid-template-columns: repeat(4,minmax(72px,auto)); align-items: center; }
.release-secondary-meta { grid-template-columns: repeat(3,minmax(0,1fr)); }
.vf-upgrade-release-meta > div { display: grid; gap: 2px; font-size: var(--fs-xs); }
.vf-upgrade-release-meta dt { color: var(--muted); }
.vf-upgrade-release-meta dd { margin: 0; font-weight: 650; }
.vf-upgrade-release-actions { align-self: center; justify-content: flex-end; }
.vf-upgrade-release-actions a, .vf-upgrade-release-actions button { display: inline-flex; align-items: center; gap: 6px; text-decoration: none; min-height: 36px; padding: 0 12px; }
.release-[data-state] { grid-column: 1 / -1; padding-top: 8px; border-top: 1px solid var(--border); }
.release-[data-state] .collapsible-trigger { width: fit-content; color: var(--muted); font-size: var(--fs-xs); font-weight: 650; cursor: pointer; }
.release-[data-state][data-state="open"] .collapsible-trigger { margin-bottom: 10px; color: var(--text); }
.release-[data-state] > * + * { margin-top: 9px; }
.release-comparison { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; padding: 9px; border-radius: var(--radius-sm); background: var(--surface); }
.release-comparison > div { display: grid; gap: 2px; }
.release-comparison span { color: var(--muted); font-size: var(--fs-xs); text-transform: uppercase; }
.release-comparison strong { font-size: var(--fs-xs); }
.technical-warnings { display: grid; gap: 4px; margin: 0; padding: 0; color: var(--amber-text); font-size: var(--fs-xs); list-style: none; }
.technical-warnings li { display: flex; align-items: center; gap: 5px; }
.vf-upgrade-evidence { margin: 0; color: var(--green-text); font-size: var(--fs-xs); }
.grab-confirm-[data-state] { display: grid; gap: 12px; margin-top: 14px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-md); overflow-wrap: anywhere; }
.grab-confirm-[data-state] ul { display: grid; gap: 7px; margin: 0; padding: 0; color: var(--amber-text); font-size: var(--fs-sm); list-style: none; }
.grab-confirm-[data-state] li { display: flex; gap: 6px; }
.spin { animation: vf-upgrade-spin 1s linear infinite; }
@keyframes vf-upgrade-spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) {
  :deep(.vf-upgrade-modal) { width: 96vw; }
  .vf-upgrade-toolbar { flex-wrap: wrap; }
  .compact-check { margin-left: 0; }
  .vf-upgrade-list { max-height: 56vh; }
  .vf-upgrade-release { grid-template-columns: 1fr; }
  .release-primary-meta { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .vf-upgrade-release-actions { justify-content: stretch; }
  .vf-upgrade-release-actions > * { flex: 1; justify-content: center; min-height: 42px; }
}
@media (max-width: 480px) {
  .compact-search-button { width: 100%; justify-content: center; }
  .release-secondary-meta { grid-template-columns: 1fr 1fr; }
  .release-comparison { grid-template-columns: 1fr; }
  .release-comparison > svg { transform: rotate(90deg); }
}
</style>
