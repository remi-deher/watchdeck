<template>
  <!-- Carte de suivi d'une demande en cours : pourquoi elle attend, depuis quand, ou elle
       en est. Les demandes disponibles gardent la carte d'affiche de la Bibliotheque. -->
  <article class="rt-card" :class="[`is-${kind}`, { 'is-late': late }]">
    <button type="button" class="rt-poster" :aria-label="`Ouvrir la fiche de ${item.title}`" @click="$emit('open', item)">
      <MediaPoster :poster-url="item.poster_url" :alt="''" sizes="72px" />
    </button>

    <div class="rt-body">
      <div class="rt-head">
        <div class="rt-titles">
          <button type="button" class="rt-title" @click="$emit('open', item)">{{ item.title }}</button>
          <p class="rt-meta">{{ meta }}</p>
        </div>
        <span class="rt-age" :title="sinceTitle">{{ ageLabel }}</span>
      </div>

      <span class="rt-motif">{{ motifLabel }}</span>
      <p v-if="detail" class="rt-detail">{{ detail }}</p>

      <div
        v-if="progress != null"
        class="rt-progress"
        role="progressbar"
        :aria-valuenow="Math.round(progress)"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="`Téléchargement de ${item.title}`"
      >
        <i :style="{ width: `${Math.min(100, progress)}%` }" />
      </div>

      <template v-if="episodes">
        <div v-if="episodes.segments" class="rt-episodes" aria-hidden="true">
          <i v-for="n in episodes.total" :key="n" :class="{ ok: n <= episodes.available, aired: n <= episodes.aired }" />
        </div>
        <p class="rt-detail">{{ episodes.text }}</p>
      </template>

      <!-- Fil de vie masque une fois la demande disponible (VF manquante) : toutes les
           etapes y seraient cochees, sans rien apprendre. -->
      <ol v-if="item.lifecycle?.length && kind !== 'vf'" class="rt-life" aria-label="Étapes de la demande">
        <li v-for="step in item.lifecycle" :key="step.key" :class="{ done: step.done }">
          <span>{{ step.label }}</span>
        </li>
      </ol>

      <div v-if="actions.length" class="rt-actions" @click.stop>
        <UiButton
          v-for="action in actions"
          :key="action.key"
          size="sm"
          :variant="action.primary ? 'primary' : 'secondary'"
          :disabled="busy"
          @click="$emit('act', item, action.key)"
        >{{ action.label }}</UiButton>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MediaPoster from '@/components/media/MediaPoster.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { mediaTypeLabel } from '@/utils/labels';

const props = withDefaults(defineProps<{ item: any; canModerate?: boolean; busy?: boolean }>(), {
  canModerate: false,
  busy: false,
});
defineEmits<{ (e: 'open', item: any): void; (e: 'act', item: any, action: string): void }>();

const kind = computed<string>(() => props.item.tracking?.kind || (props.item.vf_missing ? 'vf' : 'available'));
const motifLabel = computed(() => {
  if (props.item.tracking?.label) return props.item.tracking.label;
  return props.item.vf_missing ? 'Disponible en VO · VF recherchée' : 'Disponible';
});

const meta = computed(() => {
  const parts = [mediaTypeLabel(props.item.media_type)];
  if (props.item.year) parts.push(String(props.item.year));
  if (props.item.requested_by) parts.push(`demandé par ${props.item.requested_by}`);
  return parts.join(' · ');
});

/* Depuis quand la demande attend dans son etat actuel (sinon depuis la demande). */
const since = computed<string | null>(() => props.item.tracking?.since || props.item.requested_at || null);
const sinceDays = computed(() => (since.value ? (Date.now() - new Date(since.value).getTime()) / 86_400_000 : 0));
function duree(jours: number): string {
  if (jours < 1 / 24) return 'à l’instant';
  if (jours < 1) return `${Math.max(1, Math.round(jours * 24))} h`;
  if (jours < 14) return `${Math.round(jours)} j`;
  if (jours < 60) return `${Math.round(jours / 7)} sem.`;
  if (jours < 365) return `${Math.round(jours / 30)} mois`;
  const ans = Math.round(jours / 365);
  return `${ans} an${ans > 1 ? 's' : ''}`;
}
const ageLabel = computed(() => (since.value ? `depuis ${duree(sinceDays.value)}` : ''));
const sinceTitle = computed(() => (since.value ? new Date(since.value).toLocaleString('fr-FR') : undefined));
/* Au-dela d'une semaine, un blocage merite l'attention : l'anciennete passe en rouge. */
const late = computed(() => ['not_found', 'missing_episodes', 'failed'].includes(kind.value) && sinceDays.value > 7);

const progress = computed<number | null>(() => {
  const value = props.item.tracking?.download?.progress;
  return typeof value === 'number' ? value : null;
});
const detail = computed(() => {
  const download = props.item.tracking?.download;
  if (download && typeof download.progress === 'number') {
    const reste = download.timeleft ? ` · encore ${String(download.timeleft).replace(/^00:/, '')}` : '';
    return `${Math.round(download.progress)} %${reste}`;
  }
  if (kind.value === 'failed' && props.item.fulfillment_error) return props.item.fulfillment_error;
  return '';
});

/* Progression par episode : une case par episode tant qu'il y en a peu, sinon le texte. */
const episodes = computed(() => {
  if (props.item.media_type !== 'show') return null;
  const total = Number(props.item.episodes_total_count || 0);
  const available = Number(props.item.episodes_available_count || 0);
  const aired = Number(props.item.episodes_aired_count || 0);
  // Disponible (VF manquante) : tous les episodes sont la, la barre n'apprend rien.
  if (!total || kind.value === 'available' || kind.value === 'vf') return null;
  return {
    total,
    available,
    aired,
    segments: total <= 40,
    text: `${available} / ${total} épisodes disponibles${aired > available ? ` · ${aired - available} diffusé${aired - available > 1 ? 's' : ''} manquant${aired - available > 1 ? 's' : ''}` : ''}`,
  };
});

/* Actions reservees aux moderateurs, selon le motif. La recherche interactive passe par
   la page de releases (`/releases/:id`), qui met la VF en avant. */
const actions = computed(() => {
  if (!props.canModerate) return [];
  switch (kind.value) {
    case 'approval':
      return [{ key: 'approve', label: 'Approuver', primary: true }, { key: 'reject', label: 'Refuser…' }];
    case 'not_found':
    case 'missing_episodes':
      return [
        { key: 'interactive', label: 'Recherche interactive', primary: true },
        { key: 'retry', label: 'Relancer la recherche' },
        { key: 'withdraw', label: 'Annuler…' },
      ];
    case 'failed':
      return [{ key: 'retry', label: 'Relancer', primary: true }, { key: 'withdraw', label: 'Annuler…' }];
    case 'vf':
      return [{ key: 'interactive', label: 'Chercher une VF', primary: true }];
    default:
      return [];
  }
});
</script>

<style scoped lang="scss">
.rt-card {
  --rt-tone: var(--muted);
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
}
.rt-card.is-approval { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); background: color-mix(in srgb, var(--accent) 5%, var(--surface)); }
.is-approval, .is-importing, .is-vf { --rt-tone: var(--amber-text); }
.is-not_found, .is-missing_episodes, .is-failed, .is-rejected { --rt-tone: var(--red-text); }
.is-downloading, .is-queued { --rt-tone: var(--blue-text); }
.is-unreleased { --rt-tone: var(--muted); }

.rt-poster { align-self: start; width: 64px; padding: 0; border: 0; border-radius: var(--radius-sm); overflow: hidden; background: var(--media-placeholder); cursor: pointer; aspect-ratio: 2 / 3; }
.rt-body { display: grid; gap: var(--space-2); min-width: 0; align-content: start; }
.rt-head { display: flex; justify-content: space-between; gap: var(--space-2); align-items: flex-start; }
.rt-titles { min-width: 0; }
.rt-title { padding: 0; border: 0; background: none; color: var(--text); font: inherit; font-size: var(--fs-md); font-weight: 600; text-align: left; cursor: pointer; }
.rt-title:hover { text-decoration: underline; }
.rt-meta, .rt-detail { margin: 2px 0 0; color: var(--muted); font-size: var(--fs-xs); }
.rt-age { flex: none; color: var(--muted); font-size: var(--fs-xs); white-space: nowrap; }
.is-late .rt-age { color: var(--red-text); font-weight: 600; }

.rt-motif {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border: 1px solid color-mix(in srgb, var(--rt-tone) 40%, transparent);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--rt-tone) 10%, transparent);
  color: var(--rt-tone);
  font-size: var(--fs-xs);
  font-weight: 600;
}
.rt-motif::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

.rt-progress { height: 5px; overflow: hidden; border-radius: var(--radius-pill); background: var(--surface-3); }
.rt-progress i { display: block; height: 100%; border-radius: inherit; background: var(--blue); transition: width var(--motion-duration-base) var(--motion-ease-standard); }

.rt-episodes { display: flex; gap: 2px; }
.rt-episodes i { flex: 1; height: 6px; border-radius: 2px; background: var(--surface-3); }
.rt-episodes i.aired { background: color-mix(in srgb, var(--red) 45%, var(--surface-3)); }
.rt-episodes i.ok { background: var(--green); }

.rt-life { display: flex; margin: 2px 0 0; padding: 0; list-style: none; color: var(--muted); font-size: var(--fs-xs); }
.rt-life li { position: relative; flex: 1; min-width: 0; padding-top: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rt-life li::before { content: ''; position: absolute; top: 3px; left: 0; right: 0; height: 2px; background: var(--surface-3); }
.rt-life li::after { content: ''; position: absolute; top: 0; left: 0; width: 8px; height: 8px; border-radius: 50%; background: var(--surface-3); }
.rt-life li.done { color: var(--text); }
.rt-life li.done::before, .rt-life li.done::after { background: var(--accent); }

.rt-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }

@container page (max-width: 444px) {
  .rt-card { grid-template-columns: 52px minmax(0, 1fr); }
  .rt-poster { width: 52px; }
}
</style>
