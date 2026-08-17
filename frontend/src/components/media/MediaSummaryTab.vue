<template>
  <section class="drawer-section">
    <MediaWorkflowTimeline v-if="!isMusic" :steps="detail.workflow_timeline" :history="detail.media_history" />
    <MediaInformationGrid :detail="detail" :vf-detail="vfDetail" />

    <MediaSaga v-if="!isMusic" :saga="detail.saga" />

    <div v-if="!isMusic && (detail.in_library || detail.requested || detail.request_id || detail.library_id)" class="action-grid compact-actions">
      <UiButton :disabled="busy" @click="$emit('recheck-plex')"><template #icon><RefreshCw /></template>Verifier dans Plex</UiButton>
      <UiButton :disabled="busy" @click="$emit('open-correction', 'media', null, null)"><template #icon><MessageSquareWarning /></template>Correction globale</UiButton>
    </div>

    <MediaIssueForm
      v-if="showIssueForm && !isMusic"
      :busy="busy"
      @submit="$emit('report-issue', $event)"
      @cancel="$emit('cancel-issue')"
    />

    <MediaCorrectionForm
      v-if="showCorrectionForm && !isMusic"
      :initial-form="correctionForm"
      :users="users"
      :correction-options="correctionOptions"
      :busy="busy"
      @submit="$emit('submit-correction', $event)"
      @cancel="$emit('cancel-correction')"
    />

    <article v-for="issue in (isMusic ? [] : (detail.issues || []))" :key="issue.id" class="detail-row" style="margin-top: 1rem;">
      <div><strong>{{ issue.issue_type }}</strong><span>{{ issue.message || 'Sans commentaire' }}</span></div>
      <span class="badge">{{ issue.status }}</span>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RefreshCw, MessageSquareWarning } from '@lucide/vue';
import MediaIssueForm from './MediaIssueForm.vue';
import MediaCorrectionForm from './MediaCorrectionForm.vue';
import MediaWorkflowTimeline from './MediaWorkflowTimeline.vue';
import MediaInformationGrid from './MediaInformationGrid.vue';
import MediaSaga from './MediaSaga.vue';
import UiButton from '@/components/ui/UiButton.vue';

const props = withDefaults(
  defineProps<{
    detail: any;
    busy?: boolean;
    showIssueForm?: boolean;
    showCorrectionForm?: boolean;
    users?: any[];
    correctionOptions?: any[];
    correctionForm: any;
    vfDetail?: any;
  }>(),
  {
    busy: false,
    showIssueForm: false,
    showCorrectionForm: false,
    users: () => [],
    correctionOptions: () => [],
    vfDetail: null,
  }
);

const isMusic = computed(() => props.detail?.media_type === 'artist' || props.detail?.media_type === 'album');

defineEmits<{
  (e: 'recheck-plex'): void;
  (e: 'open-correction', type: string, seasonNumber: number | null, episodeNumber: number | null): void;
  (e: 'report-issue', payload: any): void;
  (e: 'cancel-issue'): void;
  (e: 'submit-correction', payload: any): void;
  (e: 'cancel-correction'): void;
}>();
</script>
