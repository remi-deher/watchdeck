<template>
  <!-- Carte d'affiche d'une demande en cours, dans la meme grille que l'onglet
       « Disponibles » : la page ne change plus de forme d'un onglet a l'autre. Le motif
       se lit en pastille sur l'affiche, l'avancement court en bas de l'image. -->
  <article class="rt-card" :class="[`is-${kind}`, { 'is-late': late }]">
    <button type="button" class="rt-art" :aria-label="`Ouvrir la fiche de ${item.title}`" @click="$emit('open', item)">
      <MediaPoster :poster-url="item.poster_url" :alt="''" />
      <!-- Texte pose sur l'image : palette sombre quel que soit le theme. -->
      <span class="rt-top theme-dark-scope">
        <span class="rt-motif" :title="motifLabel">{{ shortLabel }}</span>
        <span class="rt-age" :title="sinceTitle">{{ ageShort }}</span>
      </span>
      <span v-if="footer" class="rt-foot theme-dark-scope">
        <span class="rt-foot-text">{{ footer }}</span>
        <span
          v-if="progress != null"
          class="rt-progress"
          role="progressbar"
          :aria-valuenow="Math.round(progress)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="`Téléchargement de ${item.title}`"
        ><i :style="{ width: `${Math.min(100, progress)}%` }" /></span>
        <span v-else-if="episodes?.segments" class="rt-episodes" aria-hidden="true">
          <i v-for="n in episodes.total" :key="n" :class="{ ok: n <= episodes.available, aired: n <= episodes.aired }" />
        </span>
      </span>
    </button>

    <div class="rt-body">
      <button type="button" class="rt-title" @click="$emit('open', item)">{{ item.title }}</button>
      <p class="rt-meta">{{ meta }}</p>
      <p v-if="note" class="rt-note">{{ note }}</p>

      <!-- Fil de vie en quatre traits ; masque une fois la demande disponible (VF
           manquante) : toutes les etapes y seraient cochees, sans rien apprendre. -->
      <ol v-if="lifecycle.length && kind !== 'vf'" class="rt-life" :style="{ gridTemplateColumns: `repeat(${lifecycle.length}, 1fr)` }" :aria-label="lifeLabel" :title="lifeLabel">
        <li v-for="step in lifecycle" :key="step.key" :class="{ done: step.done }" />
      </ol>

      <!-- Une seule action visible (la principale) ; les autres passent dans le menu. -->
      <div v-if="actions.length" class="rt-actions" @click.stop>
        <UiButton size="sm" variant="primary" class="rt-main-action" :title="actions[0].label" :aria-label="actions[0].short ? actions[0].label : undefined" :disabled="busy" @click="$emit('act', item, actions[0].key)">
          <template v-if="actions[0].short"><span class="rt-label-long">{{ actions[0].label }}</span><span class="rt-label-short" aria-hidden="true">{{ actions[0].short }}</span></template>
          <template v-else>{{ actions[0].label }}</template>
        </UiButton>
        <UiMenu v-if="actions.length > 1" :label="item.title" align="end" :disabled="busy">
          <template #trigger>
            <UiButton size="sm" icon-only :title="`Autres actions pour ${item.title}`" :aria-label="`Autres actions pour ${item.title}`" :disabled="busy">
              <Ellipsis />
            </UiButton>
          </template>
          <UiMenuItem
            v-for="action in actions.slice(1)"
            :key="action.key"
            :variant="action.key === 'withdraw' || action.key === 'reject' ? 'danger' : 'default'"
            @select="$emit('act', item, action.key)"
          >{{ action.label }}</UiMenuItem>
        </UiMenu>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Ellipsis } from '@lucide/vue';
import MediaPoster from '@/components/media/MediaPoster.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiMenu from '@/components/ui/UiMenu.vue';
import UiMenuItem from '@/components/ui/UiMenuItem.vue';
import { mediaTypeLabel } from '@/utils/labels';

const props = withDefaults(defineProps<{ item: any; canModerate?: boolean; busy?: boolean }>(), {
  canModerate: false,
  busy: false,
});
defineEmits<{ (e: 'open', item: any): void; (e: 'act', item: any, action: string): void }>();

const tracking = computed(() => props.item.journey ? props.item.journey.tracking : props.item.tracking);
const lifecycle = computed(() => props.item.journey
  ? props.item.journey.steps.map((step: any) => ({ ...step, done: step.state === 'completed' }))
  : props.item.lifecycle || []);
const kind = computed<string>(() => tracking.value?.kind || (props.item.vf_missing ? 'vf' : 'available'));
const motifLabel = computed(() => {
  if (tracking.value?.label) return tracking.value.label;
  return props.item.vf_missing ? 'Disponible en VO · VF recherchée' : 'Disponible';
});

/* Libelle court de la pastille : le libelle complet reste en infobulle. */
const SHORT_LABELS: Record<string, string> = {
  approval: 'À approuver',
  failed: 'Échec',
  rejected: 'Refusée',
  not_found: 'Introuvable',
  missing_episodes: 'Épisodes manquants',
  downloading: 'Téléchargement',
  queued: 'En file',
  importing: 'Import Plex',
  unreleased: 'Pas encore sorti',
  vf: 'VF manquante',
  available: 'Disponible',
};
const shortLabel = computed(() => SHORT_LABELS[kind.value] || motifLabel.value);

const meta = computed(() => {
  const parts = [mediaTypeLabel(props.item.media_type)];
  if (props.item.year) parts.push(String(props.item.year));
  if (props.item.requested_by) parts.push(`demandé par ${props.item.requested_by}`);
  return parts.join(' · ');
});

/* Depuis quand la demande attend dans son etat actuel (sinon depuis la demande). */
const since = computed<string | null>(() => tracking.value?.since || props.item.requested_at || null);
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
const ageShort = computed(() => (since.value ? duree(sinceDays.value) : ''));
const sinceTitle = computed(() => (since.value ? `Depuis le ${new Date(since.value).toLocaleString('fr-FR')}` : undefined));
/* Au-dela d'une semaine, un blocage merite l'attention : l'anciennete passe en rouge. */
const late = computed(() => ['not_found', 'missing_episodes', 'failed'].includes(kind.value) && sinceDays.value > 7);

const progress = computed<number | null>(() => {
  const value = tracking.value?.download?.progress;
  return typeof value === 'number' ? value : null;
});
/* Bas de l'affiche : avancement du telechargement, des episodes, ou date de sortie. */
const footer = computed(() => {
  const download = tracking.value?.download;
  if (download && typeof download.progress === 'number') {
    const reste = download.timeleft ? ` · encore ${String(download.timeleft).replace(/^00:/, '')}` : '';
    return `${Math.round(download.progress)} %${reste}`;
  }
  if (episodes.value) return episodes.value.text;
  if (kind.value === 'unreleased') {
    const label = String(tracking.value?.label || '');
    return label.includes(' · ') ? label.split(' · ').slice(1).join(' · ') : '';
  }
  return '';
});
/* Sous le titre : la raison d'un echec, seule information qui ne tient pas sur l'image. */
const note = computed(() => (kind.value === 'failed' ? props.item.fulfillment_error || '' : ''));
const lifeLabel = computed(() => {
  if (props.item.journey) return props.item.journey.label;
  const steps = lifecycle.value;
  const done = steps.filter((step: any) => step.done);
  return done.length ? `Étape ${done.length} sur ${steps.length} : ${done[done.length - 1].label}` : 'Étapes de la demande';
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
    text: `${available}/${total} épisodes${aired > available ? ` · ${aired - available} manquant${aired - available > 1 ? 's' : ''}` : ''}`,
  };
});

/* Actions reservees aux moderateurs, selon le motif. La recherche interactive passe par
   la fiche de releases (`/releases/:id`, ouverte dans la feuille), qui met la VF en avant. */
/** `short` : libelle de repli quand le bouton principal est trop etroit. */
interface CardAction { key: string; label: string; short?: string; primary?: boolean }

const actions = computed<CardAction[]>(() => {
  if (!props.canModerate) return [];
  switch (kind.value) {
    case 'approval':
      return [{ key: 'approve', label: 'Approuver', primary: true }, { key: 'reject', label: 'Refuser…' }];
    case 'not_found':
    case 'missing_episodes':
      return [
        { key: 'interactive', label: 'Recherche interactive', short: 'Rechercher', primary: true },
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
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-2);
  align-content: start;
  min-width: 0;
}
.is-approval, .is-importing, .is-vf { --rt-tone: var(--amber-text); }
.is-not_found, .is-missing_episodes, .is-failed, .is-rejected { --rt-tone: var(--red-text); }
.is-downloading, .is-queued { --rt-tone: var(--blue-text); }
.is-unreleased { --rt-tone: var(--muted); }

.rt-art {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--media-placeholder, var(--surface-2));
  cursor: pointer;
  aspect-ratio: 2 / 3;
  container: rt-art / inline-size;
}
.rt-card.is-approval .rt-art { border-color: color-mix(in srgb, var(--accent) 60%, var(--border)); }
.rt-art:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.is-unreleased .rt-art :deep(img) { filter: saturate(.55) brightness(.8); }

.rt-top {
  position: absolute;
  inset: var(--space-2) var(--space-2) auto;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 6px;
  pointer-events: none;
}
.rt-motif, .rt-age {
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: rgb(0 0 0 / 70%);
  backdrop-filter: blur(6px);
  font-size: var(--fs-xs);
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
}
.rt-motif {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  border: 1px solid color-mix(in srgb, var(--rt-tone) 45%, transparent);
  color: var(--rt-tone);
}
.rt-motif::before { content: ''; flex: none; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
/* La pastille est en palette sombre : ses tons se relisent dans cette palette. */
.rt-top { --rt-tone: var(--muted); }
.is-approval .rt-top, .is-importing .rt-top, .is-vf .rt-top { --rt-tone: var(--amber-text); }
.is-not_found .rt-top, .is-missing_episodes .rt-top, .is-failed .rt-top, .is-rejected .rt-top { --rt-tone: var(--red-text); }
.is-downloading .rt-top, .is-queued .rt-top { --rt-tone: var(--blue-text); }
.rt-age { flex: none; color: var(--text); }
/* Au-dela d'une semaine, un blocage merite l'attention : l'anciennete passe en rouge. */
.is-late .rt-age { background: color-mix(in srgb, var(--red) 82%, black); }

.rt-foot {
  position: absolute;
  inset: auto 0 0;
  display: grid;
  gap: 5px;
  padding: var(--space-6) var(--space-2) var(--space-2);
  background: linear-gradient(to top, rgb(0 0 0 / 88%), transparent);
  font-size: var(--fs-xs);
  font-weight: 600;
  text-align: left;
  pointer-events: none;
}
.rt-foot-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.rt-progress { display: block; height: 5px; overflow: hidden; border-radius: var(--radius-pill); background: rgb(255 255 255 / 18%); }
.rt-progress i { display: block; height: 100%; border-radius: inherit; background: var(--blue); transition: width var(--motion-duration-base) var(--motion-ease-standard); }
.rt-episodes { display: flex; gap: 2px; }
.rt-episodes i { flex: 1; height: 5px; border-radius: 2px; background: rgb(255 255 255 / 18%); }
.rt-episodes i.aired { background: color-mix(in srgb, var(--red) 70%, transparent); }
.rt-episodes i.ok { background: var(--green); }

.rt-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; min-width: 0; align-content: start; }
.rt-title {
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  font-size: var(--fs-md);
  font-weight: 600;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
  white-space: normal;
  overflow-wrap: anywhere;
}
.rt-title:hover { text-decoration: underline; }
.rt-meta, .rt-note { margin: 0; color: var(--muted); font-size: var(--fs-xs); }
.rt-meta { margin-top: -4px; }
.rt-note { color: var(--red-text); }

.rt-life { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; margin: 2px 0 0; padding: 0; list-style: none; }
.rt-life li { height: 3px; border-radius: 2px; background: var(--surface-3); }
.rt-life li.done { background: var(--accent); }

.rt-actions { display: flex; gap: 6px; container: rt-actions / inline-size; }
.rt-label-short { display: none; }
/* Deux cartes par rangee sur telephone : « Recherche interactive » se lisait
   « Recherche i… ». Sous 240 px, le bouton prend son libelle court ; le libelle complet
   reste annonce par `aria-label` et l'info-bulle. */
@container rt-actions (max-width: 240px) {
  .rt-label-long { display: none; }
  .rt-label-short { display: inline; }
}
/* Sur une colonne etroite (deux affiches par rangee), le libelle se tronque au lieu de
   pousser la carte hors de sa colonne. `:deep` : la racine de UiButton ne porte pas
   l'attribut de portee de la carte. */
.rt-actions > :deep(.rt-main-action) { flex: 1; min-width: 0; padding-inline: 10px; }
.rt-actions > :deep(.rt-main-action .ui-button-label) { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.rt-actions > :deep(:not(.rt-main-action)) { flex: none; }

/* Deux affiches par rangee sur telephone : pastilles resserrees pour que le motif et
   l'anciennete tiennent cote a cote. */
@container rt-art (max-width: 200px) {
  .rt-top { inset: 6px 6px auto; gap: 4px; }
  .rt-motif, .rt-age { padding: 1px 6px; font-size: 11px; }
  .rt-motif { gap: 0; }
  .rt-motif::before { display: none; }
}
</style>
