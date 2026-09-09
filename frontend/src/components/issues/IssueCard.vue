<template>
  <article class="issue-card panel" :class="issue.status">
    <div class="issue-cover">
      <img
        v-if="issue.poster_url && !posterFailed"
        :src="proxyUrl(issue.poster_url, { width: 200 }) ?? undefined"
        :alt="issue.title || 'Média signalé'"
        loading="lazy"
        @error="posterFailed = true"
      >
      <!-- Un signalement porte toujours sur un média : quand l'affiche manque, on garde
           un repère de type plutôt qu'un cadre vide. -->
      <component :is="issue.media_type === 'show' ? Tv : Film" v-else aria-hidden="true" />
    </div>

    <div class="issue-body">
      <header class="issue-head">
        <div class="issue-heading">
          <h3>{{ issue.title || 'Média inconnu' }}</h3>
          <p class="issue-meta">
            <span class="issue-type">{{ typeLabel }}</span>
            <span v-if="issue.reporter_name">signalé par {{ issue.reporter_name }}</span>
            <time :datetime="issue.created_at">{{ formatDate(issue.created_at) }}</time>
          </p>
        </div>
        <StatusBadge :status="issue.status" />
      </header>

      <p class="issue-message">{{ issue.message || 'Sans commentaire.' }}</p>

      <!-- `admin_note` existait en base et dans l'API `PATCH` depuis toujours, sans
           aucun ecran pour la saisir ni la lire. C'est pourtant la ou se dit pourquoi
           un signalement a ete clos. -->
      <div class="issue-note">
        <label :for="noteId">Note interne</label>
        <textarea
          :id="noteId"
          v-model="note"
          rows="2"
          :disabled="busy"
          placeholder="Pourquoi ce signalement a-t-il été traité ainsi ?"
          @blur="saveNote"
        ></textarea>
        <small v-if="noteSaved" class="issue-note-saved">Note enregistrée.</small>
      </div>

      <div class="issue-actions card-actions">
        <UiButton v-if="mediaPath" size="sm" :to="mediaPath"><template #icon><ExternalLink /></template>Ouvrir la fiche</UiButton>
        <UiButton v-if="issue.status === 'open'" size="sm" :disabled="busy" @click="$emit('update', 'investigating')">
          <template #icon><ScanSearch /></template>Prendre en charge
        </UiButton>
        <UiButton v-if="issue.status !== 'closed'" size="sm" :disabled="busy" @click="$emit('retry')">
          <template #icon><RotateCcw /></template>Relancer
        </UiButton>
        <UiButton v-if="issue.status !== 'closed'" size="sm" variant="primary" :disabled="busy" @click="$emit('update', 'closed')">
          <template #icon><Check /></template>Clore
        </UiButton>
        <UiButton v-else size="sm" :disabled="busy" @click="$emit('update', 'open')">
          <template #icon><RotateCcw /></template>Rouvrir
        </UiButton>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { Check, ExternalLink, Film, RotateCcw, ScanSearch, Tv } from '@lucide/vue';
import { formatDateTime } from '@/utils/format';
import { mediaDetailPath } from '@/mediaUrl';
import { proxyUrl } from '@/utils/mediaImage';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import UiButton from '@/components/ui/UiButton.vue';

export interface Issue {
  id: number | string;
  /** Titre du média. L'ancienne page lisait `media_title`, un champ que l'API n'a
   *  jamais renvoyé : le repli s'appliquait toujours et seul le type s'affichait. */
  title?: string;
  media_type?: string;
  issue_type?: string;
  message?: string;
  status?: string;
  created_at?: string;
  reporter_name?: string;
  admin_note?: string;
  poster_url?: string;
  library_item_id?: number;
  request_id?: number;
}

const props = defineProps<{ issue: Issue; busy?: boolean }>();
const emit = defineEmits<{
  (e: 'update', status: string): void;
  (e: 'retry'): void;
  (e: 'note', value: string): void;
}>();

const posterFailed = ref(false);
const noteId = `issue-note-${useId()}`;
const note = ref(props.issue.admin_note || '');
const noteSaved = ref(false);
watch(() => props.issue.admin_note, (value) => { note.value = value || ''; });

const ISSUE_TYPES: Record<string, string> = {
  other: 'Autre',
  audio: 'Problème audio',
  video: 'Problème vidéo',
  subtitle: 'Sous-titres',
  missing: 'Média absent',
  wrong: 'Mauvais média',
};
const typeLabel = computed(() => ISSUE_TYPES[String(props.issue.issue_type)] || props.issue.issue_type || 'Signalement');

/* Le rebond vers la fiche n'a de sens que si l'on sait quoi ouvrir : un signalement
   pointe un élément de bibliothèque ou une demande, parfois ni l'un ni l'autre. */
const mediaPath = computed(() => {
  if (props.issue.library_item_id) return mediaDetailPath({ library_id: props.issue.library_item_id }, 'library');
  if (props.issue.request_id) return mediaDetailPath({ request_id: props.issue.request_id }, 'request');
  return '';
});

const formatDate = (value?: string) => formatDateTime(value, '—');

function saveNote(): void {
  const value = note.value.trim();
  if (value === (props.issue.admin_note || '').trim()) return;
  emit('note', value);
  noteSaved.value = true;
  window.setTimeout(() => { noteSaved.value = false; }, 2500);
}
</script>

<style scoped lang="scss">
.issue-card {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: var(--space-4);
  padding: var(--space-4);
  align-items: start;
}
/* Un liseré de statut : la couleur porte l'urgence sans ajouter de texte. */
.issue-card { border-left: 3px solid var(--border); }
.issue-card.open { border-left-color: var(--accent); }
.issue-card.investigating { border-left-color: #38bdf8; }
.issue-card.closed { border-left-color: color-mix(in srgb, var(--border) 70%, transparent); }

.issue-cover {
  display: grid;
  place-items: center;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.issue-cover img { width: 100%; height: 100%; object-fit: cover; }
.issue-cover svg { width: 26px; color: var(--muted); }

.issue-body { display: grid; gap: var(--space-3); min-width: 0; }
.issue-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
.issue-heading { min-width: 0; }
.issue-heading h3 { margin: 0; font-size: var(--fs-md); }
.issue-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  margin: 4px 0 0;
  color: var(--muted);
  font-size: var(--fs-xs);
}
.issue-type { color: var(--text); font-weight: 600; }
.issue-message { margin: 0; font-size: var(--fs-sm); line-height: 1.5; }

.issue-note { display: grid; gap: 4px; }
.issue-note label { color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.issue-note textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: var(--fs-sm);
  resize: vertical;
}
.issue-note-saved { color: var(--green-text, #4ade80); font-size: var(--fs-xs); }

.issue-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }

@media (max-width: 620px) {
  .issue-card { grid-template-columns: 64px minmax(0, 1fr); gap: var(--space-3); }
}
</style>
