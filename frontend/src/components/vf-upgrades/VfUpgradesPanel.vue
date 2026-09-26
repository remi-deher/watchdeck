<template>
  <div v-if="loading && !groups.length" class="vf-skeletons" aria-hidden="true">
    <div v-for="i in 3" :key="`skel-${i}`" class="vf-skeleton-card">
      <div class="skeleton-poster" />
      <div class="skeleton-body">
        <div class="skeleton-line title" />
        <div class="skeleton-line sub" />
        <div class="skeleton-line row" />
      </div>
    </div>
  </div>

  <section v-else class="upgrade-list">
    <article v-for="group in groups" :key="group.key" class="upgrade-card" :class="{ 'is-selected': selectedKeys.has(group.key) }">
      <div class="poster-col">
        <label class="upgrade-select" :title="selectedKeys.has(group.key) ? 'Retirer de la sélection' : 'Sélectionner pour un scan groupé'">
          <UiCheckbox :model-value="selectedKeys.has(group.key)" :aria-label="`Sélectionner ${group.media?.title || group.key}`" @update:model-value="emit('toggle-select', group)" />
        </label>
        <img
          v-if="hasPoster(group)"
          :src="group.media?.poster_url || undefined"
          :alt="`Affiche de ${group.media?.title || 'ce média'}`"
          class="upgrade-poster"
          loading="lazy"
          decoding="async"
          @error="onPosterError(group.key)"
        >
        <div v-else class="upgrade-poster poster-placeholder">
          <Film v-if="group.media?.media_type === 'movie'" :size="28" />
          <Tv v-else :size="28" />
        </div>
      </div>

      <div class="upgrade-main">
        <header class="media-header">
          <div class="media-title-group">
            <div class="media-tags badge-row">
              <span class="badge" :class="group.media?.media_type === 'movie' ? 'badge-movie' : 'badge-show'">
                {{ group.media?.media_type === 'movie' ? 'Film' : 'Série' }}
              </span>
              <span class="badge available" v-if="groupPendingCount(group) > 0">
                {{ groupPendingCount(group) }} à traiter
              </span>
              <span class="badge" v-else-if="groupHasWaiting(group)">
                En attente de release
              </span>
              <span class="badge pending" v-else>
                {{ group.items.length }} opportunité{{ group.items.length > 1 ? 's' : '' }}
              </span>
            </div>
            <RouterLink class="media-title" :to="mediaLink(group)">
              {{ group.media?.title || 'Média sans titre' }}
            </RouterLink>
          </div>
          <div class="media-meta-count">
            <span v-if="group.releaseCount > 0">{{ group.releaseCount }} release{{ group.releaseCount > 1 ? 's' : '' }}</span>
            <span v-else class="text-muted">VO sans release VF</span>
            <UiButton v-if="groupIsIgnored(group)" class="compact" title="Réactiver le scan pour ce média" @click="emit('ignore', group, false)">
              <Eye :size="14" /> Réactiver
            </UiButton>
            <UiButton variant="danger" v-else class="compact" :title="group.media?.media_type === 'movie' ? 'Ignorer ce film : ne sera plus proposé par le scan de fond' : 'Ignorer cette série : ne sera plus proposée par le scan de fond'" @click="emit('ignore', group, true)">
              <EyeOff :size="14" /> Ignorer
            </UiButton>
          </div>
        </header>

        <!-- Pour les films -->
        <div v-if="group.media?.media_type === 'movie' || (group.seasons.length === 1 && group.seasons[0].key === 'movie')" class="movie-targets">
          <div
            v-for="item in group.items"
            :key="item.id"
            class="target-row"
            :class="`status-${item.status}`"
          >
            <div class="target-summary">
              <div class="target-info">
                <strong>Film complet</strong>
                <span>Détecté le {{ formatDate(item.scanned_at) }}</span>
                <span v-if="item.status === 'waiting_release' && item.backoff" class="backoff-info" :title="`${item.backoff.misses} recherche(s) restée(s) sans résultat`">
                  {{ formatBackoff(item.backoff) }}
                </span>
              </div>
              <div class="target-badges">
                <StatusBadge :status="item.status" :label="statusLabel(item.status)" />
              </div>
              <div class="target-actions">
                <VfUpgradeButton
                  :source-type="item.source_type"
                  :source-id="item.source_id"
                  :scope="item.scope"
                  :media-title="group.media?.title"
                  :label="releaseButtonLabel(item)"
                  @updated="emit('refresh')"
                />
                <UiButton variant="danger" v-if="item.status === 'pending'" class="compact" title="Ignorer cette suggestion" @click="emit('dismiss', item)">
                  Ignorer
                </UiButton>
              </div>
            </div>
            <p v-if="item.arr_message" class="arr-message">
              {{ item.arr_message }}
              <span v-if="item.status === 'failed' && item.retry_count" class="retry-count">
                ({{ item.retry_count }} échec{{ item.retry_count > 1 ? 's' : '' }} consécutif{{ item.retry_count > 1 ? 's' : '' }})
              </span>
            </p>
            <footer v-if="item.accepted_at" class="target-footer">
              <span>Accepté le {{ formatDate(item.accepted_at) }}</span>
            </footer>
          </div>
        </div>

        <!-- Pour les séries : utilisation du composant partagé SeasonEpisodeList -->
        <SeasonEpisodeList
          v-else
          class="show-seasons-list"
          :seasons="group.seasons"
        >
          <template #season-header="{ season }">
            <span class="season-title">{{ season.label }}</span>
            <span class="season-badge-count">
              {{ (season.episodes || season.items || []).length }} élément{{ (season.episodes || season.items || []).length > 1 ? 's' : '' }}
            </span>
            <div class="season-status-summary">
              <StatusBadge
                v-for="entry in seasonStatusSummary(season)"
                :key="entry.status"
                :status="entry.status"
                :label="`${entry.count} ${statusLabel(entry.status)}`"
              />
            </div>
          </template>

          <template #episode="{ episode: item }">
            <article
              :key="item.id"
              class="target-row"
              :class="`status-${item.status}`"
            >
              <div class="target-summary">
                <div class="target-info">
                  <strong>{{ targetLabel(item) }}</strong>
                  <span>Détecté le {{ formatDate(item.scanned_at) }}</span>
                <span v-if="item.status === 'waiting_release' && item.backoff" class="backoff-info" :title="`${item.backoff.misses} recherche(s) restée(s) sans résultat`">
                  {{ formatBackoff(item.backoff) }}
                </span>
                </div>
                <div class="target-badges">
                  <StatusBadge :status="item.status" :label="statusLabel(item.status)" />
                </div>
                <div class="target-actions">
                  <VfUpgradeButton
                    :source-type="item.source_type"
                    :source-id="item.source_id"
                    :scope="item.scope"
                    :season-number="item.season_number"
                    :episode-number="item.episode_number"
                    :media-title="group.media?.title"
                    :label="releaseButtonLabel(item)"
                    @updated="emit('refresh')"
                  />
                  <UiButton variant="danger" v-if="item.status === 'pending'" class="compact" title="Ignorer cette suggestion" @click="emit('dismiss', item)">
                    Ignorer
                  </UiButton>
                </div>
              </div>
              <p v-if="item.arr_message" class="arr-message">
              {{ item.arr_message }}
              <span v-if="item.status === 'failed' && item.retry_count" class="retry-count">
                ({{ item.retry_count }} échec{{ item.retry_count > 1 ? 's' : '' }} consécutif{{ item.retry_count > 1 ? 's' : '' }})
              </span>
            </p>
              <footer v-if="item.accepted_at" class="target-footer">
                <span>Accepté le {{ formatDate(item.accepted_at) }}</span>
              </footer>
            </article>
          </template>
        </SeasonEpisodeList>
      </div>
    </article>

    <p v-if="!loading && !groups.length" class="empty">
      Aucune amélioration VF ne correspond à vos critères de recherche.
    </p>
    <!-- En fin de liste : c'est une precision sur ce qu'on vient de parcourir. En tete,
         ce paragraphe pleine largeur se lisait comme un texte egare avant le contenu. -->
    <p
      v-if="waitingTruncated > 0"
      class="waiting-truncated"
      title="La liste est bornée pour rester rapide. Ces médias restent pris en charge par les cycles de recherche automatiques."
    >
      + {{ waitingTruncated }} média{{ waitingTruncated > 1 ? 's' : '' }} VO suivi{{ waitingTruncated > 1 ? 's' : '' }} automatiquement, non affiché{{ waitingTruncated > 1 ? 's' : '' }}
    </p>
  </section>
</template>

<script setup lang="ts">
import UiCheckbox from '@/components/ui/UiCheckbox.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { ref } from 'vue';
import { Eye, EyeOff, Film, Tv } from '@lucide/vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import VfUpgradeButton from '@/components/media/VfUpgradeButton.vue';
import SeasonEpisodeList from '@/components/media/SeasonEpisodeList.vue';
import { formatDateTimeShort } from '@/utils/format';
import { formatBackoff, releaseButtonLabel, statusLabel, targetLabel } from '@/utils/vfUpgradeLabels';
import type { VfUpgradeGroup, VfUpgradeItem } from '@/types/vfUpgrades';

/**
 * Onglet « Releases & Telechargements » : une carte par media, ses cibles (film,
 * saisons, episodes) et leurs actions. La selection vit dans la vue, qui la partage
 * avec le bouton « Rechercher la selection ».
 */
defineProps<{
  groups: VfUpgradeGroup[];
  loading: boolean;
  /** Medias VO que le serveur n'a pas renvoyes (liste bornee). */
  waitingTruncated: number;
  selectedKeys: ReadonlySet<string>;
}>();
const emit = defineEmits<{
  'toggle-select': [group: VfUpgradeGroup];
  ignore: [group: VfUpgradeGroup, ignored: boolean];
  dismiss: [item: VfUpgradeItem];
  /** Une recherche VF a abouti : relire les suggestions. */
  refresh: [];
}>();

const failedPosters = ref(new Set<string>());
const onPosterError = (key: string) => failedPosters.value.add(key);
const hasPoster = (group: VfUpgradeGroup) => Boolean(group.media?.poster_url && !failedPosters.value.has(group.key));
const groupPendingCount = (group: VfUpgradeGroup) => group.items.filter((item) => item.status === 'pending').length;
const groupHasWaiting = (group: VfUpgradeGroup) => group.items.some((item) => item.status === 'waiting_release');
const groupIsIgnored = (group: VfUpgradeGroup) => group.items.some((item) => item.is_ignored);
const formatDate = (value?: string | null) => formatDateTimeShort(value, '—');

function mediaLink(group: VfUpgradeGroup): string {
  const type = group.source_type === 'request' ? 'request' : 'library';
  return `/library/media/${type}/${group.source_id}`;
}

function seasonStatusSummary(season: { items: VfUpgradeItem[] }): Array<{ status: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of season.items) counts.set(item.status, (counts.get(item.status) || 0) + 1);
  return [...counts.entries()].map(([status, count]) => ({ status, count }));
}
</script>

<style scoped lang="scss">
@use './vfShared' as *;

.upgrade-list {
  display: grid;
  gap: var(--space-4);
}

/* Cartes Upgrades standard */
.upgrade-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-5);
  padding: 20px 22px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: 0 2px 8px rgb(var(--shadow-color) / calc(0.12 * var(--shadow-scale)));
  transition: border-color var(--motion-duration-instant) var(--motion-ease-standard), background-color var(--motion-duration-instant) var(--motion-ease-standard);
}

.upgrade-card.is-selected {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 6%, var(--surface));
}

.poster-col {
  position: relative;
  flex-shrink: 0;
  width: 85px;
}

.upgrade-select {
  position: absolute;
  top: -6px;
  left: -6px;
  z-index: 1;
  display: flex;
  padding: 3px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  cursor: pointer;
}


.upgrade-poster {
  width: 85px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  object-fit: cover;
  display: block;
  box-shadow: 0 2px 8px rgb(var(--shadow-color) / calc(0.25 * var(--shadow-scale)));
  background: var(--surface-2);
}

.poster-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  border: 1px dashed var(--border);
}

.upgrade-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.media-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding-bottom: 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}

.media-title-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.media-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.media-meta-count {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.media-meta-count span {
  color: var(--muted);
  font-size: var(--fs-xs);
  white-space: nowrap;
}

.movie-targets {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.target-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-left: 3px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.target-row.status-pending {
  border-left-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 4%, var(--surface));
}

.target-row.status-accepted,
.target-row.status-downloading,
.target-row.status-importing {
  border-left-color: var(--blue-text);
}

.target-row.status-awaiting_verification {
  border-left-color: var(--accent);
}

.target-row.status-verified,
.target-row.status-grabbed {
  border-left-color: var(--green-text, var(--green));
}

.target-row.status-failed {
  border-left-color: var(--red-text, var(--red));
}

.target-row.status-dismissed {
  border-left-color: var(--muted);
  opacity: 0.75;
}

.target-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.target-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 140px;
}

.target-info strong {
  font-size: var(--fs-sm);
  color: var(--text);
}

.target-info span {
  color: var(--muted);
  font-size: var(--fs-xs);
}

.target-badges {
  display: flex;
  align-items: center;
}

.target-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
}

.target-actions button.compact {
  min-height: 30px;
  padding: 0 10px;
  font-size: var(--fs-xs);
  display: inline-flex;
  align-items: center;
}

.arr-message {
  margin: 0;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--text);
  font-size: var(--fs-xs);
}

.retry-count {
  color: var(--muted);
  font-weight: 600;
}

.target-footer {
  display: flex;
  justify-content: flex-end;
  color: var(--muted);
  font-size: var(--fs-xs);
}

.backoff-info {
  color: var(--amber-text);
}

.waiting-truncated {
  margin: var(--space-2) 0 0;
  color: var(--text-muted);
  font-size: var(--fs-xs);
  text-align: center;
}

/* Les variantes compactes descendent a 30-32px : acceptable a la souris, sous le
   minimum tactile d'iOS et de Material des qu'il n'y a plus de curseur. « Ignorer »
   etait a 58x32 et se repetait 55 fois sur la page. */
@media (pointer: coarse) {
  .target-actions button.compact {
    min-height: var(--touch-target);
    padding-inline: 14px;
  }
}
</style>
