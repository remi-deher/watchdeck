<template>
  <div class="page vf-upgrades-page">
    <PageSearchHeader
      title="Améliorations VF & Flux"
      description="Optimisation des pistes Plex (mode PASTA) et recherche d'opportunités d'upgrades francophones."
      eyebrow="Bibliothèque"
      v-model:query="query"
      :placeholder="activeTab === 'upgrades' ? 'Rechercher un film, une série ou une release…' : 'Rechercher un film ou une série…'"
      has-filters
      :active-count="activeFilterCount"
      :filters-open="filtersOpen"
      @toggle-filters="toggleFilters"
    >
      <template #actions>
        <template v-if="activeTab === 'upgrades'">
          <UiButton variant="primary" :loading="scanning" @click="scanTriggered"><template #icon><ScanSearch size="16" /></template>{{ scanning ? 'Recherche en cours…' : (selectedKeys.size > 0 ? `Rechercher la sélection (${selectedKeys.size})` : 'Rechercher maintenant') }}</UiButton>
        </template>
        <template v-else>
          <UiButton
            v-if="eligibleAuditFixCount > 0"
            variant="primary"
            :loading="fixingAll"
            :disabled="auditLoading"
            title="Aligner les pistes de tous les médias audités pour tous les profils Plex"
            @click="fixAllStreams"
          >
            <template #icon><SlidersHorizontal size="16" /></template>{{ fixingAll ? 'Alignement en cours…' : `Tout aligner (${eligibleAuditFixCount})` }}
          </UiButton>
          <UiButton :loading="auditLoading" :disabled="fixingAll" @click="() => loadAudit()"><template #icon><RotateCcw size="16" /></template>Actualiser l'audit</UiButton>
        </template>
      </template>
    </PageSearchHeader>

    <!-- Navigation par onglets -->
    <TabNav
      :model-value="activeTab"
      :tabs="tabs"
      aria-label="Modes des améliorations VF"
      @update:model-value="selectTab"
    />

    <template v-if="activeTab !== 'history'">
      <VfUpgradeKpiBanner
        :audit="activeTab === 'audit'"
        :active-filter="activeTab === 'audit' ? auditIssueFilter : statusFilter"
        :audit-counts="auditCounts"
        :eligible-audit-fix-count="eligibleAuditFixCount"
        :pending-count="pendingCount"
        :waiting-release-count="waitingReleaseCount"
        :in-progress-count="inProgressCount"
        :failed-count="failedCount"
        :history-count="historyCount"
        @select="activeTab === 'audit' ? toggleAuditFilter($event) : toggleStatusFilter($event)"
      />

      <VfUpgradeQuickFilters
        :audit="activeTab === 'audit'"
        :active-status="activeTab === 'audit' ? auditIssueFilter : statusFilter"
        :media-type="activeTab === 'audit' ? auditMediaTypeFilter : mediaTypeFilter"
        :total-audit-items="auditItems.length"
        :audit-counts="auditCounts"
        :eligible-audit-fix-count="eligibleAuditFixCount"
        :pending-count="pendingCount"
        :waiting-release-count="waitingReleaseCount"
        :in-progress-count="inProgressCount"
        :failed-count="failedCount"
        :history-count="historyCount"
        @status="activeTab === 'audit' ? toggleAuditFilter($event) : statusFilter = $event"
        @media-type="setMediaTypeFilter"
      />
    </template>

    <div class="psh-layout">
      <!-- Panneau latéral standard de filtres (tiroir de repli / maintenance) -->
      <FilterSidebar
        v-if="activeTab === 'upgrades'"
        :open="filtersOpen"
        :active-count="activeFilterCount"
        @close="closeFilters"
        @reset="resetUpgradeFilters"
      >
        <FilterGroup label="Statut">
          <button
            class="filter-badge"
            :class="{ active: statusFilter === 'pending' }"
            type="button"
            @click="statusFilter = 'pending'"
          >
            <span>À traiter</span>
            <small v-if="pendingCount">({{ pendingCount }})</small>
          </button>
          <button
            class="filter-badge"
            :class="{ active: statusFilter === 'waiting_release' }"
            type="button"
            @click="statusFilter = 'waiting_release'"
          >
            <span>En attente de release</span>
            <small v-if="waitingReleaseCount">({{ waitingReleaseCount }})</small>
          </button>
          <button
            class="filter-badge"
            :class="{ active: statusFilter === 'in_progress' }"
            type="button"
            @click="statusFilter = 'in_progress'"
          >
            <span>En cours</span>
            <small v-if="inProgressCount">({{ inProgressCount }})</small>
          </button>
          <button
            class="filter-badge"
            :class="{ active: statusFilter === 'failed' }"
            type="button"
            @click="statusFilter = 'failed'"
          >
            <span>Échecs</span>
            <small v-if="failedCount">({{ failedCount }})</small>
          </button>
          <button
            class="filter-badge"
            :class="{ active: statusFilter === 'history' }"
            type="button"
            @click="statusFilter = 'history'"
          >
            <span>Historique</span>
            <small v-if="historyCount">({{ historyCount }})</small>
          </button>
          <button
            class="filter-badge"
            :class="{ active: statusFilter === 'all' }"
            type="button"
            @click="statusFilter = 'all'"
          >
            <span>Tous les statuts</span>
          </button>
        </FilterGroup>

        <FilterGroup label="Type de média">
          <button
            class="filter-badge"
            :class="{ active: !mediaTypeFilter }"
            type="button"
            @click="mediaTypeFilter = ''"
          >
            <span>Tous les types</span>
          </button>
          <button
            class="filter-badge"
            :class="{ active: mediaTypeFilter === 'movie' }"
            type="button"
            @click="mediaTypeFilter = 'movie'"
          >
            <span>Films</span>
          </button>
          <button
            class="filter-badge"
            :class="{ active: mediaTypeFilter === 'show' }"
            type="button"
            @click="mediaTypeFilter = 'show'"
          >
            <span>Séries</span>
          </button>
        </FilterGroup>

        <FilterGroup label="Maintenance">
          <div class="filter-maintenance-buttons">
            <button class="secondary compact" type="button" title="Réouvrir les suggestions en échec" @click="maintenance('recompute')">
              <RotateCcw size="14" />
              <span>Réouvrir les échecs</span>
            </button>
            <button class="secondary compact" type="button" title="Supprimer les entrées archivées" @click="maintenance('purge')">
              <Trash2 size="14" />
              <span>Purger l'historique</span>
            </button>
          </div>
        </FilterGroup>
      </FilterSidebar>

      <!-- Panneau latéral standard pour l'onglet Audit -->
      <FilterSidebar
        v-else-if="activeTab === 'audit'"
        :open="filtersOpen"
        :active-count="activeFilterCount"
        @close="closeFilters"
        @reset="resetAuditFilters"
      >
        <FilterGroup label="Anomalie / Opportunité">
          <button
            class="filter-badge"
            :class="{ active: !auditIssueFilter }"
            type="button"
            @click="auditIssueFilter = ''"
          >
            <span>Toutes les anomalies</span>
            <small v-if="auditCounts.total">({{ auditCounts.total }})</small>
          </button>
          <button
            class="filter-badge"
            :class="{ active: auditIssueFilter === 'eligible' }"
            type="button"
            @click="auditIssueFilter = 'eligible'"
          >
            <span>Prêts à aligner</span>
            <small>({{ eligibleAuditFixCount }})</small>
          </button>
          <button
            class="filter-badge"
            :class="{ active: auditIssueFilter === 'audio_secondary' }"
            type="button"
            @click="auditIssueFilter = 'audio_secondary'"
          >
            <span>Audio FR secondaire</span>
            <small v-if="auditCounts.audio_secondary">({{ auditCounts.audio_secondary }})</small>
          </button>
          <button
            class="filter-badge"
            :class="{ active: auditIssueFilter === 'forced_sub_not_default' }"
            type="button"
            @click="auditIssueFilter = 'forced_sub_not_default'"
          >
            <span>ST forcé inactif</span>
            <small v-if="auditCounts.forced_sub_not_default">({{ auditCounts.forced_sub_not_default }})</small>
          </button>
          <button
            class="filter-badge"
            :class="{ active: auditIssueFilter === 'sub_fr_not_default' }"
            type="button"
            @click="auditIssueFilter = 'sub_fr_not_default'"
          >
            <span>ST VO inactif</span>
            <small v-if="auditCounts.sub_fr_not_default">({{ auditCounts.sub_fr_not_default }})</small>
          </button>
          <button
            class="filter-badge"
            :class="{ active: auditIssueFilter === 'partial_vf' }"
            type="button"
            @click="auditIssueFilter = 'partial_vf'"
          >
            <span>Séries partielles</span>
            <small v-if="auditCounts.partial_vf">({{ auditCounts.partial_vf }})</small>
          </button>
        </FilterGroup>

        <FilterGroup label="Type de média">
          <button
            class="filter-badge"
            :class="{ active: !auditMediaTypeFilter }"
            type="button"
            @click="auditMediaTypeFilter = ''"
          >
            <span>Tous les types</span>
          </button>
          <button
            class="filter-badge"
            :class="{ active: auditMediaTypeFilter === 'movie' }"
            type="button"
            @click="auditMediaTypeFilter = 'movie'"
          >
            <span>Films</span>
          </button>
          <button
            class="filter-badge"
            :class="{ active: auditMediaTypeFilter === 'show' }"
            type="button"
            @click="auditMediaTypeFilter = 'show'"
          >
            <span>Séries</span>
          </button>
        </FilterGroup>
      </FilterSidebar>

      <!-- Zone principale -->
      <div class="psh-main">
        <UiFeedback v-if="feedback" :type="feedbackType" :message="feedback" class="vf-feedback" dismissible @dismiss="clearFeedback" />

        <!-- Onglet 1 : Alignement des pistes (Mode PASTA) -->
        <template v-if="activeTab === 'audit'">
          <div v-if="auditLoading && !auditFilteredItems.length" class="vf-skeletons" aria-hidden="true">
            <div v-for="i in 3" :key="`skel-audit-${i}`" class="vf-skeleton-card">
              <div class="skeleton-poster" />
              <div class="skeleton-body">
                <div class="skeleton-line title" />
                <div class="skeleton-line sub" />
                <div class="skeleton-line row" />
              </div>
            </div>
          </div>

          <section v-else class="audit-list">
            <article
              v-for="item in auditFilteredItems"
              :key="`audit-${item.id}`"
              class="audit-card"
              :class="{ 'is-expanded': isAuditShowExpanded(item.id) }"
            >
              <div class="audit-card-top">
                <!-- Zone 1 : Affiche & Titre -->
                <div class="card-media-col">
                  <div class="poster-wrap">
                    <img
                      v-if="item.poster_url && !failedPosters.has(`audit-${item.id}`)"
                      :src="item.poster_url"
                      :alt="`Affiche de ${item.title}`"
                      class="media-poster"
                      loading="lazy"
                      decoding="async"
                      @error="failedPosters.add(`audit-${item.id}`)"
                    >
                    <div v-else class="media-poster placeholder">
                      <Film v-if="item.media_type === 'movie'" :size="24" />
                      <Tv v-else :size="24" />
                    </div>
                  </div>

                  <div class="media-identity">
                    <div class="media-badges">
                      <span class="badge" :class="item.media_type === 'movie' ? 'badge-movie' : 'badge-show'">
                        {{ item.media_type === 'movie' ? 'Film' : 'Série' }}
                      </span>
                      <span v-if="item.year" class="badge badge-year">{{ item.year }}</span>
                    </div>
                    <RouterLink class="media-title" :to="`/library/media/library/${item.id}`">
                      {{ item.title || 'Média sans titre' }}
                    </RouterLink>
                  </div>
                </div>

                <!-- Zone 2 : Matrice de diagnostic Audio / Sous-titres -->
                <div class="card-diag-col">
                  <!-- Ligne Audio FR -->
                  <div class="diag-row" :class="audioRowClass(item)">
                    <Volume2 v-if="item.has_vf" size="15" />
                    <VolumeX v-else size="15" />
                    <span class="diag-label">Audio FR :</span>
                    <strong class="diag-status">{{ audioStatusLabel(item) }}</strong>
                  </div>

                  <!-- Ligne Sous-titres FR -->
                  <div class="diag-row" :class="subtitleRowClass(item)">
                    <MessageSquare v-if="item.sub_fr_status !== 'absent'" size="15" />
                    <MessageSquareOff v-else size="15" />
                    <span class="diag-label">Sous-titres :</span>
                    <strong class="diag-status">{{ subtitleStatusLabel(item.sub_fr_status) }}</strong>
                  </div>

                  <!-- Ligne Sous-titres forcés (si VF présente) -->
                  <div v-if="item.has_vf" class="diag-row" :class="forcedRowClass(item)">
                    <span class="diag-icon-dot" />
                    <span class="diag-label">ST Forcés :</span>
                    <strong class="diag-status">{{ forcedStatusLabel(item.forced_fr_status) }}</strong>
                  </div>
                </div>

                <!-- Zone 3 : Actions principales contextuelles -->
                <div class="card-action-col">
                  <button
                    v-if="item.media_type === 'show'"
                    class="secondary compact"
                    type="button"
                    :title="isAuditShowExpanded(item.id) ? 'Masquer les saisons' : 'Voir les saisons et épisodes'"
                    @click="toggleAuditShow(item)"
                  >
                    <ChevronUp v-if="isAuditShowExpanded(item.id)" size="14" />
                    <ChevronDown v-else size="14" />
                    <span>{{ isAuditShowExpanded(item.id) ? 'Masquer' : 'Saisons & Épisodes' }}</span>
                  </button>

                  <button
                    v-if="canFixStreams(item)"
                    class="primary compact"
                    type="button"
                    :disabled="fixingItemId === item.id || fixingAll"
                    title="Prévisualiser et aligner les flux audio et sous-titres sur Plex"
                    @click="openAlignModal(item)"
                  >
                    <SlidersHorizontal size="14" />
                    <span>Aligner sur Plex</span>
                  </button>

                  <VfUpgradeButton
                    source-type="library_item"
                    :source-id="item.id"
                    :scope="item.media_type === 'movie' ? 'movie' : 'season'"
                    :media-title="item.title"
                    label="Chercher VF"
                    @updated="() => loadAudit({ silent: true })"
                  />

                  <RouterLink class="button secondary compact" :to="`/library/media/library/${item.id}`">
                    Fiche
                  </RouterLink>
                </div>
              </div>

              <!-- Zone Saisons & Épisodes pour les séries -->
              <div v-if="item.media_type === 'show' && isAuditShowExpanded(item.id)" class="audit-show-episodes-wrap">
                <div v-if="getAuditShowLoading(item.id)" class="audit-episodes-loading">
                  <RotateCcw size="15" class="spin" />
                  <span>Chargement des saisons et épisodes…</span>
                </div>
                <div v-else-if="getAuditShowError(item.id)" class="notice error-text">
                  <span>Impossible de charger les détails de cette série.</span>
                </div>
                <SeasonEpisodeList
                  v-else-if="getAuditShowSeasons(item.id).length"
                  class="show-seasons-list"
                  :seasons="getAuditShowSeasons(item.id)"
                  @expand-season="(sNum) => loadAuditShowSeason(item.id, sNum)"
                >
                  <template #season-header="{ season }">
                    <span class="season-title">Saison {{ season.season_number }}</span>
                    <span class="season-badge-count">
                      {{ season.episode_count || (season.episodes || []).length }} épisodes
                    </span>
                    <div class="season-status-summary">
                      <span v-if="season.counts?.vf" class="badge available">VF: {{ season.counts.vf }}</span>
                      <span v-if="season.counts?.vo" class="badge">VO: {{ season.counts.vo }}</span>
                      <span v-if="season.counts?.vf_secondary" class="badge language-tag vf-secondary">VF (sec.): {{ season.counts.vf_secondary }}</span>
                      <span v-if="season.counts?.sub_fr_not_default" class="badge pending">ST inactif: {{ season.counts.sub_fr_not_default }}</span>
                      <span v-if="season.counts?.forced_fr_not_default" class="badge language-tag vf-secondary">Forcé inactif: {{ season.counts.forced_fr_not_default }}</span>
                      <span v-if="season.counts?.sub_fr_absent" class="badge danger">ST absent: {{ season.counts.sub_fr_absent }}</span>
                      <VfUpgradeButton
                        source-type="library_item"
                        :source-id="item.id"
                        scope="season"
                        :season-number="season.season_number"
                        :media-title="item.title"
                        label="Chercher VF"
                        @updated="() => loadAudit({ silent: true })"
                      />
                    </div>
                  </template>

                  <template #episode="{ season, episode: ep }">
                    <div class="audit-episode-row">
                      <div class="audit-episode-main">
                        <strong class="audit-episode-title">{{ ep.episode }}. {{ ep.title || `Épisode ${ep.episode}` }}</strong>
                        <div class="audit-episode-badges">
                          <span
                            class="badge"
                            :class="{
                              'available': ep.status === 'vf',
                              'language-tag vf-secondary': ep.status === 'vf_secondary',
                              'muted': ep.status === 'vo',
                              'danger': ep.status === 'absent',
                            }"
                          >
                            {{ ep.status === 'vf' ? 'VF' : ep.status === 'vf_secondary' ? 'VF secondaire' : ep.status === 'vo' ? 'VO' : ep.status }}
                          </span>
                          <span v-if="ep.has_forced_fr_sub && !ep.forced_fr_sub_is_default" class="badge language-tag vf-secondary" title="Sous-titre forcé FR non activé par défaut">
                            Forcé non activé
                          </span>
                          <span v-if="ep.has_full_fr_sub && !ep.full_fr_sub_is_default" class="badge pending" title="Sous-titre complet FR non activé par défaut">
                            ST non activé
                          </span>
                          <span v-if="ep.has_any_sub_track === false" class="badge danger" title="Aucune piste de sous-titre détectée">
                            ST absent
                          </span>
                        </div>
                      </div>
                      <div class="audit-episode-actions">
                        <VfUpgradeButton
                          source-type="library_item"
                          :source-id="item.id"
                          scope="episode"
                          :season-number="season.season_number"
                          :episode-number="ep.episode"
                          :media-title="item.title"
                          label="Chercher VF"
                          @updated="() => loadAudit({ silent: true })"
                        />
                      </div>
                    </div>
                  </template>
                </SeasonEpisodeList>
                <p v-else class="empty">Aucun détail de saison disponible.</p>
              </div>
            </article>

            <p v-if="!auditLoading && !auditFilteredItems.length" class="empty">
              Aucun média ne correspond aux filtres d'audit sélectionnés.
            </p>
          </section>
        </template>

        <!-- Onglet 2 : Releases & Remplacements (*arr) -->
        <template v-else-if="activeTab === 'upgrades'">
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
                  <input type="checkbox" :checked="selectedKeys.has(group.key)" @change="toggleGroupSelection(group)">
                </label>
                <img
                  v-if="hasPoster(group)"
                  :src="group.media.poster_url"
                  :alt="`Affiche de ${group.media.title}`"
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
                          :label="item.status === 'waiting_release' ? 'Rechercher VF' : `${item.release_count || 1} release${(item.release_count || 1) > 1 ? 's' : ''}`"
                          @updated="() => load({ silent: true })"
                        />
                        <button
                          v-if="item.status === 'pending'"
                          class="secondary danger compact"
                          type="button"
                          title="Ignorer cette suggestion"
                          @click="dismiss(item)"
                        >
                          Ignorer
                        </button>
                      </div>
                    </div>
                    <p v-if="item.arr_message" class="arr-message">{{ item.arr_message }}</p>
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
                            :label="item.status === 'waiting_release' ? 'Rechercher VF' : `${item.release_count || 1} release${(item.release_count || 1) > 1 ? 's' : ''}`"
                            @updated="() => load({ silent: true })"
                          />
                          <button
                            v-if="item.status === 'pending'"
                            class="secondary danger compact"
                            type="button"
                            title="Ignorer cette suggestion"
                            @click="dismiss(item)"
                          >
                            Ignorer
                          </button>
                        </div>
                      </div>
                      <p v-if="item.arr_message" class="arr-message">{{ item.arr_message }}</p>
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
          </section>
        </template>

        <!-- Onglet 3 : Historique des cycles de scan -->
        <template v-else-if="activeTab === 'history'">
          <section class="scan-history">
            <div v-if="liveScan && liveScan.status === 'running'" class="scan-live-banner">
              <span class="scan-live-dot" aria-hidden="true" />
              <div class="scan-live-text">
                <strong>Recherche en cours…</strong>
                <span>{{ liveScan.items_scanned || 0 }} / {{ liveScan.total_items || 0 }} recherche(s) effectuée(s)</span>
              </div>
              <div class="scan-live-bar">
                <div
                  class="scan-live-bar-fill"
                  :style="{ width: `${liveScan.total_items ? Math.min(100, (liveScan.items_scanned / liveScan.total_items) * 100) : 0}%` }"
                />
              </div>
            </div>

            <div v-if="scanRunsLoading && !scanRuns.length" class="vf-skeletons" aria-hidden="true">
              <div v-for="i in 3" :key="`run-skel-${i}`" class="skeleton-line title" />
            </div>

            <table v-else-if="scanRuns.length" class="scan-runs-table">
              <thead>
                <tr>
                  <th>Démarré le</th>
                  <th>Durée</th>
                  <th>Déclenchement</th>
                  <th>Recherches</th>
                  <th>Suggestions trouvées</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="run in scanRuns" :key="run.id">
                  <tr
                    class="run-row"
                    :class="`run-status-${run.status}`"
                    tabindex="0"
                    role="button"
                    :aria-expanded="expandedRunId === run.id"
                    @click="toggleRunDetail(run)"
                    @keydown.enter="toggleRunDetail(run)"
                  >
                    <td>
                      <ChevronDown v-if="expandedRunId === run.id" :size="14" class="run-chevron" />
                      <ChevronUp v-else :size="14" class="run-chevron is-collapsed" />
                      {{ formatDate(run.started_at) }}
                    </td>
                    <td>{{ formatDuration(run.started_at, run.finished_at) }}</td>
                    <td>{{ run.trigger === 'selection' ? 'Sélection manuelle' : (run.trigger === 'manual' ? 'Manuel' : 'Automatique') }}</td>
                    <td>{{ run.tasks_scanned }} / {{ run.tasks_total }}</td>
                    <td>{{ run.suggestions_found }}</td>
                    <td>
                      <StatusBadge
                        :status="run.status"
                        :label="run.status === 'running' ? 'En cours' : (run.status === 'success' ? 'Terminé' : 'Échec')"
                      />
                      <span v-if="run.error" class="run-error" :title="run.error">⚠</span>
                    </td>
                  </tr>
                  <tr v-if="expandedRunId === run.id" class="run-detail-row">
                    <td colspan="6">
                      <div v-if="runItemsLoading && !runItems.length" class="vf-skeletons" aria-hidden="true">
                        <div v-for="i in 3" :key="`item-skel-${i}`" class="skeleton-line title" />
                      </div>
                      <p v-else-if="!runItems.length" class="empty">Aucun détail disponible pour ce cycle.</p>
                      <ul v-else class="run-items-list">
                        <li v-for="item in runItems" :key="item.id" :class="`run-item-status-${item.status}`">
                          <span class="run-item-status-dot" aria-hidden="true" />
                          <span class="run-item-title">{{ item.title }}</span>
                          <span class="run-item-badge">
                            {{ item.status === 'running' ? 'En cours…' : item.status === 'found' ? `${item.release_count} release${item.release_count > 1 ? 's' : ''}` : item.status === 'error' ? 'Erreur' : 'Sans résultat' }}
                          </span>
                        </li>
                      </ul>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>

            <p v-else class="empty">Aucun cycle de scan enregistré pour le moment.</p>
          </section>
        </template>
      </div>
    </div>

    <!-- Modale interactive d'alignement des pistes Plex -->
    <AlignStreamsModal
      v-if="alignModalOpen"
      :open="alignModalOpen"
      :item="modalItem"
      @close="alignModalOpen = false"
      @applied="onStreamsAligned"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Film,
  Globe,
  MessageSquare,
  MessageSquareOff,
  RotateCcw,
  ScanSearch,
  SlidersHorizontal,
  Trash2,
  Tv,
  Volume2,
  VolumeX,
} from '@lucide/vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import PageSearchHeader from '@/components/ui/PageSearchHeader.vue';
import TabNav from '@/components/ui/TabNav.vue';
import FilterSidebar from '@/components/ui/FilterSidebar.vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiButton from '@/components/ui/UiButton.vue';
import VfUpgradeButton from '@/components/media/VfUpgradeButton.vue';
import AlignStreamsModal from '@/components/media/AlignStreamsModal.vue';
import SeasonEpisodeList from '@/components/media/SeasonEpisodeList.vue';
import VfUpgradeKpiBanner from '@/components/vf-upgrades/VfUpgradeKpiBanner.vue';
import VfUpgradeQuickFilters from '@/components/vf-upgrades/VfUpgradeQuickFilters.vue';
import { filterVfUpgradeItems, groupVfUpgradeItems } from '@/utils/vfUpgradeGroups';
import { useFiltersDrawer } from '@/composables/useFiltersDrawer';
import { useFeedback } from '@/composables/useFeedback';

const activeTab = ref('upgrades'); // 'upgrades' (*arr) | 'audit' (PASTA)

// Onglet 1 : Suggestions d'upgrades (*arr)
const items = ref([]);
const scan = ref({});
const loading = ref(true);
const scanning = ref(false);
const selectedKeys = ref(new Set());
const statusFilter = ref('pending');
const mediaTypeFilter = ref('');
const query = ref('');
const { message: feedback, type: feedbackType, show, clear: clearFeedback } = useFeedback();

// Onglet 3 : Historique des cycles de scan
const scanRuns = ref([]);
const scanRunsLoading = ref(false);
const liveScan = ref(null);
let livePollTimer = null;

// Detail par media d'un cycle deplie (voir toggleRunDetail) : rafraichi en direct par
// itemsPollTimer tant que le cycle ouvert est encore "running".
const expandedRunId = ref(null);
const runItems = ref([]);
const runItemsLoading = ref(false);
let itemsPollTimer = null;

async function loadScanRuns() {
  scanRunsLoading.value = true;
  try {
    const data = await api('/api/vf-upgrades/scan-runs?limit=20');
    scanRuns.value = data.runs || [];
  } catch (e) {
    show(e.message || String(e), 'error');
  } finally {
    scanRunsLoading.value = false;
  }
}

async function loadRunItems(runId, { silent = false } = {}) {
  if (!silent) runItemsLoading.value = true;
  try {
    const data = await api(`/api/vf-upgrades/scan-runs/${runId}/items`);
    runItems.value = data.items || [];
    return data.run;
  } catch (e) {
    if (!silent) show(e.message || String(e), 'error');
    return null;
  } finally {
    runItemsLoading.value = false;
  }
}

function stopItemsPolling() {
  if (itemsPollTimer) {
    clearInterval(itemsPollTimer);
    itemsPollTimer = null;
  }
}

async function toggleRunDetail(run) {
  if (expandedRunId.value === run.id) {
    expandedRunId.value = null;
    runItems.value = [];
    stopItemsPolling();
    return;
  }
  stopItemsPolling();
  expandedRunId.value = run.id;
  runItems.value = [];
  await loadRunItems(run.id);
  if (run.status === 'running') {
    itemsPollTimer = setInterval(async () => {
      const runState = await loadRunItems(run.id, { silent: true });
      if (runState && runState.status !== 'running') {
        stopItemsPolling();
        await loadScanRuns();
      }
    }, 3000);
  }
}

async function pollLiveScan() {
  try {
    liveScan.value = await api('/api/vf-upgrades/scan-status');
    if (liveScan.value?.status !== 'running') {
      // Le cycle vient de se terminer : rafraîchit la liste pour faire apparaître la ligne finale.
      await loadScanRuns();
    }
  } catch {
    // Silencieux : un échec de polling ponctuel ne doit pas interrompre l'affichage.
  }
}

function startLivePolling() {
  if (livePollTimer) return;
  pollLiveScan();
  livePollTimer = setInterval(pollLiveScan, 3000);
}

function stopLivePolling() {
  if (livePollTimer) {
    clearInterval(livePollTimer);
    livePollTimer = null;
  }
}

function formatBackoff(backoff) {
  if (!backoff) return '';
  const nextCheck = backoff.next_check_at ? new Date(backoff.next_check_at) : null;
  if (!nextCheck) return `${backoff.misses} recherche(s) sans résultat`;
  const diffMs = nextCheck.getTime() - Date.now();
  if (diffMs <= 0) return `${backoff.misses} échec(s) — nouvelle tentative au prochain cycle`;
  const hours = Math.round(diffMs / 3_600_000);
  return `${backoff.misses} échec(s) — prochaine tentative dans ${hours < 1 ? '< 1h' : `~${hours}h`}`;
}

function formatDuration(startedAt, finishedAt) {
  if (!startedAt) return '—';
  const start = new Date(startedAt);
  const end = finishedAt ? new Date(finishedAt) : new Date();
  const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${String(seconds % 60).padStart(2, '0')}s`;
}

// Onglet 2 : Audit & Alignement des flux (Plex)
const auditItems = ref([]);
const auditCounts = ref({
  total: 0,
  audio_secondary: 0,
  sub_fr_not_default: 0,
  forced_sub_not_default: 0,
  partial_vf: 0,
});
const auditLoading = ref(false);
const auditIssueFilter = ref('');
const auditMediaTypeFilter = ref('');

// Dépliage des saisons/épisodes pour les séries dans l'onglet audit
const expandedAuditShows = ref(new Set());
const auditShowSeasons = ref(new Map());

function isAuditShowExpanded(id) {
  return expandedAuditShows.value.has(id);
}

function getAuditShowLoading(id) {
  return Boolean(auditShowSeasons.value.get(id)?.loading);
}

function getAuditShowError(id) {
  return Boolean(auditShowSeasons.value.get(id)?.error);
}

function getAuditShowSeasons(id) {
  return auditShowSeasons.value.get(id)?.seasons || [];
}

async function toggleAuditShow(item) {
  const next = new Set(expandedAuditShows.value);
  if (next.has(item.id)) {
    next.delete(item.id);
  } else {
    next.add(item.id);
    if (!auditShowSeasons.value.has(item.id)) {
      await loadAuditShowDetail(item.id);
    }
  }
  expandedAuditShows.value = next;
}

async function loadAuditShowDetail(id) {
  const map = new Map(auditShowSeasons.value);
  map.set(id, { loading: true, error: false, seasons: [] });
  auditShowSeasons.value = map;
  try {
    const [envelope, availability, vfStatus] = await Promise.all([
      api(`/api/library/${id}/episodes`),
      api(`/api/library/${id}/episodes-availability`).catch(() => ({})),
      api(`/api/library/${id}/episodes-vf-status`).catch(() => ({})),
    ]);
    const availSeasons = Object.fromEntries((availability?.seasons || []).map(s => [s.season_number, s.episodes]));
    const vfSeasons = Object.fromEntries((vfStatus?.seasons || []).map(s => [s.season_number, s.episodes]));

    const seasons = (envelope?.seasons || []).map(s => {
      const avail = availSeasons[s.season_number] || {};
      const vf = vfSeasons[s.season_number] || {};
      return {
        season_number: s.season_number,
        name: s.name,
        episode_count: s.episode_count,
        loaded: false,
        loading: false,
        error: false,
        open: true,
        counts: computeSeasonCounts(avail, vf),
        episodes: [],
      };
    });

    const nextMap = new Map(auditShowSeasons.value);
    nextMap.set(id, { loading: false, error: false, seasons });
    auditShowSeasons.value = nextMap;

    await Promise.all(seasons.map(s => loadAuditShowSeason(id, s.season_number)));
  } catch {
    const nextMap = new Map(auditShowSeasons.value);
    nextMap.set(id, { loading: false, error: true, seasons: [] });
    auditShowSeasons.value = nextMap;
  }
}

async function loadAuditShowSeason(itemId, seasonNumber) {
  const data = auditShowSeasons.value.get(itemId);
  if (!data || !data.seasons) return;
  const season = data.seasons.find(s => s.season_number === seasonNumber);
  if (!season || season.loading) return;
  season.loading = true;
  try {
    const res = await api(`/api/library/${itemId}/episodes/${seasonNumber}`);
    const [availability, vfStatus] = await Promise.all([
      api(`/api/library/${itemId}/episodes-availability`).catch(() => ({})),
      api(`/api/library/${itemId}/episodes-vf-status`).catch(() => ({})),
    ]);
    const avail = (availability?.seasons || []).find(s => s.season_number === seasonNumber)?.episodes || {};
    const vf = (vfStatus?.seasons || []).find(s => s.season_number === seasonNumber)?.episodes || {};

    season.episodes = (res.episodes || []).map(ep => {
      const av = avail[ep.episode_number];
      const v = vf[ep.episode_number];
      let status = 'unknown';
      if (v) status = v.status;
      else if (av?.has_file) status = 'present';
      else if (av?.air_date_utc && new Date(av.air_date_utc) > new Date()) status = 'tba';
      else if (av?.has_file === false) status = 'absent';

      return {
        episode: ep.episode_number,
        title: ep.title,
        status,
        tracks: ep.tracks || [],
        subtitles: ep.subtitles || [],
        has_forced_fr_sub: v?.has_forced_fr_sub ?? false,
        forced_fr_sub_is_default: v?.forced_fr_sub_is_default ?? false,
        has_full_fr_sub: v?.has_full_fr_sub ?? false,
        full_fr_sub_is_default: v?.full_fr_sub_is_default ?? false,
        has_any_sub_track: v?.has_any_sub_track ?? true,
      };
    });
    season.loaded = true;
  } catch {
    season.error = true;
  } finally {
    season.loading = false;
  }
}

function computeSeasonCounts(avail, vf) {
  const keys = new Set([...Object.keys(avail || {}).map(Number), ...Object.keys(vf || {}).map(Number)]);
  const counts = { vf: 0, vf_secondary: 0, vo: 0, present: 0, absent: 0, tba: 0, unknown: 0, sub_fr_no_track: 0, sub_fr_absent: 0, sub_fr_not_default: 0, forced_fr_not_default: 0 };
  for (const k of keys) {
    const v = vf[k];
    const a = avail[k];
    if (v?.status === 'vf') counts.vf++;
    else if (v?.status === 'vf_secondary') counts.vf_secondary++;
    else if (v?.status === 'vo') counts.vo++;
    else if (a?.has_file) counts.present++;
    else if (a?.air_date_utc && new Date(a.air_date_utc) > new Date()) counts.tba++;
    else if (a?.has_file === false) counts.absent++;

    if (v) {
      const isFr = v.status === 'vf' || v.status === 'vf_secondary';
      if (!isFr) {
        if (v.has_full_fr_sub) {
          if (!v.full_fr_sub_is_default) counts.sub_fr_not_default++;
        } else if (v.has_any_sub_track) {
          counts.sub_fr_absent++;
        } else {
          counts.sub_fr_no_track++;
        }
      }
      if (isFr && v.has_forced_fr_sub && !v.forced_fr_sub_is_default) {
        counts.forced_fr_not_default++;
      }
    }
  }
  return counts;
}

// Modale d'alignement unitaire
const alignModalOpen = ref(false);
const modalItem = ref(null);
const fixingItemId = ref(null);
const fixingAll = ref(false);

const statusOptions = [
  { value: 'pending', label: 'À traiter' },
  { value: 'waiting_release', label: 'En attente de release' },
  { value: 'accepted', label: 'Accepté par *arr' },
  { value: 'downloading', label: 'Téléchargement' },
  { value: 'importing', label: 'Import' },
  { value: 'awaiting_verification', label: 'Validation Plex' },
  { value: 'verified', label: 'VF validée' },
  { value: 'failed', label: 'Échec' },
  { value: 'dismissed', label: 'Ignoré' },
];

const ACTIVE_STATES = new Set(['accepted', 'downloading', 'importing', 'awaiting_verification']);
const HISTORY_STATES = new Set(['verified', 'dismissed', 'grabbed']);
const PENDING_STATUSES = new Set(['pending']);

const pendingCount = computed(() => items.value.filter(i => i.status === 'pending').length);
const waitingReleaseCount = computed(() => items.value.filter(i => i.status === 'waiting_release').length);
const inProgressCount = computed(() => items.value.filter(i => ACTIVE_STATES.has(i.status)).length);
const failedCount = computed(() => items.value.filter(i => i.status === 'failed').length);
const historyCount = computed(() => items.value.filter(i => HISTORY_STATES.has(i.status)).length);
const auditTotalCount = computed(() => auditCounts.value.total || auditItems.value.length || 0);

function canFixStreams(item) {
  if (!item) return false;
  return Boolean(
    item.has_vf ||
    item.issues?.includes('audio_secondary') ||
    item.issues?.includes('forced_sub_not_default') ||
    item.issues?.includes('sub_fr_not_default')
  );
}

const eligibleAuditFixCount = computed(() => {
  return auditItems.value.filter(item => canFixStreams(item)).length;
});

const tabs = computed(() => [
  { value: 'audit', label: 'Alignement des pistes (Plex)', count: eligibleAuditFixCount.value || auditTotalCount.value },
  { value: 'upgrades', label: 'Releases & Téléchargements (*arr)', count: pendingCount.value || waitingReleaseCount.value },
  { value: 'history', label: 'Historique des scans' },
]);

function selectTab(value) {
  activeTab.value = value;
  if (value !== 'upgrades') {
    clearSelection();
  }
  if (value === 'audit' && !auditItems.value.length) {
    loadAudit();
  }
  if (value === 'history') {
    if (!scanRuns.value.length) loadScanRuns();
    startLivePolling();
  } else {
    stopLivePolling();
    stopItemsPolling();
    expandedRunId.value = null;
  }
}

const { filtersOpen, toggle: toggleFilters, close: closeFilters } = useFiltersDrawer(
  { statusFilter, mediaTypeFilter },
  { statusFilter: 'pending', mediaTypeFilter: '' }
);
const upgradeDrawer = useFiltersDrawer(
  { statusFilter, mediaTypeFilter, query },
  { statusFilter: 'pending', mediaTypeFilter: '', query: '' }
);
const auditDrawer = useFiltersDrawer(
  { auditIssueFilter, auditMediaTypeFilter, query },
  { auditIssueFilter: '', auditMediaTypeFilter: '', query: '' }
);

const activeFilterCount = computed(() => {
  let count = 0;
  if (activeTab.value === 'upgrades') {
    if (statusFilter.value && statusFilter.value !== 'pending') count++;
    if (mediaTypeFilter.value) count++;
  } else {
    if (auditIssueFilter.value) count++;
    if (auditMediaTypeFilter.value) count++;
  }
  return count;
});

const filtered = computed(() => filterVfUpgradeItems(items.value, query.value, statusFilter.value, mediaTypeFilter.value));
const groups = computed(() => groupVfUpgradeItems(filtered.value));

const auditFilteredItems = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return auditItems.value.filter(item => {
    const matchesQuery = !needle || (item.title || '').toLowerCase().includes(needle);
    const matchesMedia = !auditMediaTypeFilter.value || item.media_type === auditMediaTypeFilter.value;
    let matchesIssue = true;
    if (auditIssueFilter.value === 'eligible') {
      matchesIssue = canFixStreams(item);
    } else if (auditIssueFilter.value) {
      matchesIssue = item.issues?.includes(auditIssueFilter.value);
    }
    return matchesQuery && matchesMedia && matchesIssue;
  });
});

const failedPosters = ref(new Set());

function onPosterError(key) {
  failedPosters.value.add(key);
}

function hasPoster(group) {
  return Boolean(group.media?.poster_url && !failedPosters.value.has(group.key));
}

function groupPendingCount(group) {
  return group.items.filter(i => i.status === 'pending').length;
}

function groupHasWaiting(group) {
  return group.items.some(i => i.status === 'waiting_release');
}

function resetUpgradeFilters() {
  upgradeDrawer.reset();
}

function resetAuditFilters() {
  auditDrawer.reset();
}

function toggleAuditFilter(issue) {
  auditIssueFilter.value = auditIssueFilter.value === issue ? '' : issue;
}

function toggleStatusFilter(status) {
  statusFilter.value = statusFilter.value === status ? 'all' : status;
}

function setMediaTypeFilter(type) {
  if (activeTab.value === 'audit') {
    auditMediaTypeFilter.value = type;
  } else {
    mediaTypeFilter.value = type;
  }
}

function recomputeAuditCounts() {
  const counts = {
    total: 0,
    audio_secondary: 0,
    sub_fr_not_default: 0,
    forced_sub_not_default: 0,
    partial_vf: 0,
  };
  for (const it of auditItems.value) {
    counts.total++;
    for (const iss of it.issues || []) {
      if (counts[iss] !== undefined) counts[iss]++;
    }
  }
  auditCounts.value = counts;
}

function applyStreamsFixInPlace(itemId, patchData = {}) {
  const target = auditItems.value.find(it => it.id === itemId);
  if (!target) return;
  if (patchData.has_vf !== undefined) target.has_vf = patchData.has_vf;
  if (patchData.fr_is_default !== undefined) target.fr_is_default = patchData.fr_is_default;
  else if (target.has_vf) target.fr_is_default = true;

  if (patchData.forced_fr_status !== undefined) target.forced_fr_status = patchData.forced_fr_status;
  else if (target.forced_fr_status === 'not_default') target.forced_fr_status = 'ok';

  if (patchData.sub_fr_status !== undefined) target.sub_fr_status = patchData.sub_fr_status;
  else if (target.sub_fr_status === 'not_default') target.sub_fr_status = 'ok';
  else if (target.sub_fr_status === 'forced_not_default') target.sub_fr_status = 'forced_default';

  target.issues = (target.issues || []).filter(
    iss => !['audio_secondary', 'forced_sub_not_default', 'sub_fr_not_default'].includes(iss)
  );

  recomputeAuditCounts();
}

async function load({ silent = false } = {}) {
  if (!silent && !items.value.length) {
    loading.value = true;
  }
  try {
    const data = await api('/api/vf-upgrades/dashboard');
    items.value = data.items || [];
    scan.value = data.scan || {};
  } catch (e) {
    show(e.message || String(e), 'error');
  } finally {
    loading.value = false;
  }
}

async function loadAudit({ silent = false } = {}) {
  if (!silent && !auditItems.value.length) {
    auditLoading.value = true;
  }
  try {
    const data = await api('/api/vf-upgrades/audit');
    auditItems.value = data.items || [];
    auditCounts.value = data.counts || {
      total: 0,
      audio_secondary: 0,
      missing_sub_fr: 0,
      sub_fr_not_default: 0,
      forced_sub_not_default: 0,
      vo_only: 0,
      partial_vf: 0,
    };
  } catch (e) {
    show(e.message || String(e), 'error');
  } finally {
    auditLoading.value = false;
  }
}

function openAlignModal(item) {
  modalItem.value = item;
  alignModalOpen.value = true;
}

function onStreamsAligned({ item, res }) {
  const userMsg = res?.users_count > 1 ? ` pour ${res.users_count} profils Plex` : '';
  const partsMsg = res?.parts_processed > 1 ? `${res.parts_processed} parties` : 'le média';
  show(`Pistes réalignées avec succès sur Plex sur ${partsMsg}${userMsg}.`);
  applyStreamsFixInPlace(item.id);
}

async function fixAllStreams() {
  const eligible = auditFilteredItems.value.filter(item => canFixStreams(item));
  if (!eligible.length) return;
  fixingAll.value = true;
  try {
    const itemIds = eligible.map(item => item.id);
    const res = await api('/api/vf-upgrades/audit/fix-streams-batch', {
      method: 'POST',
      body: JSON.stringify({ item_ids: itemIds }),
    });
    show(`${res.processed_items || 0} média(s) réaligné(s) sur Plex.`);
    itemIds.forEach(id => applyStreamsFixInPlace(id));
  } catch (e) {
    show(e.message || String(e), 'error');
  } finally {
    fixingAll.value = false;
  }
}

async function scanAll() {
  scanning.value = true;
  try {
    const result = await api('/api/vf-upgrades/scan-all', { method: 'POST' });
    show(
      result.queued
        ? 'Recherche ajoutée à la file de travail.'
        : `${result.scanned || 0} recherche(s), ${result.found || 0} suggestion(s) trouvée(s).`
    );
    await load({ silent: true });
  } catch (e) {
    show(e.message || String(e), 'error');
  } finally {
    scanning.value = false;
  }
}

function toggleGroupSelection(group) {
  const next = new Set(selectedKeys.value);
  if (next.has(group.key)) {
    next.delete(group.key);
  } else {
    next.add(group.key);
  }
  selectedKeys.value = next;
}

function clearSelection() {
  selectedKeys.value = new Set();
}

async function scanSelected() {
  const media = [...selectedKeys.value].map(key => {
    const [source_type, source_id] = key.split(':');
    return { source_type, source_id: Number(source_id) };
  });
  if (!media.length) return;
  scanning.value = true;
  try {
    const result = await api('/api/vf-upgrades/scan-selected', {
      method: 'POST',
      body: JSON.stringify({ media }),
    });
    show(`${result.scanned || 0} recherche(s), ${result.found || 0} suggestion(s) trouvée(s).`);
    clearSelection();
    await load({ silent: true });
  } catch (e) {
    show(e.message || String(e), 'error');
  } finally {
    scanning.value = false;
  }
}

function scanTriggered() {
  if (selectedKeys.value.size > 0) {
    return scanSelected();
  }
  return scanAll();
}

async function dismiss(item) {
  await api(`/api/vf-upgrades/${item.id}/dismiss`, { method: 'POST' });
  show('Suggestion ignorée.');
  items.value = items.value.filter(i => i.id !== item.id);
}

async function maintenance(action) {
  try {
    const result = await api('/api/vf-upgrades/maintenance', {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    show(
      action === 'purge'
        ? `${result.deleted} entrée(s) supprimée(s).`
        : `${result.updated} suggestion(s) réouverte(s).`
    );
    await load({ silent: true });
  } catch (e) {
    show(e.message || String(e), 'error');
  }
}

function mediaLink(group) {
  const type = group.source_type === 'request' ? 'request' : 'library';
  return `/library/media/${type}/${group.source_id}`;
}

function targetLabel(item) {
  if (item.scope === 'movie') return 'Film';
  if (item.scope === 'season') return 'Saison entière';
  if (item.scope === 'show') return 'Série complète';
  return `Épisode ${String(item.episode_number).padStart(2, '0')}`;
}

function statusLabel(value) {
  return statusOptions.find(entry => entry.value === value)?.label || value;
}

function audioStatusLabel(item) {
  if (!item.has_vf) return 'Absente (VO)';
  return item.fr_is_default ? 'Présente (par défaut)' : 'Piste secondaire';
}

function audioRowClass(item) {
  if (!item.has_vf) return 'is-muted';
  return item.fr_is_default ? 'is-ok' : 'is-warning';
}

function subtitleStatusLabel(status) {
  switch (status) {
    case 'ok': return 'Complets par défaut';
    case 'not_default': return 'Présents (inactifs)';
    case 'forced_default': return 'Présents (marqués forcés)';
    case 'forced_not_default': return 'Présents (forcés inactifs)';
    case 'absent': return 'Absents';
    case 'no_track': return 'Aucune piste (possiblement brûlés)';
    default: return 'Non analysé';
  }
}

function subtitleRowClass(item) {
  if (item.sub_fr_status === 'ok' || item.sub_fr_status === 'forced_default') return 'is-ok';
  if (item.sub_fr_status === 'not_default' || item.sub_fr_status === 'forced_not_default') return 'is-warning';
  if (item.sub_fr_status === 'absent') return 'is-danger';
  return 'is-muted';
}

function forcedStatusLabel(status) {
  switch (status) {
    case 'ok': return 'Activés par défaut';
    case 'not_default': return 'Présents mais inactifs';
    default: return 'Aucun';
  }
}

function forcedRowClass(item) {
  if (item.forced_fr_status === 'ok') return 'is-ok';
  if (item.forced_fr_status === 'not_default') return 'is-warning';
  return 'is-muted';
}

function formatDate(value) {
  return value
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
    : '—';
}

function seasonHasPending(season) {
  return season.items.some(item => PENDING_STATUSES.has(item.status));
}

function seasonStatusSummary(season) {
  const counts = new Map();
  for (const item of season.items) {
    counts.set(item.status, (counts.get(item.status) || 0) + 1);
  }
  return [...counts.entries()].map(([status, count]) => ({ status, count }));
}

// Branchement temps réel SSE ciblé par composant
useRealtime(['vf_upgrade.updated'], (_type, detail) => {
  const payload = detail?.payload || detail || {};

  // 1. Mise à jour chirurgicale in-place sur un média d'audit précis (aucun rechargement global)
  if (payload.type === 'streams_aligned' && payload.item_id) {
    applyStreamsFixInPlace(payload.item_id, payload);
    return;
  }

  if (payload.type === 'streams_aligned_batch' && Array.isArray(payload.item_ids)) {
    payload.item_ids.forEach(id => applyStreamsFixInPlace(id));
    return;
  }

  // 2. Si un cycle d'upgrade unitaire évolue
  if (payload.id && payload.status) {
    const targetUpgrade = items.value.find(u => u.id === payload.id);
    if (targetUpgrade) {
      targetUpgrade.status = payload.status;
      if (payload.arr_message) targetUpgrade.arr_message = payload.arr_message;
      return;
    }
  }

  // 3. Rechargement discret en arrière-plan uniquement si un scan complet est terminé
  if (payload.action === 'scan_completed') {
    load({ silent: true });
    if (activeTab.value === 'audit') {
      loadAudit({ silent: true });
    }
    if (activeTab.value === 'history') {
      loadScanRuns();
    }
  }
});

onMounted(() => {
  load();
  loadAudit();
});

onUnmounted(() => {
  stopLivePolling();
  stopItemsPolling();
});
</script>

<style scoped lang="scss">
.vf-upgrades-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.vf-feedback {
  margin-bottom: var(--space-3);
}

/* Maintenance sidebar */
.filter-maintenance-buttons {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-maintenance-buttons button {
  width: 100%;
  justify-content: flex-start;
}

/* Skeletons */
.vf-skeletons {
  display: grid;
  gap: var(--space-3);
}

.vf-skeleton-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.skeleton-poster {
  flex-shrink: 0;
  width: 90px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  background: linear-gradient(100deg, var(--surface-2) 20%, color-mix(in srgb, var(--surface-2) 55%, var(--border)) 40%, var(--surface-2) 60%);
  background-size: 220% 100%;
  animation: vf-shimmer 1.4s ease-in-out infinite;
}

.skeleton-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-line {
  display: block;
  border-radius: var(--radius-xs);
  background: linear-gradient(100deg, var(--surface-2) 20%, color-mix(in srgb, var(--surface-2) 55%, var(--border)) 40%, var(--surface-2) 60%);
  background-size: 220% 100%;
  animation: vf-shimmer 1.4s ease-in-out infinite;
}

.skeleton-line.title { height: 20px; width: 45%; }
.skeleton-line.sub { height: 14px; width: 25%; }
.skeleton-line.row { height: 44px; width: 100%; }

@keyframes vf-shimmer {
  to { background-position-x: -220%; }
}

/* Listes */
.audit-list,
.upgrade-list {
  display: grid;
  gap: var(--space-3);
}

/* Cartes Audit épurées à 3 zones */
.audit-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 14px 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  transition: border-color 0.15s ease;
}

.audit-card:hover {
  border-color: var(--border-hover, var(--border));
}

.audit-card-top {
  display: grid;
  grid-template-columns: 280px 1fr auto;
  align-items: center;
  gap: var(--space-4);
  width: 100%;
}

.audit-show-episodes-wrap {
  width: 100%;
  padding-top: var(--space-3);
  border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}

.audit-episodes-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  color: var(--muted);
  font-size: var(--fs-sm);
}

.audit-episode-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: var(--surface-2);
  border-radius: var(--radius-xs);
  border: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
}

.audit-episode-main {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  min-width: 0;
}

.audit-episode-title {
  font-size: var(--fs-xs);
  color: var(--text);
  white-space: nowrap;
}

.audit-episode-badges {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.audit-episode-actions {
  flex-shrink: 0;
}

.card-media-col {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.poster-wrap {
  flex-shrink: 0;
  width: 58px;
  aspect-ratio: 2 / 3;
}

.media-poster {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}

.media-poster.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  border: 1px dashed var(--border);
}

.media-identity {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.media-badges {
  display: flex;
  align-items: center;
  gap: 5px;
}

.badge-movie {
  border-color: rgba(59, 130, 246, 0.4);
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.1);
  font-size: 11px;
}

.badge-show {
  border-color: rgba(168, 85, 247, 0.4);
  color: #d8b4fe;
  background: rgba(168, 85, 247, 0.1);
  font-size: 11px;
}

.badge-year {
  color: var(--muted);
  font-size: 11px;
}

.media-title {
  font-size: var(--fs-base);
  font-weight: 700;
  color: var(--text);
  text-decoration: none;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.media-title:hover {
  color: var(--accent);
  text-decoration: underline;
}

/* Zone 2 : Matrice de diagnostic */
.card-diag-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 14px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}

.diag-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-xs);
}

.diag-label {
  color: var(--muted);
  font-weight: 550;
  min-width: 85px;
}

.diag-status {
  font-weight: 650;
  color: var(--text);
}

.diag-icon-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  margin: 0 4px;
}

.diag-row.is-ok {
  color: var(--green-text, #22c55e);
}

.diag-row.is-warning {
  color: #fde047;
}

.diag-row.is-danger {
  color: #fca5a5;
}

.diag-row.is-muted {
  color: var(--muted);
}

/* Zone 3 : Actions */
.card-action-col {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.card-action-col button.compact,
.card-action-col a.compact {
  min-height: 32px;
  padding: 0 12px;
  font-size: var(--fs-xs);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

/* Cartes Upgrades standard */
.upgrade-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  transition: border-color 0.15s ease, background-color 0.15s ease;
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
  background: color-mix(in srgb, var(--bg, #09090b) 70%, transparent);
  cursor: pointer;
}

.upgrade-select input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.upgrade-poster {
  width: 85px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  object-fit: cover;
  display: block;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
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
  gap: var(--space-3);
}

.media-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding-bottom: 10px;
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

.media-meta-count span {
  color: var(--muted);
  font-size: var(--fs-xs);
  white-space: nowrap;
}

.movie-targets,
.show-seasons-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.season-group {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-hover);
  overflow: hidden;
}

.season-group.has-pending {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 3%, var(--surface-hover));
}

.season-summary {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  list-style: none;
  font-size: var(--fs-sm);
}

.season-summary::-webkit-details-marker {
  display: none;
}

.season-summary::before {
  content: '▸';
  display: inline-block;
  color: var(--muted);
  transition: transform 0.15s ease;
}

.season-group[open] > .season-summary::before {
  transform: rotate(90deg);
  color: var(--accent);
}

.season-title {
  font-weight: 700;
  color: var(--text);
}

.season-group.has-pending .season-title {
  color: var(--accent);
}

.season-badge-count {
  color: var(--muted);
  font-size: var(--fs-xs);
}

.season-status-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-left: auto;
}

.season-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px 10px;
  border-top: 1px solid var(--border);
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
  border-left-color: #60a5fa;
}

.target-row.status-awaiting_verification {
  border-left-color: var(--accent);
}

.target-row.status-verified,
.target-row.status-grabbed {
  border-left-color: var(--green-text, #22c55e);
}

.target-row.status-failed {
  border-left-color: var(--red-text, #ef4444);
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

.target-footer {
  display: flex;
  justify-content: flex-end;
  color: var(--muted);
  font-size: var(--fs-xs);
}

.spin {
  animation: vf-spin 1s linear infinite;
}

@keyframes vf-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 900px) {
  .audit-card {
    grid-template-columns: 1fr;
    gap: var(--space-3);
  }
  .card-action-col {
    justify-content: flex-start;
  }
}

@media (max-width: 767.98px) {
  .audit-card { padding: 12px; }
  .audit-card-top { gap: var(--space-3); }
  .audit-episode-row { align-items: stretch; flex-direction: column; }
  .audit-episode-actions { width: 100%; }
  .audit-episode-actions :deep(button) { width: 100%; min-height: 44px; }
}

.backoff-info {
  color: var(--warning, #b45309);
}

.scan-history {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.scan-live-banner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 12px 16px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}

.scan-live-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
  animation: vf-pulse 1.4s ease-in-out infinite;
}

@keyframes vf-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.scan-live-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 220px;
}

.scan-live-text span {
  color: var(--muted);
  font-size: var(--fs-xs);
}

.scan-live-bar {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: var(--surface-alt, color-mix(in srgb, var(--border) 60%, transparent));
  overflow: hidden;
}

.scan-live-bar-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.4s ease;
}

.scan-runs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}

.scan-runs-table th,
.scan-runs-table td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.scan-runs-table th {
  color: var(--muted);
  font-weight: 600;
  font-size: var(--fs-xs);
  text-transform: uppercase;
}

.run-status-failed td {
  color: var(--danger, #b91c1c);
}

.run-error {
  margin-left: 6px;
  cursor: help;
}

.run-row {
  cursor: pointer;
}

.run-row:hover td,
.run-row:focus-visible td {
  background: var(--surface-2);
}

.run-chevron {
  margin-right: 4px;
  color: var(--muted);
  vertical-align: -2px;
}

.run-chevron.is-collapsed {
  opacity: 0.6;
}

.run-detail-row td {
  padding: var(--space-3) 12px;
  background: color-mix(in srgb, var(--surface) 92%, var(--accent) 8%);
}

.run-items-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 320px;
  overflow-y: auto;
}

.run-items-list li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm);
}

.run-item-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--muted);
}

.run-item-status-running .run-item-status-dot {
  background: var(--accent);
  animation: vf-pulse 1.4s ease-in-out infinite;
}

.run-item-status-found .run-item-status-dot {
  background: var(--green, #22c55e);
}

.run-item-status-error .run-item-status-dot {
  background: var(--red, #ef4444);
}

.run-item-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-item-badge {
  flex-shrink: 0;
  color: var(--muted);
  font-size: var(--fs-xs);
}

.run-item-status-running .run-item-badge {
  color: var(--accent);
}

@media (max-width: 767.98px) {
  .scan-runs-table {
    display: block;
    overflow-x: auto;
  }
}
</style>
