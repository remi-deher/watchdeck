<template>
  <div class="media-detail-page" :class="{ 'has-tint': tint }" :style="tintStyle">
    <!-- Le hero se monte des l'ouverture, avec ce que la carte touchee savait deja --
         affiche, titre, annee -- puis garde sa place quand la fiche complete arrive.
         L'affiche est ainsi a son emplacement final des la premiere image : le
         transport depuis la vignette a une cible, et la surface ne change plus de
         taille en pleine animation. -->
    <MediaDetailHero
      v-if="detail || apercu"
      :tabs="detail ? mediaTabItems : []"
      :tab="isMusic ? 'main' : tab"
      @update:tab="tab = $event"
      :detail="detail || apercu"
      :preview="!detail"
      :status-label="detail ? statusLabel : ''"
      :status-class="statusClass"
      :admin="admin"
      :season-summary="seasonSummary"
      :busy="busy"
      :available="isInPlex"
      :variant="enSurface ? 'sheet' : 'card'"
      @back="goBack"
      @report-issue="showIssueForm = !showIssueForm"
      @scan="scanVff"
      @open-audio="tab = 'audio'"
      @request="handleRequestClick"
    >
      <template v-for="key in slotTabs" :key="key" #[`tab-${key}`]>
        <template v-if="detail">
          <MediaMusicCatalog
            v-if="key === 'main'"
            :detail="detail"
            :artist-albums="artistAlbums"
            :album-tracks="albumTracks"
            @open-album="openDetail"
            @listen="openPlexLink"
          />

          <MediaRequestsTab
            v-else-if="key === 'requests'"
            :requests="detail.requests"
            :detail="detail"
            :admin="admin"
            :busy="busy"
            :addable-users="addableUsers"
            v-model:new-requester-id="newRequesterId"
            @add-requester="addRequester"
            @open-release="(id: number) => ouvrirReleases(`/releases/${id}`)"
            @retry="(id: number) => requestAction(id, 'retry')"
            @catch-up-all="catchUpAll"
            @resend-mail="resendMail"
            @close-request="closeRequest"
            @delete-request="deleteRequest"
            @withdraw-request="withdrawRequest"
            @set-auto-import="setAutoImport"
            @notify-user="notifyUser"
            @promote-requester="promoteRequester"
            @remove-requester="removeRequester"
            @approve="(id: number) => requestAction(id, 'approve')"
            @reject="rejectRequest"
          />

          <MediaCalendarTab v-else-if="key === 'calendar'" :events="detail.calendar" />

          <MediaEncodingTab v-else-if="key === 'encoding' && libraryItemId" :item-id="libraryItemId" />

          <MediaAudioSection
            v-else-if="key === 'audio' || key === 'missing'"
            :vf-detail="mergedVfDetail"
            :envelope-error="envelopeError"
            :availability-error="availabilityError"
            :vf-status-error="vfStatusError"
            :source-type="releaseSourceType"
            :source-id="releaseSourceId"
            :admin="admin"
            :media-title="detail.title"
            :missing-only="key === 'missing'"
            @correction="openCorrection"
            @expand-season="seasons.loadSeason"
            @aligned="onStreamsAligned"
          />

          <MediaSummaryTab
            v-else-if="key === 'summary'"
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

          <MediaNotificationsTab
            v-else-if="key === 'notifications'"
            :notifications="detail.notification_history || []"
          />
        </template>
      </template>
      <template v-if="detail" #after>
        <div class="media-detail-body">
    <MediaCast v-if="detail.cast?.length && !isMusic" :items="detail.cast" />

    <MediaSaga v-if="detail.saga && !isMusic" :saga="detail.saga" />

    <MediaRecommendations
      v-if="!isMusic"
      title="Recommandés pour vous"
      :items="detail.recommendations || []"
      :requesting="recRequesting"
      @open="openDetail"
      @request="requestRecMedia"
    />
    <MediaRecommendations
      v-if="!isMusic"
      title="Titres similaires"
      :items="detail.similar || []"
      :requesting="recRequesting"
      @open="openDetail"
      @request="requestRecMedia"
    />
        </div>
      </template>
    </MediaDetailHero>
    <div v-if="!detail && pending" class="media-detail-skeleton" aria-busy="true" aria-label="Chargement de la fiche">
      <template v-if="apercu">
        <span class="skeleton-line is-tabs" />
        <span class="skeleton-line" />
        <span class="skeleton-line" />
        <span class="skeleton-line is-short" />
      </template>
      <div v-else class="drawer-loading"><LoaderCircle class="spin" /> Chargement</div>
    </div>
    <!-- Sans cette branche, un identifiant qui ne resout plus (favori, lien partage,
         fiche disparue apres un reimport de bibliotheque) laissait la page
         entierement vide : l'erreur etait bien stockee, mais son affichage vivait a
         l'interieur du bloc `detail`, qui ne se montait jamais. -->
    <UiEmptyState
      v-else-if="!detail && !pending"
      :title="error ? 'Cette fiche n’a pas pu être chargée' : 'Cette fiche est introuvable'"
      :message="error || 'Le média a peut-être été retiré de la bibliothèque, ou le lien a vieilli.'"
    >
      <template #action>
        <UiButton variant="primary" :loading="loading" @click="load()">Réessayer</UiButton>
        <UiButton @click="goBack">Retour</UiButton>
      </template>
    </UiEmptyState>
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
  <ReasonPickerModal
    :open="!!withdrawTarget"
    event="cancelled"
    :subtitle="withdrawTarget ? `« ${withdrawTarget.title || detail.title} » sera retiré de Sonarr/Radarr et empêché de revenir automatiquement.` : ''"
    :initial="withdrawTarget?.fulfillment_error || ''"
    @cancel="settleReason(null)"
    @confirm="settleReason"
  />
</template>

<script setup lang="ts">
import { LoaderCircle } from "@lucide/vue";
import MediaDetailHero from "@/components/media/MediaDetailHero.vue";
import MediaSummaryTab from "@/components/media/MediaSummaryTab.vue";
import MediaRequestsTab from "@/components/media/MediaRequestsTab.vue";
import MediaCalendarTab from "@/components/media/MediaCalendarTab.vue";
import MediaEncodingTab from '@/components/media/MediaEncodingTab.vue';
import MediaAudioSection from "@/components/media/MediaAudioSection.vue";
import MediaNotificationsTab from "@/components/media/MediaNotificationsTab.vue";
import RequestOptionsModal from "@/components/media/RequestOptionsModal.vue";
import MediaRecommendations from "@/components/media/MediaRecommendations.vue";
import MediaCast from "@/components/media/MediaCast.vue";
import MediaSaga from "@/components/media/MediaSaga.vue";
import MediaMusicCatalog from "@/components/media/MediaMusicCatalog.vue";
import ConfirmModal from "@/components/ConfirmModal.vue";
import ReasonPickerModal from "@/components/requests/ReasonPickerModal.vue";
import UiButton from "@/components/ui/UiButton.vue";
import UiEmptyState from "@/components/ui/UiEmptyState.vue";
import { openPlexLink } from "@/mediaUrl";
import { useMediaDetail } from '@/composables/useMediaDetail';

const {
  busy,
  showRequestOptions,
  requestForm,
  isMusic,
  artistAlbums,
  albumTracks,
  slotTabs,
  mediaTabItems,
  admin,
  requestLabel,
  handleRequestClick,
  showIssueForm,
  correctionForm,
  newRequesterId,
  statusLabel,
  statusClass,
  isInPlex,
  seasonNumbers,
  addableUsers,
  releaseSourceType,
  libraryItemId,
  releaseSourceId,
  seasons,
  mergedVfDetail,
  seasonSummary,
  detail,
  loading,
  pending,
  apercu,
  tint,
  tintStyle,
  error,
  users,
  correctionOptions,
  requesters,
  folders,
  load,
  withdrawTarget,
  settleReason,
  setAutoImport,
  goBack,
  openDetail,
  openCorrection,
  submitRequest,
  scanVff,
  recheckPlex,
  reportIssue,
  sendCorrection,
  onStreamsAligned,
  showCorrectionForm,
  enSurface,
  ouvrirReleases,
  recRequesting,
  requestRecMedia,
  recOptionsDialog,
  confirmRecOptions,
  cancelRecOptions,
  confirmDialog,
  resolveConfirm,
  envelopeError,
  availabilityError,
  vfStatusError,
  requestAction,
  rejectRequest,
  closeRequest,
  resendMail,
  notifyUser,
  addRequester,
  catchUpAll,
  promoteRequester,
  removeRequester,
  deleteRequest,
  withdrawRequest,
  tab,
} = useMediaDetail();
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.media-detail-page {
  position: relative;
  isolation: isolate;
  min-height: 100%;
  overflow-x: hidden;
  /* Teinte reprise par la banniere (MediaDetailHero) pour que les deux se raccordent. */
  --poster-wash: var(--bg);
}
/* Le haut de la feuille prend la couleur du bas de l'affiche, puis retombe sur le fond de
   la page ; un halo flou de l'affiche elle-meme l'accompagne. */
.media-detail-page.has-tint {
  --poster-wash: color-mix(in srgb, rgb(var(--poster-tint)) 30%, var(--bg));
}
.media-detail-page.has-tint::before,
.media-detail-page.has-tint::after {
  content: "";
  position: absolute;
  top: 0;
  z-index: -1;
  pointer-events: none;
}
.media-detail-page.has-tint::before {
  left: 0;
  right: 0;
  height: 900px;
  background: linear-gradient(to bottom, var(--poster-wash) 0, var(--poster-wash) 320px, var(--bg) 900px);
}
.media-detail-page.has-tint::after {
  left: 50%;
  width: min(100%, 900px);
  height: 760px;
  transform: translateX(-50%);
  background: var(--poster-image) center 70% / cover no-repeat;
  filter: blur(64px) saturate(1.5);
  opacity: 0.28;
  /* Fondu dans les deux sens : pas de bord franc, ni sous la banniere ni sur les cotes. */
  mask-image:
    linear-gradient(to right, transparent, black 30%, black 70%, transparent),
    linear-gradient(to bottom, transparent 35%, black 60%, transparent);
  mask-composite: intersect;
}
@media (prefers-reduced-motion: no-preference) {
  .media-detail-page.has-tint::before,
  .media-detail-page.has-tint::after { animation: media-tint-in var(--motion-duration-base) var(--motion-ease-standard); }
}
@keyframes media-tint-in { from { opacity: 0; } }
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
@include bp.until(tablet) {
  .media-detail-body {
    padding-right: 16px;
    padding-bottom: calc(var(--app-shell-offset-bottom) + 76px);
    padding-left: 16px;
  }
}
@include bp.from(desktop) {
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
