<template>
  <MediaPosterCard
    v-if="view !== 'list'"
    class="interactive"
    :item="item"
    bordered
    @open="handleOpen"
  >
    <template #badges>
      <div class="badge-group">
        <span v-for="badge in badges" :key="badge.key" :class="badge.cls">{{ badge.label }}</span>
      </div>
      <label v-if="canModerate && item._kind === 'request' && !item.orphan" class="select-tag" @click.stop>
        <input :checked="selected" :disabled="busy" type="checkbox" :aria-label="`Sélectionner ${item.title}`" @change="$emit('toggle-select', item.id)">
      </label>
    </template>
    <template #meta>
      <div class="poster-meta">
        <span v-if="item.year">{{ item.year }}</span>
        <span>{{ isMusic ? (artistName || mediaTypeLabel(item.media_type)) : mediaTypeLabel(item.media_type) }}</span>
        <span v-if="rating" class="poster-rating"><Star aria-hidden="true" />{{ rating }}</span>
      </div>
    </template>

    <template #action>
      <span class="poster-action nav-action" aria-hidden="true">Voir la fiche</span>
    </template>
  </MediaPosterCard>

  <!-- Vue Liste (conservée pour l'affichage en liste/tableau) -->
  <article
    v-else
    class="media-card interactive list"
    role="link"
    tabindex="0"
    :aria-label="accessibleLabel"
    @click="handleOpen"
    @keydown.enter.prevent="handleOpen"
    @keydown.space.prevent="handleOpen"
  >
    <MediaPoster :poster-url="item.poster_url" :is-music="isMusic">
      <template #badges>
        <label v-if="canModerate && item._kind === 'request' && !item.orphan" class="select-tag" @click.stop>
          <input :checked="selected" :disabled="busy" type="checkbox" :aria-label="`Sélectionner ${item.title}`" @change="$emit('toggle-select', item.id)">
        </label>
      </template>
    </MediaPoster>
    <div class="card-body">
      <strong>{{ item.title }}</strong>
      <span>
        {{ isMusic ? (artistName || mediaTypeLabel(item.media_type)) : mediaTypeLabel(item.media_type) }}<template v-if="item.year"> · {{ item.year }}</template>
        <template v-if="item.orphan"> · Suivi {{ item.orphan_source === 'sonarr' ? 'Sonarr' : 'Radarr' }}</template>
        <template v-else-if="item._kind === 'request' && item.source"> · {{ item.source }}</template>
      </span>
      <div class="badge-row card-badges">
        <span v-for="badge in badges" :key="badge.key" :class="badge.cls">{{ badge.label }}</span>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Star } from '@lucide/vue';
import { useRouter } from 'vue-router';
import { api } from '@/api';
import { mediaDetailPath } from '@/mediaUrl';
import { mediaTypeLabel, vfLanguageState } from '@/utils/labels';
import MediaPosterCard from '@/components/media/MediaPosterCard.vue';
import MediaPoster from '@/components/media/MediaPoster.vue';
import { statusLabel, statusShortLabel } from '@/components/media/mediaListHelpers';

const props = withDefaults(
  defineProps<{
    item: any;
    view?: 'grid' | 'list' | string;
    canModerate?: boolean;
    busy?: boolean;
    selected?: boolean;
  }>(),
  {
    view: 'grid',
    canModerate: false,
    busy: false,
    selected: false,
  }
);
const emit = defineEmits<{
  (e: 'open', item: any): void;
  (e: 'toggle-select', id: any): void;
  (e: 'error', msg: string): void;
  (e: 'act', item: any, action: string): void;
}>();

const router = useRouter();
const opening = ref(false);

const isMusic = computed(() => ['artist', 'album', 'track'].includes(props.item.media_type));

const artistName = computed(() => {
  const match = /^Artiste \/ Album: (.+)$/m.exec(props.item.overview || '');
  return match ? match[1].trim() : '';
});

const rating = computed(() => {
  const v = Number(props.item.vote || props.item.rating || props.item.vote_average || 0);
  return v > 0 ? v.toFixed(1) : '';
});

const accessibleLabel = computed(() => [
  props.item.title,
  props.item.year,
  mediaTypeLabel(props.item.media_type),
  requesterLabel(props.item),
].filter(Boolean).join(', '));

async function handleOpen(): Promise<void> {
  if (!props.item.orphan) {
    emit('open', props.item);
    return;
  }
  if (opening.value) return;
  opening.value = true;
  try {
    const { library_item_id } = await api<{ library_item_id: number | string }>(
      `/api/requests/orphans/${props.item.orphan_source}/${props.item.arr_instance_id}/${props.item.arr_id}/open`,
      { method: 'POST' },
    );
    router.push(mediaDetailPath({ library_id: library_item_id }, 'library'));
  } catch (e: any) {
    emit('error', e?.message || "Impossible d'ouvrir la fiche detaillee");
  } finally {
    opening.value = false;
  }
}

function requesterLabel(item: any): string {
  return item.custom_name || item.requested_by || item.plex_user || item.plex_user_id || '';
}

const badges = computed(() => {
  const item = props.item;
  const list: Array<{ key: string; cls: string; label: string }> = [];
  if (isMusic.value) {
    // Pas de badge type de media pour la musique
  } else if (item._kind === 'library') {
    const { label, variant } = vfLanguageState(item);
    list.push({ key: 'langue', cls: `language-tag ${variant}`, label });
  } else {
    const label = props.view === 'list' ? statusLabel(item.status) : statusShortLabel(item.status);
    list.push({ key: 'statut', cls: `badge status-tag ${item.status}`, label });
  }
  const requester = requesterLabel(item);
  if (requester) list.push({ key: 'demandeur', cls: 'requester-tag', label: `👤 ${requester}` });
  return list;
});
</script>

<style scoped lang="scss">
:deep(.catalog-status-badge) {
  justify-content: space-between;
  align-items: flex-start;
}
.badge-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  max-width: calc(100% - 36px);
}

.select-tag {
  display: flex;
  flex-shrink: 0;
  padding: 4px;
  border-radius: var(--radius-sm);
  background: rgba(20, 20, 20, .9);
  pointer-events: auto;
  cursor: pointer;
}

.status-tag, .language-tag {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-height: var(--poster-badge-min-height);
  padding: 4px 10px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  box-shadow: 0 1px 5px rgba(0, 0, 0, .55);
  color: #fff;
  font-size: var(--poster-badge-font-size);
  font-weight: 800;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.requester-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  max-width: 100%;
  min-height: var(--poster-badge-min-height);
  padding: 4px 10px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  color: #fff;
  background: rgba(37, 99, 235, .92);
  font-size: var(--poster-badge-font-size);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-card.list {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  min-height: 82px;
  padding: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
}
.media-card.list .card-body {
  padding: 10px;
  align-self: center;
}
.media-card.list .card-badges {
  margin-top: 5px;
}
</style>
