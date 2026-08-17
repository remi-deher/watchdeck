<template>
  <section v-if="saga?.items?.length" class="drawer-section">
    <UiFeedback v-if="requestError" type="error" :message="requestError" dismissible @dismiss="requestError=''" />
    <UiFeedback v-if="requestSuccess" type="success" :message="requestSuccess" dismissible @dismiss="requestSuccess=''" />
    <HorizontalRail
      :title="`Saga${saga.name ? ` — ${saga.name}` : ''}`"
      heading-tag="h3"
      variant="compact"
    >
      <MediaPosterCard
        v-for="item in saga.items"
        :key="mediaRequestKey(item)"
        :item="item"
        :to="detailPath(item)"
        :action-label="cardActionLabel(item)"
        :requestable="canRequest(item)"
        :request-busy="requesting.includes(mediaRequestKey(item))"
        @request="requestMedia"
      />
    </HorizontalRail>
  </section>

  <RequestOptionsModal
    :open="optionsDialog.open"
    :media-title="optionsDialog.item ? (optionsDialog.item.title || optionsDialog.item.name) : ''"
    :requesters="optionsDialog.requesters"
    :folders="optionsDialog.folders"
    :plex-user-id="optionsDialog.plexUserId"
    :root-folder="optionsDialog.rootFolder"
    :busy="optionsDialog.busy"
    @update:plex-user-id="(v: string) => optionsDialog.plexUserId = v"
    @update:root-folder="(v: string) => optionsDialog.rootFolder = v"
    @cancel="cancelOptions"
    @confirm="confirmOptions"
  />
</template>

<script setup lang="ts">
import HorizontalRail from '@/components/ui/HorizontalRail.vue';
import MediaPosterCard from '@/components/media/MediaPosterCard.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import RequestOptionsModal from './RequestOptionsModal.vue';
import { mediaRequestKey, useDirectMediaRequest } from '@/composables/useDirectMediaRequest';
import { mediaDetailPath } from '@/mediaUrl';

export interface SagaData {
  name?: string;
  items?: any[];
  [key: string]: any;
}

withDefaults(
  defineProps<{
    saga?: SagaData | null;
  }>(),
  {
    saga: null,
  }
);

const { requesting, requestError, requestSuccess, requestMedia, optionsDialog, confirmOptions, cancelOptions } = useDirectMediaRequest();

function detailPath(item: any): string {
  const kind = item.library_id ? 'library' : item.request_id ? 'request' : 'discover';
  return mediaDetailPath(item, kind);
}
function cardActionLabel(item: any): string {
  if (item.in_library || item.library_id) return 'Voir la fiche';
  if (item.requested || item.request_id) return 'Suivre la demande';
  return 'Demander';
}
function canRequest(item: any): boolean {
  return !item.in_library && !item.library_id && !item.requested && !item.request_id;
}
</script>
