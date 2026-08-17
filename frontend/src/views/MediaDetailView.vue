<template>
  <div class="media-detail-page">
    <div v-if="loading" class="drawer-loading"><LoaderCircle class="spin" /> Chargement</div>
    <template v-else-if="detail">
      <MediaDetailHero
        :detail="detail"
        :status-label="statusLabel"
        :status-class="statusClass"
        :admin="admin"
        :season-summary="seasonSummary"
        :busy="busy"
        :available="Boolean(detail?.plex_guid)"
        @back="goBack"
        @report-issue="showIssueForm = !showIssueForm"
        @scan="scanVff"
        @open-audio="tab = 'audio'"
        @request="handleRequestClick"
      />

      <div class="media-detail-body">
        <p v-if="error" class="notice error-text">{{ error }}</p>
        <UiFeedback v-if="successMessage" type="success" :message="successMessage" dismissible @dismiss="successMessage=''"/>

        <template v-if="!isMusic">
          <TabNav v-if="tabs.length > 1" v-model="tab" :tabs="mediaTabItems" aria-label="Sections du média" />

          <MediaRequestsTab
            v-if="tab === 'requests'"
            :requests="detail.requests"
            :detail="detail"
            :admin="admin"
            :busy="busy"
            :addable-users="addableUsers"
            v-model:new-requester-id="newRequesterId"
            @add-requester="addRequester"
            @open-release="(id: number) => router.push(`/releases/${id}`)"
            @retry="(id: number) => requestAction(id, 'retry')"
            @catch-up-all="catchUpAll"
            @resend-mail="resendMail"
            @close-request="closeRequest"
            @delete-request="deleteRequest"
            @withdraw-request="withdrawRequest"
            @notify-user="notifyUser"
            @promote-requester="promoteRequester"
            @remove-requester="removeRequester"
            @approve="(id: number) => requestAction(id, 'approve')"
            @reject="rejectRequest"
          />

          <MediaCalendarTab v-else-if="tab === 'calendar'" :events="detail.calendar" />

          <MediaAudioSection
            v-else-if="tab === 'audio' || tab === 'missing'"
            :vf-detail="mergedVfDetail"
            :envelope-error="envelopeError"
            :availability-error="availabilityError"
            :vf-status-error="vfStatusError"
            :source-type="releaseSourceType"
            :source-id="releaseSourceId"
            :admin="admin"
            :media-title="detail.title"
            :missing-only="tab === 'missing'"
            @correction="openCorrection"
            @expand-season="seasons.loadSeason"
          />

          <MediaSummaryTab
            v-else
            :detail="detail"
            :busy="busy"
            :show-issue-form="showIssueForm"
            :show-correction-form="showCorrectionForm"
            :users="users"
            :correction-options="correctionOptions"
            :correction-form="correctionForm"
            :vf-detail="mergedVfDetail"
            @recheck-plex="recheckPlex"
            @open-correction="openCorrection"
            @report-issue="reportIssue"
            @cancel-issue="showIssueForm = false"
            @submit-correction="sendCorrection"
            @cancel-correction="showCorrectionForm = false"
          />
        </template>

        <MediaMusicCatalog
          v-if="isMusic"
          :detail="detail"
          :artist-albums="artistAlbums"
          :album-tracks="albumTracks"
          @open-album="openDetail"
          @listen="openPlexLink"
        />

        <MediaCast v-if="detail.cast?.length && !isMusic" :items="detail.cast" />

        <MediaSaga v-if="detail.saga && !isMusic" :saga="detail.saga" />

        <MediaRecommendations
          v-if="!isMusic"
          title="Recommandés pour vous"
          :items="detail.recommendations || []"
          :requesting="recRequesting"
          @open="item => router.push(relatedMediaPath(item))"
          @request="requestRecMedia"
        />
        <MediaRecommendations
          v-if="!isMusic"
          title="Titres similaires"
          :items="detail.similar || []"
          :requesting="recRequesting"
          @open="item => router.push(relatedMediaPath(item))"
          @request="requestRecMedia"
        />
      </div>
    </template>
  </div>
  <RequestOptionsModal
    :open="showRequestOptions"
    :media-title="detail?.title"
    :requesters="requesters"
    :folders="folders"
    :plex-user-id="requestForm.plex_user_id"
    :root-folder="requestForm.root_folder"
    :busy="busy"
    :confirm-label="requestLabel"
    :media-type="detail?.media_type"
    :seasons="requestForm.seasons"
    :season-numbers="seasonNumbers"
    @update:plex-user-id="v => requestForm.plex_user_id = v"
    @update:root-folder="v => requestForm.root_folder = v"
    @update:seasons="v => requestForm.seasons = v"
    @cancel="showRequestOptions = false"
    @confirm="() => { showRequestOptions = false; submitRequest(); }"
  />
  <RequestOptionsModal
    :open="recOptionsDialog.open"
    :media-title="recOptionsDialog.item ? (recOptionsDialog.item.title || recOptionsDialog.item.name) : ''"
    :requesters="recOptionsDialog.requesters"
    :folders="recOptionsDialog.folders"
    :plex-user-id="recOptionsDialog.plexUserId"
    :root-folder="recOptionsDialog.rootFolder"
    :busy="recOptionsDialog.busy"
    @update:plex-user-id="v => recOptionsDialog.plexUserId = v"
    @update:root-folder="v => recOptionsDialog.rootFolder = v"
    @cancel="cancelRecOptions"
    @confirm="confirmRecOptions"
  />
  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { LoaderCircle } from "@lucide/vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "@/api";
import { mediaDetailPath, openPlexLink } from "@/mediaUrl";
import MediaDetailHero from "@/components/media/MediaDetailHero.vue";
import MediaSummaryTab from "@/components/media/MediaSummaryTab.vue";
import MediaRequestsTab from "@/components/media/MediaRequestsTab.vue";
import MediaCalendarTab from "@/components/media/MediaCalendarTab.vue";
import MediaAudioSection from "@/components/media/MediaAudioSection.vue";
import RequestOptionsModal from "@/components/media/RequestOptionsModal.vue";
import MediaRecommendations from "@/components/media/MediaRecommendations.vue";
import MediaCast from "@/components/media/MediaCast.vue";
import MediaSaga from "@/components/media/MediaSaga.vue";
import MediaMusicCatalog from "@/components/media/MediaMusicCatalog.vue";
import ConfirmModal from "@/components/ConfirmModal.vue";
import TabNav from "@/components/ui/TabNav.vue";
import { useConfirm } from "@/composables/useConfirm";
import { canModerateSession, loadSession } from "@/composables/useSession";
import { useSeasonEpisodes } from "@/composables/useSeasonEpisodes";
import { useRequestActions } from "@/composables/useRequestActions";
import { useDirectMediaRequest } from "@/composables/useDirectMediaRequest";

const {
  requesting: recRequesting,
  requestMedia: requestRecMedia,
  optionsDialog: recOptionsDialog,
  confirmOptions: confirmRecOptions,
  cancelOptions: cancelRecOptions,
} = useDirectMediaRequest({
  onUpdated: (changed: any, update: any) => {
    const key = `${changed.media_type}:${changed.tmdb_id || changed.id}`;
    if (detail.value?.recommendations) {
      for (const item of detail.value.recommendations) {
        if (`${item.media_type}:${item.tmdb_id || item.id}` === key) Object.assign(item, update);
      }
    }
    if (detail.value?.similar) {
      for (const item of detail.value.similar) {
        if (`${item.media_type}:${item.tmdb_id || item.id}` === key) Object.assign(item, update);
      }
    }
  },
});

const route = useRoute();
const router = useRouter();

const detail = ref<any>(null), requesters = ref<any[]>([]), folders = ref<any[]>([]);
const loading = ref(false), busy = ref(false), error = ref(''), successMessage = ref(''), tab = ref('summary');
const showRequestOptions = ref(false);
const requestForm = reactive<{ plex_user_id: string; root_folder: string; seasons: number[] }>({ plex_user_id: '', root_folder: '', seasons: [] });
const isMusic = computed(() => ['artist', 'album', 'track'].includes(detail.value?.media_type));
const artistAlbums = computed(() => detail.value?.albums || []);
const albumTracks = computed(() => detail.value?.tracks || []);
const tabs = computed(() => {
  if (isMusic.value) return [];
  if (kind.value === 'discover') return ['summary'];
  return ['summary', ...(detail.value?.media_type === 'show' ? ['missing'] : []), 'audio', 'requests', 'calendar'];
});
const mediaTabItems = computed(() => tabs.value.map(value => ({ value, label: tabLabel(value) })));
const admin = ref(false);
const sessionUserId = ref('');
const requestLabel = computed(() => (detail.value?.media_type === 'show' ? 'Demander la série' : 'Demander ce film'));
async function handleRequestClick(): Promise<void> {
  if (admin.value || (detail.value?.media_type === 'show' && seasonNumbers.value.length > 1)) {
    showRequestOptions.value = true;
  } else {
    await submitRequest();
  }
}

const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();

const showIssueForm = ref(false), showCorrectionForm = ref(false);
const users = ref<any[]>([]), correctionOptions = ref<any[]>([]);
const correctionForm = reactive<Record<string, any>>({ scope: 'media', season_number: null, episode_number: null, recipient_user_ids: [], corrections: [], note: '' });
const newRequesterId = ref('');

const kind = computed(() => route.params.kind);
const inDiscoverShell = computed(() => route.path.startsWith('/discover/'));

const statusLabel = computed(() => detail.value?.operational_status_label || (detail.value?.available || detail.value?.in_library ? 'Disponible' : detail.value?.requested ? 'Deja demande' : detail.value?.request_status || ''));
const statusClass = computed(() => detail.value?.available || detail.value?.in_library ? 'available' : 'pending');
const seasonNumbers = computed(() => Array.from({ length: Number(detail.value?.number_of_seasons || 0) + 1 }, (_, i) => i));
const addableUsers = computed(() => {
  const already = new Set((detail.value?.requests || []).flatMap((row: any) => row.requester_ids || [row.plex_user_id]));
  return users.value.filter((u: any) => !already.has(u.plex_user_id));
});

const releaseSourceType = computed(() => {
  if (detail.value?.vf_source_type === 'library' || detail.value?.library_id || detail.value?._kind === 'library' || kind.value === 'library') {
    return 'library_item';
  }
  if (detail.value?.vf_source_type === 'request' || detail.value?.request_id || detail.value?._kind === 'request' || kind.value === 'request') {
    return 'request';
  }
  return null;
});

const releaseSourceId = computed(() => {
  if (detail.value?.vf_source_id) return Number(detail.value.vf_source_id);
  if (detail.value?.library_id) return Number(detail.value.library_id);
  if (detail.value?._kind === 'library' && detail.value?.id) return Number(detail.value.id);
  if (detail.value?.request_id) return Number(detail.value.request_id);
  if (detail.value?._kind === 'request' && detail.value?.id) return Number(detail.value.id);
  if (kind.value === 'library' && route.params.id) return Number(route.params.id);
  if (kind.value === 'request' && route.params.id) return Number(route.params.id);
  return null;
});

const seasons = useSeasonEpisodes(() => {
  const media = detail.value?.media || detail.value;
  const sType = media?.vf_source_type === 'library' || media?.library_id || kind.value === 'library' ? 'library' : 'requests';
  const sId = media?.vf_source_id || media?.library_id || (kind.value === 'library' ? route.params.id : null) || media?.request_id || (kind.value === 'request' ? route.params.id : null);
  if (!sId) return null;
  return {
    source: sType,
    id: Number(sId),
    mediaType: detail.value?.media_type,
  };
});
const mergedVfDetail = seasons.detail;
const seasonSummary = seasons.seasonSummary;
const { envelopeError, availabilityError, vfStatusError } = seasons;

function tabLabel(value: string): string {
  const audioLabel = detail.value?.media_type === 'show' ? 'Saisons & épisodes' : 'Pistes & langues';
  return ({ summary: 'Resume', missing: 'Éléments manquants', audio: audioLabel, requests: 'Demandes', calendar: 'Calendrier' } as Record<string, string>)[value];
}

function mediaPath(core = false): string {
  const id = route.params.id;
  if (kind.value === 'discover') {
    const p = new URLSearchParams();
    p.set('media_type', String(route.query.media_type || ''));
    if (route.query.id_type === 'tvdb') p.set('tvdb_id', String(id)); else p.set('tmdb_id', String(id));
    return `/api/discover/detail?${p}`;
  }
  if (kind.value === 'request') return `/api/media/detail?request_id=${id}${core ? '&core=true' : ''}`;
  return `/api/media/detail?library_id=${id}${core ? '&core=true' : ''}`;
}

async function loadUsers(): Promise<void> {
  if (usersPromise) return usersPromise;
  usersPromise = (async () => {
    try {
      const [userRows, options] = await Promise.all([
        api('/api/users'),
        api('/api/media/corrections/options'),
      ]);
      users.value = userRows;
      correctionOptions.value = options;
    } catch (e) {}
  })();
  return usersPromise;
}

async function loadAdminFlag(): Promise<void> {
  admin.value = canModerateSession(await loadSession());
}

let loadGeneration = 0, usersPromise: Promise<void> | undefined = undefined;
async function load(): Promise<void> {
  const generation = ++loadGeneration;
  loading.value = true; error.value = '';
  seasons.reset();
  usersPromise = undefined;
  users.value = [];
  correctionOptions.value = [];
  tab.value = 'summary';
  try {
    const payload = await api(mediaPath(kind.value !== 'discover'));
    if (generation !== loadGeneration) return;

    if (kind.value === 'discover') {
      if (payload.library_id) {
        const nextPath = inDiscoverShell.value
          ? `/discover/media/library/${payload.library_id}`
          : `/library/media/library/${payload.library_id}`;
        router.replace(nextPath);
        return;
      }
      if (payload.request_id) {
        const nextPath = inDiscoverShell.value
          ? `/discover/media/request/${payload.request_id}`
          : `/library/media/request/${payload.request_id}`;
        router.replace(nextPath);
        return;
      }
    }

    detail.value = kind.value === 'discover' ? payload : { ...payload.media, ...payload };
    if (['summary','missing','audio','requests','calendar'].includes(String(route.query.tab))) tab.value = String(route.query.tab);
    if (kind.value === 'discover') {
      const session = await loadSession();
      admin.value = canModerateSession(session);
      sessionUserId.value = session?.plex_user_id || '';
      if (admin.value) {
        const service = detail.value.media_type === 'show' ? 'sonarr' : 'radarr';
        [requesters.value, folders.value] = await Promise.all([
          api('/api/discover/requesters'),
          api(`/api/${service}/folders`).catch(() => []),
        ]);
      } else {
        requesters.value = [];
        folders.value = [];
      }
      requestForm.plex_user_id = requesters.value.find((user: any) => user.plex_user_id === sessionUserId.value)?.plex_user_id
        || sessionUserId.value || requesters.value[0]?.plex_user_id || '';
      requestForm.seasons = seasonNumbers.value.filter((season: number) => season !== 0);
    }
  } catch (e: any) {
    if (generation === loadGeneration) error.value = e.message;
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }

  if (kind.value !== 'discover') {
    api(mediaPath()).then((payload: any) => {
      if (generation !== loadGeneration) return;
      detail.value = {
        ...detail.value,
        ...(payload.media || {}),
        ...payload,
        media: payload.media || detail.value?.media,
      };
    }).catch((e: any) => {
      if (generation === loadGeneration) error.value = e.message;
    });

    if (detail.value?.media_type === 'show') {
      triggerBackgroundVfRescan(seasons.loadAll(), generation);
      loadAdminFlag().catch(() => {});
    } else {
      triggerBackgroundVfRescan(
        seasons.loadMovieVf().catch(e => { envelopeError.value = true; throw e; }),
        generation,
      );
      loadAdminFlag().catch(() => {});
    }
  }
}

function triggerBackgroundVfRescan(initialLoad: Promise<any>, generation: number): void {
  initialLoad
    .then(() => { if (generation === loadGeneration) return seasons.rescan(); })
    .catch(() => {});
}

const {
  requestAction, rejectRequest, closeRequest, resendMail, notifyUser,
  addRequester, catchUpAll, promoteRequester, removeRequester, deleteRequest, withdrawRequest,
} = useRequestActions({
  detail, newRequesterId, askConfirm, busy, error,
  reload: load,
  onDeleted: () => router.push('/library'),
});

function goBack(): void {
  if (window.history.state?.back) router.back();
  else router.push(inDiscoverShell.value ? '/discover' : '/library');
}

function relatedMediaPath(item: any): string {
  return mediaDetailPath(item, 'discover', { discover: inDiscoverShell.value });
}

function openDetail(item: any): void {
  router.push(relatedMediaPath(item));
}

async function openCorrection(scope: string, season: number | null, episode: number | null): Promise<void> {
  await loadUsers().catch(() => {});
  correctionForm.scope = scope;
  correctionForm.season_number = season;
  correctionForm.episode_number = episode;
  const reqIds = (detail.value?.requests || []).map((r: any) => r.plex_user_id);
  correctionForm.recipient_user_ids = users.value.filter((u: any) => reqIds.includes(u.plex_user_id)).map((u: any) => u.id);
  showCorrectionForm.value = true;
  showIssueForm.value = false;
}

async function submitRequest(): Promise<void> {
  busy.value = true;
  error.value = '';
  try {
    const data = await api('/api/media/add', {
      method: 'POST',
      body: JSON.stringify({
        title: detail.value.title,
        year: detail.value.year,
        media_type: detail.value.media_type,
        tmdb_id: detail.value.tmdb_id,
        tvdb_id: detail.value.tvdb_id,
        imdb_id: detail.value.imdb_id,
        poster_url: detail.value.poster_url,
        overview: detail.value.overview,
        plex_user_id: requestForm.plex_user_id || sessionUserId.value,
        root_folder: requestForm.root_folder || null,
        seasons: detail.value.media_type === 'show' ? requestForm.seasons : null,
        auto_search: true,
      }),
    });
    successMessage.value = data.already_existed
      ? `${detail.value.title} était déjà demandé.`
      : `Demande envoyée pour ${detail.value.title}.`;
    if (data.request_id) {
      const nextPath = inDiscoverShell.value
        ? `/discover/media/request/${data.request_id}`
        : `/library/media/request/${data.request_id}`;
      router.replace(nextPath);
    } else {
      await load();
    }
  } catch (e: any) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function joinRequest(): Promise<void> {
  if (!detail.value?.request_id || !sessionUserId.value) return;
  busy.value = true; error.value = '';
  try {
    const data = await api(`/api/requests/${detail.value.request_id}/join`, { method: 'POST' });
    detail.value.requester_ids = data.requester_ids;
    successMessage.value = data.already_joined ? 'Cette demande est déjà dans votre suivi.' : 'Demande ajoutée à votre suivi.';
  } catch (e: any) { error.value = e.message; } finally { busy.value = false; }
}

async function scanVff(): Promise<void> {
  busy.value = true;
  try { await seasons.rescan(); }
  catch (e: any) { error.value = e.message; } finally { busy.value = false; }
}

async function recheckPlex(): Promise<void> {
  busy.value = true;
  try {
    const media = detail.value.media || {};
    await api(`/api/media/recheck-plex?${media.library_id ? `library_id=${media.library_id}` : `request_id=${media.request_id}`}`, { method: 'POST' });
    await load();
  } catch (e: any) { error.value = e.message; } finally { busy.value = false; }
}

async function reportIssue(issueMessage: string): Promise<void> {
  busy.value = true;
  try {
    const media = detail.value.media || {};
    await api('/api/media/issues', { method: 'POST', body: JSON.stringify({ library_id: media.library_id, request_id: media.request_id, issue_type: 'other', message: issueMessage }) });
    showIssueForm.value = false;
    await load();
  } catch (e: any) { error.value = e.message; } finally { busy.value = false; }
}

async function sendCorrection(formPayload: Record<string, any>): Promise<void> {
  busy.value = true; error.value = '';
  try {
    const media = detail.value.media || {};
    await api('/api/media/send-correction', { method: 'POST', body: JSON.stringify({ ...formPayload, library_id: media.library_id, request_id: media.request_id }) });
    showCorrectionForm.value = false;
    successMessage.value = 'Correction envoyée !';
  } catch (e: any) { error.value = e.message; } finally { busy.value = false; }
}

watch(tab, value => { if (value === 'requests') loadUsers().catch(() => {}); });
watch(() => [route.params.kind, route.params.id, route.query.media_type, route.query.id_type, route.query.tab], load);
onMounted(load);
</script>

<style scoped lang="scss">
.media-detail-page {
  min-height: 100%;
  overflow-x: hidden;
}
.media-detail-body {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 28px 40px;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.drawer-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 80px 0;
  color: var(--muted);
}
@media (max-width: 767.98px) {
  .media-detail-body {
    padding-right: 16px;
    padding-bottom: calc(var(--mobile-nav-h) + var(--safe-bottom) + 76px);
    padding-left: 16px;
  }
}
@media (min-width: 1025px) {
  .media-detail-body { font-size: var(--fs-md); gap: var(--space-5); }
  .media-detail-body :deep(.drawer-section > h2),
  .media-detail-body :deep(.drawer-section > h3) { font-size: var(--fs-lg); }
  .media-detail-body :deep(.detail-row > div:first-child > strong) { font-size: var(--fs-md); }
  .media-detail-body :deep(.detail-row > div:first-child > span),
  .media-detail-body :deep(.detail-row > div:first-child > small) { font-size: var(--fs-sm); line-height: 1.45; }
  .media-detail-body :deep(.detail-tabs button) { font-size: var(--fs-md); }
  .media-detail-body :deep(.badge) { font-size: var(--fs-sm); }
}

</style>
