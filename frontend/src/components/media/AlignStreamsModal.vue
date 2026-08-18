<template>
  <ModalShell
    :open="open"
    :title="`Alignement Plex : ${item?.title || 'Média'}`"
    :subtitle="item ? `${item.media_type === 'movie' ? 'Film' : 'Série'}${item.year ? ' • ' + item.year : ''}` : ''"
    panel-class="align-streams-modal"
    :error="error"
    :busy="busy"
    @close="requestClose"
  >
    <!-- Chargement de la prévisualisation -->
    <div v-if="loading" class="preview-loading">
      <RotateCcw :size="24" class="spin" />
      <span>Analyse des flux Plex en direct…</span>
    </div>

    <div v-else-if="preview" class="align-streams-body">
      <!-- Portée pour les séries : série entière, ou sélection ciblée d'épisodes/saisons -->
      <section v-if="isShow" class="episode-scope-section">
        <header class="section-subtitle">
          <ListVideo :size="16" />
          <span>Portée de l'alignement</span>
          <button
            type="button"
            class="rescan-all-btn"
            :disabled="busy || rescanning"
            @click="rescanAll"
          >
            <RotateCcw :size="13" :class="{ spin: rescanning }" />
            Réanalyser toute la série
          </button>
        </header>

        <div class="target-mode-options">
          <label class="radio-option">
            <input v-model="scopeMode" type="radio" value="selection" :disabled="busy">
            <div class="radio-content">
              <strong>Sélection ciblée</strong>
              <span>Choisir précisément les épisodes/saisons — présélectionné : ce qui a besoin d'être réaligné</span>
            </div>
          </label>

          <label class="radio-option">
            <input v-model="scopeMode" type="radio" value="series" :disabled="busy">
            <div class="radio-content">
              <strong>Toute la série</strong>
              <span>Aligne tous les épisodes de toutes les saisons, sans distinction</span>
            </div>
          </label>
        </div>

        <template v-if="scopeMode === 'selection'">
          <label class="show-all-toggle">
            <input type="checkbox" v-model="showAllEpisodes" :disabled="busy">
            <span>Afficher tous les épisodes (pas seulement ceux à réaligner)</span>
          </label>

          <div v-if="!seasonsData.length" class="scope-loading">
            <RotateCcw :size="14" class="spin" />
            <span>Chargement du scan VF…</span>
          </div>
          <SeasonEpisodeList
            v-else
            :seasons="seasonsData"
            :episode-filter="activeFilter"
            @expand-season="seasons.loadSeason"
          >
            <template #season-header="{ season, episodes: eps }">
              <div class="season-header-row">
                <strong>Saison {{ season.season_number }}</strong>
                <span v-if="eps.length" class="badge pending">{{ eps.length }}</span>
                <button
                  type="button"
                  class="icon-button"
                  :disabled="busy || rescanning"
                  title="Réanalyser cette saison"
                  @click.stop="rescanSeason(season.season_number)"
                >
                  <RotateCcw :size="13" />
                </button>
              </div>
            </template>

            <template #episode="{ season, episode: ep }">
              <label class="episode-check-item" :class="{ active: isEpisodeSelected(season.season_number, ep.episode) }" @click.stop>
                <input
                  type="checkbox"
                  :checked="isEpisodeSelected(season.season_number, ep.episode)"
                  :disabled="busy"
                  @change="toggleEpisode(season.season_number, ep.episode)"
                >
                <span class="episode-label"><strong>{{ ep.episode }}.</strong> {{ ep.title }}</span>
                <button
                  type="button"
                  class="icon-button"
                  :disabled="busy || rescanning"
                  title="Réanalyser cet épisode"
                  @click.stop="rescanEpisode(season.season_number, ep.episode)"
                >
                  <RotateCcw :size="12" />
                </button>
              </label>
            </template>
          </SeasonEpisodeList>
          <UiEmptyState v-if="seasonsData.length && !hasAnyVisibleEpisode" title="Aucun épisode" message="Aucun épisode ne correspond à ce filtre." compact />
        </template>
      </section>

      <!-- Résumé de la portée -->
      <div class="scope-notice">
        <SlidersHorizontal :size="16" />
        <span>
          Alignement prévu sur <strong>{{ preview.total_parts || 1 }}</strong>
          {{ (preview.total_parts || 1) > 1 ? (preview.media_type === 'show' ? 'épisodes' : 'parties') : 'média' }}.
        </span>
      </div>

      <!-- Choix de la stratégie / Mode d'alignement -->
      <section class="align-mode-section">
        <header class="section-subtitle">
          <SlidersHorizontal :size="16" />
          <span>Mode d'alignement</span>
        </header>

        <div class="target-mode-options">
          <label class="radio-option">
            <input v-model="alignMode" type="radio" value="auto" :disabled="busy">
            <div class="radio-content">
              <strong>Automatique intelligent (PASTA)</strong>
              <span>Sélectionne automatiquement la meilleure piste française (VFF prioritaire) et les sous-titres adaptés</span>
            </div>
          </label>

          <label class="radio-option">
            <input v-model="alignMode" type="radio" value="custom" :disabled="busy">
            <div class="radio-content">
              <strong>Personnalisé (Choix libre)</strong>
              <span>Choisir manuellement n'importe quelle piste audio et sous-titre parmi les flux disponibles</span>
            </div>
          </label>
        </div>

        <!-- Sélecteurs manuels de flux (si mode personnalisé) -->
        <div v-if="alignMode === 'custom'" class="custom-streams-pickers">
          <div class="form-group">
            <label for="custom-audio-select" class="form-label">
              <Volume2 :size="14" /> Piste audio souhaitée
            </label>
            <select id="custom-audio-select" v-model="customAudioId" class="ui-select" :disabled="busy">
              <option v-for="stream in (preview.all_audio_streams || [])" :key="stream.id" :value="stream.id">
                {{ stream.title || stream.language?.toUpperCase() || 'Audio' }}
                {{ stream.codec ? `(${stream.codec.toUpperCase()}${stream.channels ? ' ' + stream.channels : ''})` : '' }}
                {{ stream.id === preview.current_audio?.id ? ' — [Actuelle]' : '' }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label for="custom-sub-select" class="form-label">
              <MessageSquare :size="14" /> Sous-titres souhaités
            </label>
            <select id="custom-sub-select" v-model="customSubtitleId" class="ui-select" :disabled="busy">
              <option :value="0">Désactivés (Aucun sous-titre)</option>
              <option v-for="stream in (preview.all_subtitle_streams || [])" :key="stream.id" :value="stream.id">
                {{ stream.title || stream.language?.toUpperCase() || 'Sous-titre' }}
                {{ stream.forced ? '(Forcé)' : '' }}
                {{ stream.codec ? `[${stream.codec.toUpperCase()}]` : '' }}
                {{ stream.id === preview.current_subtitle?.id ? ' — [Actuel]' : '' }}
              </option>
            </select>
          </div>
        </div>
      </section>

      <!-- Matrice de comparaison des pistes -->
      <section class="streams-comparison-grid" aria-label="Comparatif des flux">
        <!-- Piste Audio -->
        <article class="stream-diff-card" :class="{ 'has-change': audioWillChange }">
          <header class="diff-head">
            <div class="diff-title">
              <Volume2 :size="18" />
              <strong>Piste Audio</strong>
            </div>
            <span v-if="audioWillChange" class="badge badge-warning">Changement</span>
            <span v-else class="badge badge-ok">Déjà optimale</span>
          </header>

          <div class="diff-cols">
            <div class="diff-col current">
              <span class="diff-label">Actuelle</span>
              <div class="diff-value">
                <span v-if="preview.current_audio" class="stream-name">
                  {{ preview.current_audio.title || preview.current_audio.language?.toUpperCase() || 'Piste audio' }}
                </span>
                <span v-else class="text-muted">Inconnue</span>
                <small v-if="preview.current_audio" class="stream-tech">
                  {{ [preview.current_audio.codec, preview.current_audio.channels].filter(Boolean).join(' • ') }}
                </small>
              </div>
            </div>

            <div class="diff-arrow">➜</div>

            <div class="diff-col target">
              <span class="diff-label">Cible</span>
              <div class="diff-value">
                <span v-if="effectiveTargetAudio" class="stream-name highlight">
                  {{ effectiveTargetAudio.title || effectiveTargetAudio.language?.toUpperCase() || 'Piste audio' }}
                </span>
                <span v-else class="text-muted">Aucun changement</span>
                <small v-if="effectiveTargetAudio" class="stream-tech">
                  {{ [effectiveTargetAudio.codec, effectiveTargetAudio.channels].filter(Boolean).join(' • ') }}
                </small>
              </div>
            </div>
          </div>
        </article>

        <!-- Piste Sous-titres -->
        <article class="stream-diff-card" :class="{ 'has-change': subtitleWillChange }">
          <header class="diff-head">
            <div class="diff-title">
              <MessageSquare :size="18" />
              <strong>Sous-titres</strong>
            </div>
            <span v-if="subtitleWillChange" class="badge badge-warning">Changement</span>
            <span v-else class="badge badge-ok">Déjà optimaux</span>
          </header>

          <div class="diff-cols">
            <div class="diff-col current">
              <span class="diff-label">Actuels</span>
              <div class="diff-value">
                <span v-if="preview.current_subtitle" class="stream-name">
                  {{ preview.current_subtitle.title || preview.current_subtitle.language?.toUpperCase() || 'Sous-titres' }}
                  <small v-if="preview.current_subtitle.forced">(Forcés)</small>
                </span>
                <span v-else class="text-muted">Désactivés</span>
                <small v-if="preview.current_subtitle?.codec" class="stream-tech">
                  {{ preview.current_subtitle.codec }}
                </small>
              </div>
            </div>

            <div class="diff-arrow">➜</div>

            <div class="diff-col target">
              <span class="diff-label">Cible</span>
              <div class="diff-value">
                <span v-if="effectiveTargetSubtitle" class="stream-name highlight">
                  {{ effectiveTargetSubtitle.title || effectiveTargetSubtitle.language?.toUpperCase() || 'Sous-titres' }}
                  <small v-if="effectiveTargetSubtitle.forced">(Forcés)</small>
                </span>
                <span v-else class="text-muted highlight-none">Désactivés</span>
                <small v-if="effectiveTargetSubtitle?.codec" class="stream-tech">
                  {{ effectiveTargetSubtitle.codec }}
                </small>
              </div>
            </div>
          </div>
        </article>
      </section>

      <!-- Sélection des profils Plex Home -->
      <section class="users-selection-section">
        <header class="section-subtitle">
          <Users :size="16" />
          <span>Profils Plex cibles</span>
        </header>

        <div class="target-mode-options">
          <label class="radio-option">
            <input
              v-model="targetMode"
              type="radio"
              value="all"
              :disabled="busy"
            >
            <div class="radio-content">
              <strong>Tous les profils</strong>
              <span>Applique automatiquement ces pistes pour l'administrateur et tous les utilisateurs partagés (Plex Home et invités)</span>
            </div>
          </label>

          <label class="radio-option">
            <input
              v-model="targetMode"
              type="radio"
              value="custom"
              :disabled="busy"
            >
            <div class="radio-content">
              <strong>Profils spécifiques</strong>
              <span>Choisir manuellement les utilisateurs Plex concernés</span>
            </div>
          </label>
        </div>

        <!-- Liste des utilisateurs si mode custom -->
        <div v-if="targetMode === 'custom'" class="user-checkbox-grid">
          <label
            v-for="user in availableUsers"
            :key="user.name"
            class="user-check-item"
            :class="{ active: selectedUsers.has(user.name) }"
          >
            <input
              type="checkbox"
              :checked="selectedUsers.has(user.name)"
              :disabled="busy"
              @change="toggleUser(user.name)"
            >
            <div class="user-info">
              <span class="user-title">{{ user.title || user.name }}</span>
              <span v-if="user.is_admin" class="user-tag">Admin</span>
              <span v-else-if="user.is_home" class="user-tag user-tag-home">Home</span>
              <span v-else class="user-tag user-tag-guest">Invité</span>
            </div>
          </label>
        </div>
      </section>
    </div>

    <template #actions>
      <UiButton :disabled="busy" @click="requestClose">Annuler</UiButton>
      <UiButton
        variant="primary"
        :loading="busy"
        :disabled="busy || loading || !preview || !scopeIsValid || (targetMode === 'custom' && selectedUsers.size === 0)"
        @click="confirmAlign"
      >
        <template #icon><SlidersHorizontal :size="16" /></template>
        {{ busy ? 'Alignement en cours…' : 'Appliquer l\'alignement' }}
      </UiButton>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ListVideo, MessageSquare, RotateCcw, SlidersHorizontal, Users, Volume2 } from '@lucide/vue';
import { api } from '@/api';
import ModalShell from '@/components/ui/ModalShell.vue';
import SeasonEpisodeList from '@/components/media/SeasonEpisodeList.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import { useSeasonEpisodes } from '@/composables/useSeasonEpisodes';
import { episodeFilters } from '@/utils/episodeFilters';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    item?: any;
    initialScope?: 'series' | 'season' | 'episode' | 'selection';
    initialSeasonNumber?: number | null;
    initialEpisodeNumber?: number | null;
  }>(),
  {
    open: false,
    item: null,
    initialScope: 'selection',
    initialSeasonNumber: null,
    initialEpisodeNumber: null,
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'applied', payload: { item: any; res: any }): void;
}>();

const loading = ref(false);
const busy = ref(false);
const rescanning = ref(false);
const error = ref('');
const preview = ref<any | null>(null);

const alignMode = ref<'auto' | 'custom'>('auto');
const customAudioId = ref<number | null>(null);
const customSubtitleId = ref<number | null>(null);

const targetMode = ref<'all' | 'custom'>('all');
const selectedUsers = ref<Set<string>>(new Set(['Admin']));

const isShow = computed(() => props.item?.media_type === 'show');
const scopeMode = ref<'series' | 'selection'>('selection');
const showAllEpisodes = ref(false);
const selectedEpisodeKeys = ref<Set<string>>(new Set());

function epKey(seasonNumber: number, episodeNumber: number): string {
  return `${seasonNumber}:${episodeNumber}`;
}
function isEpisodeSelected(seasonNumber: number, episodeNumber: number): boolean {
  return selectedEpisodeKeys.value.has(epKey(seasonNumber, episodeNumber));
}
function toggleEpisode(seasonNumber: number, episodeNumber: number): void {
  const next = new Set(selectedEpisodeKeys.value);
  const key = epKey(seasonNumber, episodeNumber);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  selectedEpisodeKeys.value = next;
}

const seasons = useSeasonEpisodes(() => {
  if (!isShow.value || !props.item?.id) return null;
  return {
    source: props.item?.source_type === 'request' ? 'requests' : 'library',
    id: props.item.id,
    mediaType: props.item.media_type,
  };
});
const seasonsData = computed(() => seasons.detail.value?.seasons || []);
const activeFilter = computed(() => (ep: any) => (showAllEpisodes.value ? true : episodeFilters.needsAlignment(ep)));
const hasAnyVisibleEpisode = computed(() =>
  seasonsData.value.some((season: any) => (season.episodes || []).some((ep: any) => activeFilter.value(ep)))
);

const availableUsers = computed(() => preview.value?.available_users || [{ name: 'Admin', title: 'Administrateur', is_admin: true }]);

const effectiveTargetAudio = computed(() => {
  if (alignMode.value === 'auto') return preview.value?.target_audio;
  return (preview.value?.all_audio_streams || []).find((s: any) => s.id === customAudioId.value) || null;
});

const effectiveTargetSubtitle = computed(() => {
  if (alignMode.value === 'auto') return preview.value?.target_subtitle;
  if (customSubtitleId.value === 0) return null;
  return (preview.value?.all_subtitle_streams || []).find((s: any) => s.id === customSubtitleId.value) || null;
});

const audioWillChange = computed(() => {
  const currId = preview.value?.current_audio?.id;
  const targetId = effectiveTargetAudio.value?.id;
  return Boolean(targetId && currId !== targetId);
});

const subtitleWillChange = computed(() => {
  if (alignMode.value === 'auto') return preview.value?.subtitle_will_change;
  const currId = preview.value?.current_subtitle?.id;
  const targetId = effectiveTargetSubtitle.value?.id;
  if (customSubtitleId.value === 0) return Boolean(currId);
  return Boolean(targetId && currId !== targetId);
});

watch(
  () => [props.open, props.item?.id],
  async ([isOpen, itemId]) => {
    if (isOpen && itemId) {
      alignMode.value = 'auto';
      customAudioId.value = null;
      customSubtitleId.value = null;
      scopeMode.value = props.initialScope === 'series' ? 'series' : 'selection';
      showAllEpisodes.value = false;
      selectedEpisodeKeys.value = new Set();
      seasons.reset();
      if (isShow.value) {
        await loadShowScopeData();
      }
      await fetchPreview();
    } else {
      preview.value = null;
      error.value = '';
      targetMode.value = 'all';
    }
  },
  { immediate: true }
);

watch(scopeMode, () => fetchPreview());
watch(selectedEpisodeKeys, () => fetchPreview(), { deep: false });

/** Charge le scan VF en cache puis déplie automatiquement les saisons ciblées. */
async function loadShowScopeData(): Promise<void> {
  await seasons.loadAll();
  if (props.initialScope === 'season' && props.initialSeasonNumber != null) {
    scopeMode.value = 'selection';
    await seasons.loadSeason(props.initialSeasonNumber);
    const season = seasonsData.value.find((s: any) => s.season_number === props.initialSeasonNumber);
    const next = new Set<string>();
    for (const ep of season?.episodes || []) {
      next.add(epKey(props.initialSeasonNumber, ep.episode));
    }
    selectedEpisodeKeys.value = next;
    return;
  }
  if (props.initialScope === 'episode' && props.initialSeasonNumber != null && props.initialEpisodeNumber != null) {
    scopeMode.value = 'selection';
    await seasons.loadSeason(props.initialSeasonNumber);
    selectedEpisodeKeys.value = new Set([epKey(props.initialSeasonNumber, props.initialEpisodeNumber)]);
    return;
  }
  if (props.initialScope === 'series') {
    scopeMode.value = 'series';
    return;
  }
  let targetSeasons = seasonsData.value.filter((season: any) => {
    const c = season.counts || {};
    return (c.vf_secondary || 0) > 0 || (c.sub_fr_not_default || 0) > 0 || (c.forced_fr_not_default || 0) > 0 || (c.partial || 0) > 0;
  });
  if (!targetSeasons.length) {
    targetSeasons = seasonsData.value;
  }
  await Promise.all(targetSeasons.map((season: any) => seasons.loadSeason(season.season_number)));
  applyDefaultSelection();
}

function applyDefaultSelection(): void {
  const next = new Set<string>();
  for (const season of seasonsData.value) {
    for (const ep of season.episodes || []) {
      if (episodeFilters.needsAlignment(ep)) next.add(epKey(season.season_number, ep.episode));
    }
  }
  selectedEpisodeKeys.value = next;
}

function currentEpisodeRefs(): string[] | undefined {
  if (!isShow.value || scopeMode.value === 'series') return undefined;
  return [...selectedEpisodeKeys.value];
}

async function fetchPreview(): Promise<void> {
  if (!props.item?.id) return;
  // En sélection ciblée, tant qu'aucun épisode n'est coché la portée n'est pas définie.
  if (isShow.value && scopeMode.value === 'selection' && selectedEpisodeKeys.value.size === 0) {
    preview.value = null;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams();
    for (const ref of currentEpisodeRefs() || []) params.append('episodes', ref);
    const qs = params.toString();
    const data = await api<any>(`/api/vf-upgrades/audit/${props.item.id}/preview${qs ? `?${qs}` : ''}`);
    preview.value = data;
    const users = data.available_users || [];
    selectedUsers.value = new Set(users.map((u: any) => u.name));
    if (customAudioId.value === null) {
      customAudioId.value = data.target_audio?.id ?? data.current_audio?.id ?? data.all_audio_streams?.[0]?.id ?? null;
    }
    if (customSubtitleId.value === null) {
      customSubtitleId.value = data.target_subtitle ? data.target_subtitle.id : 0;
    }
  } catch (e: any) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function rescanAll(): Promise<void> {
  rescanning.value = true;
  try {
    await seasons.rescan();
    applyDefaultSelection();
    await fetchPreview();
  } finally {
    rescanning.value = false;
  }
}
async function rescanSeason(seasonNumber: number): Promise<void> {
  rescanning.value = true;
  try {
    await seasons.rescan(seasonNumber);
  } finally {
    rescanning.value = false;
  }
}
async function rescanEpisode(seasonNumber: number, episodeNumber: number): Promise<void> {
  rescanning.value = true;
  try {
    await seasons.rescan(seasonNumber, episodeNumber);
  } finally {
    rescanning.value = false;
  }
}

function toggleUser(name: string): void {
  const next = new Set(selectedUsers.value);
  if (next.has(name)) {
    next.delete(name);
  } else {
    next.add(name);
  }
  selectedUsers.value = next;
}

function requestClose(): void {
  if (!busy.value) emit('close');
}

const scopeIsValid = computed(() => {
  if (!isShow.value || scopeMode.value === 'series') return true;
  return selectedEpisodeKeys.value.size > 0;
});

async function confirmAlign(): Promise<void> {
  if (!props.item?.id || !scopeIsValid.value) return;
  busy.value = true;
  error.value = '';
  try {
    const payload: Record<string, unknown> = {
      users: targetMode.value === 'all' ? ['all'] : Array.from(selectedUsers.value),
      include_home_users: targetMode.value === 'all' || selectedUsers.value.size > 1,
      mode: alignMode.value,
    };
    if (alignMode.value === 'custom') {
      payload.audio_stream_id = customAudioId.value;
      payload.audio_language = effectiveTargetAudio.value?.language;
      payload.subtitle_stream_id = customSubtitleId.value;
      payload.subtitle_language = effectiveTargetSubtitle.value?.language;
      payload.subtitle_forced = effectiveTargetSubtitle.value?.forced;
    }
    const refs = currentEpisodeRefs();
    if (refs?.length) {
      payload.episodes = refs.map((ref) => ref.split(':').map(Number));
    }
    const res = await api(`/api/vf-upgrades/audit/${props.item.id}/fix-streams`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    emit('applied', { item: props.item, res });
    emit('close');
  } catch (e: any) {
    error.value = e?.message || String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
.align-streams-modal {
  max-width: 620px;
  width: 95vw;
}

.preview-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: 48px 16px;
  color: var(--muted);
  font-size: var(--fs-sm);
}

.align-streams-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-top: var(--space-2);
}

.scope-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm);
  color: var(--text);
}

.scope-notice strong {
  color: var(--accent);
}

.align-mode-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.custom-streams-pickers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  padding: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--muted);
}

.ui-select {
  width: 100%;
  padding: 8px 10px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  font-size: var(--fs-sm);
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: var(--accent);
  }
}

/* Grille de comparaison */
.streams-comparison-grid {
  display: grid;
  gap: var(--space-3);
}

.stream-diff-card {
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stream-diff-card.has-change {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 3%, var(--surface));
}

.diff-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.diff-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-sm);
  color: var(--text);
}

.diff-cols {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-xs);
  background: var(--surface-2);
}

.diff-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.diff-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}

.diff-value {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stream-name {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text);
  word-break: break-word;
}

.stream-name.highlight {
  color: var(--green-text, #22c55e);
}

.highlight-none {
  color: var(--muted);
  font-style: italic;
  font-size: var(--fs-xs);
}

.stream-tech {
  color: var(--muted);
  font-size: var(--fs-xs);
}

.diff-arrow {
  color: var(--muted);
  font-size: var(--fs-sm);
}

.badge-ok {
  border-color: rgba(34, 197, 94, 0.4);
  color: var(--green-text, #22c55e);
  background: rgba(34, 197, 94, 0.1);
  font-size: 11px;
}

.badge-warning {
  border-color: rgba(234, 179, 8, 0.5);
  color: #fde047;
  background: rgba(234, 179, 8, 0.14);
  font-size: 11px;
}

/* Portée épisodes (séries) */
.episode-scope-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.episode-scope-section .section-subtitle {
  justify-content: space-between;
}

.rescan-all-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 4px 10px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  cursor: pointer;
}

.rescan-all-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.show-all-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-sm);
  color: var(--muted);
  cursor: pointer;
}

.scope-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-sm);
  color: var(--muted);
  padding: 4px 2px;
}

.season-header-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  color: var(--muted);
  background: transparent;
  border: none;
  border-radius: var(--radius-xs);
  cursor: pointer;
}

.icon-button:hover {
  color: var(--text);
  background: var(--surface-hover, var(--surface-2));
}

.icon-button:disabled {
  opacity: 0.4;
  cursor: default;
}

.episode-check-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  user-select: none;
}

.episode-check-item.active {
  background: var(--surface);
}

.episode-label {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-sm);
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Sélection des utilisateurs */
.users-selection-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}

.section-subtitle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--text);
}

.target-mode-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.radio-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.radio-option:hover {
  border-color: var(--border-hover, var(--border));
}

.radio-option input {
  margin-top: 3px;
}

.radio-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.radio-content strong {
  font-size: var(--fs-sm);
  color: var(--text);
}

.radio-content span {
  font-size: var(--fs-xs);
  color: var(--muted);
}

.user-checkbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 8px;
  margin-top: 6px;
  padding: 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.user-check-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  cursor: pointer;
  user-select: none;
}

.user-check-item.active {
  background: var(--surface);
  border-color: var(--border);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.user-title {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-tag {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
  font-weight: 700;
  flex-shrink: 0;
}

.user-tag-home {
  background: rgba(34, 197, 94, 0.14);
  color: var(--green-text, #22c55e);
}

.user-tag-guest {
  background: rgba(234, 179, 8, 0.14);
  color: #eab308;
}

.spin {
  animation: modal-spin 1s linear infinite;
}

@keyframes modal-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 600px) {
  .diff-cols {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .diff-arrow {
    display: none;
  }
}
</style>
