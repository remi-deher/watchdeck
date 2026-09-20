<template>
  <ModalShell
    title="Associer / Importer"
    :subtitle="row.title"
    panel-class="import-modal"
    :error="error"
    @close="$emit('close')"
  >
    <!-- Le media d'abord : quand la detection *arr a deja trouve la bonne fiche (le cas
         courant), il n'y a rien a saisir ici, juste a confirmer d'un coup d'oeil. La
         recherche ne se deplie que si la detection a echoue ou si l'utilisateur la conteste. -->
    <div class="media-card" :class="{ unidentified: !manual.arr_id }">
      <div class="media-poster">
        <img v-if="manual.poster_url && !posterFailed" :src="manual.poster_url" alt="" @error="posterFailed = true">
        <Clapperboard v-else-if="isMovie" />
        <Tv v-else />
      </div>
      <div class="media-meta">
        <strong v-if="manual.arr_id">{{ manual.title }}</strong>
        <strong v-else class="unknown">Média non identifié</strong>
        <div v-if="manual.arr_id" class="media-line">
          <span>{{ isMovie ? 'Film' : 'Série' }}</span>
          <i class="dot" />
          <span v-if="manual.year">{{ manual.year }}</span>
          <i v-if="manual.year" class="dot" />
          <span>{{ isMovie ? 'Radarr' : 'Sonarr' }}</span>
        </div>
        <div class="media-line">
          <span v-if="manual.arr_id" class="media-chip ok"><Check />Détecté automatiquement</span>
          <span v-else class="media-chip warn"><CircleAlert />{{ isMovie ? 'Sélectionne le film ci-dessous' : 'Sélectionne la série ci-dessous' }}</span>
        </div>
      </div>
      <button v-if="manual.arr_id && !searchOpen" type="button" class="link-btn" @click="openSearch">Changer…</button>
    </div>

    <div v-if="searchOpen" class="search-panel">
      <div class="search-row">
        <input v-model="lookupQuery" :placeholder="isMovie ? 'Chercher dans Radarr…' : 'Chercher dans Sonarr…'" @keyup.enter="lookup">
        <UiButton variant="secondary" :loading="lookupBusy" @click="lookup">
          <template #icon><Search /></template>
          Chercher
        </UiButton>
      </div>
      <p v-if="lookupDone && !lookupResults.length" class="muted-note">Aucun résultat pour « {{ lookupQuery }} ».</p>
      <div v-if="lookupResults.length" class="lookup-list">
        <button
          v-for="item in lookupResults"
          :key="`${item.title}:${item.year}`"
          type="button"
          class="lookup-result"
          :class="{ selected: isSelected(item), unavailable: !item.arr_id }"
          :disabled="!item.arr_id"
          :title="item.arr_id ? undefined : `Cette fiche n'existe pas encore dans ${isMovie ? 'Radarr' : 'Sonarr'} : ajoute-la d'abord pour pouvoir y rattacher ce téléchargement.`"
          @click="pickLookup(item)"
        >
          <span class="result-poster">
            <img v-if="item.poster" :src="item.poster" alt="">
            <Clapperboard v-else-if="isMovie" />
            <Tv v-else />
          </span>
          <span class="result-meta">
            <strong>{{ item.title }}</strong>
            <span>{{ item.year }} · {{ item.arr_id ? (isMovie ? 'Déjà dans Radarr' : 'Déjà dans Sonarr') : (isMovie ? 'Absent de Radarr' : 'Absent de Sonarr') }}</span>
          </span>
          <Check v-if="isSelected(item)" class="result-check" />
        </button>
      </div>
    </div>

    <p v-if="targetsLoading" class="muted-note section">Chargement des fichiers…</p>

    <template v-else-if="manual.arr_id">
      <!-- Destination : propre aux series. Un film n'a ni saison ni episode, la section
           disparait entierement plutot que de laisser une etape vide. -->
      <section v-if="!isMovie" class="section">
        <h3 class="section-label">Destination</h3>
        <div class="field-row">
          <label class="field">Saison
            <select v-model.number="episodeForm.season">
              <option v-for="season in seasonOptions" :key="season" :value="season">Saison {{ season }}</option>
            </select>
          </label>
          <label class="field">Épisode
            <select v-model.number="episodeForm.episode_id">
              <option v-for="episode in filteredEpisodes" :key="episode.id" :value="episode.id">
                E{{ String(episode.episodeNumber).padStart(2, '0') }} · {{ episode.title || 'Sans titre' }}
              </option>
            </select>
          </label>
        </div>
      </section>

      <section class="section">
        <!-- Zero fichier : l'association reste possible mais n'importe rien. C'est la
             seule chose qui change vraiment l'issue de la modale, donc elle est dite en
             clair juste avant les boutons, pas en note de bas de page. -->
        <div v-if="!episodeCandidates.length" class="notice warn">
          <TriangleAlert />
          <div>
            <strong>Aucun fichier importable détecté</strong>
            <span>{{ isMovie
              ? 'Le téléchargement sera rattaché au film dans Radarr, mais aucun fichier ne sera déplacé dans la bibliothèque.'
              : 'Le téléchargement sera rattaché à la série dans Sonarr, mais aucun fichier ne sera déplacé dans la bibliothèque.' }}</span>
          </div>
        </div>

        <!-- Un seul fichier : rien a choisir, on le montre et on passe. -->
        <template v-else-if="episodeCandidates.length === 1">
          <h3 class="section-label">Fichier à importer</h3>
          <div class="file-line">
            <FileVideo />
            <span class="file-name">
              <code>{{ candidateName(episodeCandidates[0]) }}</code>
              <small>{{ candidateDetails(episodeCandidates[0]) }}</small>
            </span>
          </div>
        </template>

        <!-- Plusieurs fichiers : c'est un pack. Un simple selecteur laisserait le fichier
             et l'episode choisis se contredire, donc chaque ligne affiche l'episode
             deduit par le back et le clic realigne les selects ci-dessus. -->
        <template v-else>
          <h3 class="section-label">
            <span>Fichier à importer</span>
            <span class="section-count">{{ episodeCandidates.length }} fichiers</span>
          </h3>
          <div class="file-list">
            <button
              v-for="(candidate, index) in episodeCandidates"
              :key="candidate.path"
              type="button"
              class="file-option"
              :class="{ selected: episodeForm.candidate === index }"
              @click="pickCandidate(index)"
            >
              <FileVideo />
              <span class="file-name">
                <code>{{ candidateName(candidate) }}</code>
                <small>{{ candidateDetails(candidate) }}</small>
              </span>
              <span v-if="!isMovie && candidateEpisodeLabel(candidate)" class="file-episode">{{ candidateEpisodeLabel(candidate) }}</span>
              <Check v-if="episodeForm.candidate === index" class="result-check" />
            </button>
          </div>
        </template>

        <p v-if="willImport" class="action-hint">
          Le fichier sera déplacé dans la bibliothèque {{ isMovie ? 'Radarr' : 'Sonarr' }}.
        </p>
      </section>
    </template>

    <template #actions>
      <UiButton variant="secondary" :disabled="busy" @click="$emit('close')">Annuler</UiButton>
      <UiButton variant="primary" :loading="busy" :disabled="!canSubmit" @click="submitManual">
        <template #icon><Clapperboard v-if="willImport" /><Link v-else /></template>
        {{ submitLabel }}
      </UiButton>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import ModalShell from '@/components/ui/ModalShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Check, CircleAlert, Clapperboard, FileVideo, Link, Search, TriangleAlert, Tv } from '@lucide/vue';
import { api } from '@/api';

const props = defineProps<{ row: Record<string, any> }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submitted'): void;
}>();

const lookupQuery = ref(''), lookupResults = ref<any[]>([]), episodeCandidates = ref<any[]>([]), episodeOptions = ref<any[]>([]);
const targetsLoading = ref(false), busy = ref(false), error = ref('');
const lookupBusy = ref(false), lookupDone = ref(false), searchOpen = ref(false), posterFailed = ref(false);
const manual = reactive<Record<string, any>>({ title: '', year: null, tmdb_id: null, tvdb_id: null, poster_url: null, arr_id: null });
const episodeForm = reactive<Record<string, any>>({ candidate: 0, season: null, episode_id: null });

const isMovie = computed(() => props.row.arr_type === 'radarr');
const seasonOptions = computed(() => [...new Set(episodeOptions.value.map(x => x.seasonNumber).filter(x => x != null && x > 0))].sort((a, b) => a - b));
const filteredEpisodes = computed(() => episodeOptions.value.filter(x => x.seasonNumber === episodeForm.season).sort((a, b) => a.episodeNumber - b.episodeNumber));
const willImport = computed(() => Boolean(manual.arr_id) && !targetsLoading.value && episodeCandidates.value.length > 0);
const canSubmit = computed(() => !busy.value && !targetsLoading.value && Boolean(manual.arr_id) && Boolean(manual.title) && (isMovie.value || Boolean(episodeForm.episode_id)));
const submitLabel = computed(() => {
  if (willImport.value) return 'Associer et importer';
  return isMovie.value ? 'Associer au film' : 'Associer à la série';
});

/** `arr_id` est `null` pour les fiches absentes de *arr : comparer sans ce garde-fou
 *  ferait passer tous ces resultats pour selectionnes (`null === null`). */
function isSelected(item: any): boolean {
  return Boolean(item?.arr_id) && manual.arr_id === item.arr_id;
}

function candidateName(candidate: any): string {
  const raw = candidate?.relativePath || candidate?.name || candidate?.path || '';
  return String(raw).split(/[\\/]/).pop() || String(raw);
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let value = bytes, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1).replace('.', ',')} ${units[unit]}`;
}

/** Qualite, langues et taille : de quoi distinguer deux fichiers d'un meme pack sans lire le chemin complet. */
function candidateDetails(candidate: any): string {
  const parts = [
    candidate?.quality?.quality?.name,
    (candidate?.languages || []).map((lang: any) => lang?.name).filter(Boolean).join(', '),
    formatSize(candidate?.size),
  ].filter(Boolean);
  return parts.join(' · ');
}

/** L'episode devine par le back (`suggested_*`) a partir du nom de fichier. */
function candidateEpisodeLabel(candidate: any): string {
  const season = candidate?.suggested_season, episode = candidate?.suggested_episode;
  if (season == null || episode == null) return '';
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}

function pickCandidate(index: number): void {
  episodeForm.candidate = index;
  if (isMovie.value) return;
  // Choisir un fichier dans un pack, c'est choisir un episode : realigner les selects
  // evite d'importer le fichier de l'E03 en le declarant comme E12.
  const candidate = episodeCandidates.value[index];
  const season = candidate?.suggested_season, episode = candidate?.suggested_episode;
  if (season == null || episode == null) return;
  const match = episodeOptions.value.find(x => x.seasonNumber === season && x.episodeNumber === episode);
  if (!match) return;
  episodeForm.season = season;
  episodeForm.episode_id = match.id;
}

function openSearch(): void {
  searchOpen.value = true;
  lookupQuery.value = manual.title || '';
}

async function lookup(): Promise<void> {
  lookupBusy.value = true;
  try {
    lookupResults.value = await api(`/api/media/lookup?query=${encodeURIComponent(lookupQuery.value)}&type=${isMovie.value ? 'movie' : 'show'}`);
    lookupDone.value = true;
  } catch (e: any) { error.value = e.message; } finally { lookupBusy.value = false; }
}

async function pickLookup(item: any): Promise<void> {
  posterFailed.value = false;
  Object.assign(manual, { title: item.title, year: item.year, tmdb_id: item.tmdb_id, tvdb_id: item.tvdb_id, poster_url: item.poster, arr_id: item.arr_id });
  if (!item.arr_id) return;
  searchOpen.value = false;
  if (isMovie.value) await loadRadarrTargets(); else await loadSonarrTargets();
}

async function loadSonarrTargets(): Promise<void> {
  targetsLoading.value = true;
  try {
    const download = props.row.download_id ? `&download_id=${encodeURIComponent(props.row.download_id)}` : '';
    const data = await api(`/api/downloads/sonarr-manual-import?instance_id=${props.row.instance_id}&series_id=${manual.arr_id}${download}`);
    episodeCandidates.value = data.candidates || [];
    episodeOptions.value = data.episodes || [];
    episodeForm.candidate = 0;
    episodeForm.season = seasonOptions.value.includes(episodeForm.season) ? episodeForm.season : seasonOptions.value[0] || null;
    const preferred = filteredEpisodes.value.find(x => x.episodeNumber === props.row.episode_number);
    episodeForm.episode_id = preferred?.id || filteredEpisodes.value[0]?.id || null;
    // Un seul fichier suffit a lever l'ambiguite : on aligne les selects dessus d'office.
    if (episodeCandidates.value.length === 1) pickCandidate(0);
  } catch (e: any) { error.value = e.message; } finally { targetsLoading.value = false; }
}

async function loadRadarrTargets(): Promise<void> {
  targetsLoading.value = true;
  try {
    const download = props.row.download_id ? `&download_id=${encodeURIComponent(props.row.download_id)}` : '';
    const data = await api(`/api/downloads/radarr-manual-import?instance_id=${props.row.instance_id}&movie_id=${manual.arr_id}${download}`);
    episodeCandidates.value = data.candidates || [];
    episodeForm.candidate = 0;
  } catch (e: any) { error.value = e.message; } finally { targetsLoading.value = false; }
}

async function submitManual(): Promise<void> {
  busy.value = true;
  try {
    await api('/api/downloads/manual-import', { method: 'POST', body: JSON.stringify({ instance_id: props.row.instance_id, media_type: isMovie.value ? 'movie' : 'show', title: manual.title, arr_id: manual.arr_id, year: manual.year, tmdb_id: manual.tmdb_id, tvdb_id: manual.tvdb_id, poster_url: manual.poster_url }) });
    const candidate = episodeCandidates.value[episodeForm.candidate];
    if (!isMovie.value && candidate && episodeForm.episode_id) {
      await api('/api/downloads/sonarr-manual-import', { method: 'POST', body: JSON.stringify({ instance_id: props.row.instance_id, series_id: manual.arr_id, episode_id: episodeForm.episode_id, path: candidate.path, folder_name: candidate.folderName || candidate.folder_name, download_id: props.row.download_id, quality: candidate.quality, languages: candidate.languages, release_group: candidate.releaseGroup, indexer_flags: candidate.indexerFlags }) });
    }
    if (isMovie.value && candidate) {
      await api('/api/downloads/radarr-manual-import', { method: 'POST', body: JSON.stringify({ instance_id: props.row.instance_id, movie_id: manual.arr_id, path: candidate.path, folder_name: candidate.folderName || candidate.folder_name, download_id: props.row.download_id, quality: candidate.quality, languages: candidate.languages, release_group: candidate.releaseGroup, indexer_flags: candidate.indexerFlags }) });
    }
    emit('submitted');
  } catch (e: any) { error.value = e.message; } finally { busy.value = false; }
}

watch(() => episodeForm.season, () => {
  if (!filteredEpisodes.value.some(x => x.id === episodeForm.episode_id)) episodeForm.episode_id = filteredEpisodes.value[0]?.id || null;
});

onMounted(() => {
  Object.assign(manual, { title: props.row.series_title || props.row.title || '', year: props.row.year || null, tmdb_id: props.row.tmdb_id || null, tvdb_id: props.row.tvdb_id || null, poster_url: props.row.poster_url || null, arr_id: props.row.arr_media_id || null });
  lookupQuery.value = manual.title;
  episodeForm.season = props.row.season_number || null;
  // Detection en echec : la recherche est le seul chemin possible, autant l'ouvrir d'emblee.
  if (!manual.arr_id) { searchOpen.value = true; return; }
  if (isMovie.value) loadRadarrTargets(); else loadSonarrTargets();
});
</script>

<style scoped lang="scss">
.media-card {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  gap: var(--space-4);
  align-items: center;
  margin-top: 16px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}
.media-card.unidentified { grid-template-columns: 56px minmax(0, 1fr); }

.media-poster {
  display: grid;
  place-items: center;
  width: 56px;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: linear-gradient(150deg, #3f3f46, #1f1f24);
  color: color-mix(in srgb, var(--muted) 60%, transparent);
}
.media-poster img { width: 100%; height: 100%; object-fit: cover; }
.media-poster svg { width: 20px; height: 20px; }

.media-meta { display: grid; gap: 3px; min-width: 0; }
.media-meta > strong { overflow: hidden; font-size: var(--fs-md); line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.media-meta > strong.unknown { color: var(--muted); font-weight: 600; }
.media-line { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); color: var(--muted); font-size: var(--fs-xs); }
.dot { width: 3px; height: 3px; border-radius: 50%; background: currentcolor; opacity: .6; }

.media-chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: var(--radius-pill); font-size: var(--fs-xs); font-weight: 600; }
.media-chip svg { width: 12px; height: 12px; }
.media-chip.ok { background: color-mix(in srgb, var(--green-text, #4ade80) 16%, transparent); color: var(--green-text, #4ade80); }
.media-chip.warn { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); }

.link-btn { padding: 0; border: 0; background: transparent; color: var(--accent); font: inherit; font-size: var(--fs-xs); font-weight: 600; white-space: nowrap; cursor: pointer; }
.link-btn:hover { text-decoration: underline; }

.search-panel { margin-top: var(--space-3); padding: 14px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-2); }
.search-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-2); }
.muted-note { margin: var(--space-3) 0 0; color: var(--muted); font-size: var(--fs-sm); }
.muted-note.section { margin-top: 20px; }

.lookup-list { display: grid; gap: 6px; max-height: 196px; margin-top: var(--space-3); overflow-y: auto; }
.lookup-result {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: center;
  width: 100%;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.lookup-result:hover:not(:disabled) { background: rgb(255 255 255 / 4.5%); }
.lookup-result.unavailable { cursor: not-allowed; opacity: .5; }
.lookup-result.selected { border-color: color-mix(in srgb, var(--accent) 55%, transparent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
.result-poster { display: grid; place-items: center; width: 34px; aspect-ratio: 2 / 3; overflow: hidden; border-radius: var(--radius-xs, 6px); background: linear-gradient(150deg, #3f3f46, #1f1f24); color: color-mix(in srgb, var(--muted) 60%, transparent); }
.result-poster img { width: 100%; height: 100%; object-fit: cover; }
.result-poster svg { width: 14px; height: 14px; }
.result-meta { display: grid; gap: 2px; min-width: 0; }
.result-meta strong { overflow: hidden; font-size: var(--fs-sm); text-overflow: ellipsis; white-space: nowrap; }
.result-meta > span { color: var(--muted); font-size: var(--fs-xs); }
.result-check { flex: none; width: 16px; height: 16px; color: var(--accent); }

.section { margin-top: 20px; }
.section-label { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin: 0 0 var(--space-2); color: var(--muted); font-size: var(--fs-xs); font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
.section-count { font-weight: 500; letter-spacing: 0; text-transform: none; }

.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
.field { display: grid; gap: 5px; min-width: 0; color: var(--muted); font-size: var(--fs-xs); }

.file-line, .file-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-3);
  align-items: center;
  width: 100%;
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  text-align: left;
}
.file-line > svg, .file-option > svg { flex: none; width: 17px; height: 17px; color: var(--muted); }
.file-name { display: grid; gap: 2px; min-width: 0; }
.file-name code { overflow: hidden; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.file-name small { color: var(--muted); font-size: var(--fs-xs); }

.file-list { display: grid; gap: 6px; max-height: 220px; overflow-y: auto; }
.file-option { grid-template-columns: auto minmax(0, 1fr) auto auto; font: inherit; cursor: pointer; }
.file-option:hover { border-color: color-mix(in srgb, var(--accent) 30%, var(--border)); }
.file-option.selected { border-color: color-mix(in srgb, var(--accent) 55%, transparent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
.file-episode { flex: none; padding: 2px 7px; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); font-size: var(--fs-xs); font-weight: 700; font-variant-numeric: tabular-nums; }

.notice { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-3); padding: 12px 13px; border: 1px solid transparent; border-radius: var(--radius-sm); line-height: 1.5; }
.notice > svg { width: 17px; height: 17px; margin-top: 1px; }
.notice strong { display: block; font-size: var(--fs-sm); }
.notice span { color: var(--muted); font-size: var(--fs-xs); }
.notice.warn { border-color: color-mix(in srgb, var(--accent) 32%, transparent); background: color-mix(in srgb, var(--accent) 9%, transparent); }
.notice.warn > svg { color: var(--accent); }

.action-hint { margin: var(--space-2) 0 0; color: var(--muted); font-size: var(--fs-xs); line-height: 1.4; }

@media (width <= 520px) {
  .field-row { grid-template-columns: 1fr; }
}
</style>
