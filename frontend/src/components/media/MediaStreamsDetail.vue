<template>
  <div class="media-streams-detail">
    <div class="media-streams-detail__line">
      <span class="media-streams-detail__label">Langues audio</span>
      <span v-if="tracks?.length" class="media-streams-detail__value">
        <span v-for="(track, i) in tracks" :key="`t-${i}`" class="badge" :class="track.is_fr ? 'available' : ''">
          {{ track.label }}{{ track.is_default ? ' (par défaut)' : '' }}
        </span>
      </span>
      <span v-else class="media-streams-detail__empty">Aucune piste audio detectee.</span>
    </div>
    <div class="media-streams-detail__line">
      <span class="media-streams-detail__label">Sous-titres</span>
      <span v-if="subtitles?.length" class="media-streams-detail__value">
        <span v-for="(sub, i) in subtitles" :key="`s-${i}`" class="badge" :class="sub.is_fr && sub.is_forced ? 'language-tag vf-secondary' : sub.is_fr ? 'available' : ''">
          {{ sub.label }}{{ sub.is_forced ? ' (forcé)' : '' }}{{ sub.is_default ? ' (par défaut)' : '' }}
        </span>
      </span>
      <span v-else class="media-streams-detail__empty">Aucun sous-titre detecte.</span>
    </div>
    <!-- Alertes de sous-titres, uniquement si les pistes sont connues -->
    <div v-if="tracks?.length || subtitles?.length" class="media-streams-detail__line media-streams-detail__alerts">
      <span class="media-streams-detail__label">Alertes</span>
      <span class="media-streams-detail__value">
        <span v-if="!hasSubtitleAlert(alerts)" class="badge available">Sous-titres OK</span>
        <MediaSubtitleAlerts :alerts="alerts" :context="context" />
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
/* Detail des pistes d'un fichier : langues audio, sous-titres et alertes de sous-titres,
   chaque piste en pastille (francaise mise en avant). */
import { computed } from 'vue';
import MediaSubtitleAlerts from '@/components/media/MediaSubtitleAlerts.vue';
import { hasSubtitleAlert, subtitleAlerts, type SubtitleAlertContext } from '@/utils/mediaStreams';

const props = withDefaults(
  defineProps<{
    tracks?: any[] | null;
    subtitles?: any[] | null;
    context?: SubtitleAlertContext;
  }>(),
  { tracks: null, subtitles: null, context: 'episode' }
);

const alerts = computed(() => subtitleAlerts(props.tracks || [], props.subtitles || []));
</script>

<style scoped lang="scss">
.media-streams-detail {
  display: grid;
  gap: 6px;
  margin-top: 8px;
  padding: 8px 10px;
  border-left: 2px solid var(--accent);
  border-radius: var(--radius-xs);
  background: rgba(0, 0, 0, .2);
  cursor: default;
}
.media-streams-detail__line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
}
.media-streams-detail__label {
  flex: 0 0 auto;
  min-width: 90px;
  color: var(--muted);
  font-weight: 600;
}
.media-streams-detail__value {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.media-streams-detail__empty {
  color: var(--muted);
}
.media-streams-detail__alerts {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}
</style>
