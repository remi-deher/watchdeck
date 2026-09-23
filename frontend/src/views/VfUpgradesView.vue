<template>
    <AppPage
      title="Améliorations VF & Flux"
      v-model:query="query"
      :placeholder="activeTab === 'upgrades' ? 'Filtrer par film, série ou release…' : 'Filtrer par film ou série…'"
      has-filters
      :active-count="activeFilterCount"
      :filters-open="filtersOpen"
      @toggle-filters="toggleFilters" page-class="vf-upgrades-page">

      <template #tools>
        <UiButton
          variant="ghost"
          title="Réglages des améliorations VF"
          aria-label="Réglages des améliorations VF"
          @click="settingsOpen = true"
        >
          <template #icon><Settings size="16" /></template>Réglages
        </UiButton>
        <template v-if="activeTab === 'upgrades'">
          <UiButton v-if="selectedKeys.size > 0" variant="primary" :loading="scanning" @click="scanSelected"><template #icon><ScanSearch size="16" /></template>{{ scanning ? 'Recherche en cours…' : `Rechercher la sélection (${selectedKeys.size})` }}</UiButton>
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

    <!-- Navigation par onglets -->
    <AppSubnav variant="tabs"
      :active="activeTab"
      :items="tabs"
      aria-label="Modes des améliorations VF"
      @update:active="selectTab"
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
        :ignored-count="ignoredCount"
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
        :ignored-count="ignoredCount"
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
            :class="{ active: statusFilter === 'ignored' }"
            type="button"
            @click="statusFilter = 'ignored'"
          >
            <span>Ignorées</span>
            <small v-if="ignoredCount">({{ ignoredCount }})</small>
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
            <p v-if="waitingTruncated > 0" class="waiting-truncated">
              {{ waitingTruncated }} autre(s) média(s) VO ne sont pas affichés ici : la liste est bornée
              pour rester rapide. Ils restent pris en charge par les cycles de recherche automatiques.
            </p>
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
                    <button
                      v-if="groupIsIgnored(group)"
                      class="secondary compact"
                      type="button"
                      title="Réactiver le scan pour ce média"
                      @click="ignoreSeries(group, false)"
                    >
                      <Eye size="14" /> Réactiver
                    </button>
                    <button
                      v-else
                      class="secondary danger compact"
                      type="button"
                      :title="group.media?.media_type === 'movie' ? 'Ignorer ce film : ne sera plus proposé par le scan de fond' : 'Ignorer cette série : ne sera plus proposée par le scan de fond'"
                      @click="ignoreSeries(group, true)"
                    >
                      <EyeOff size="14" /> Ignorer
                    </button>
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
          </section>
        </template>

        <!-- Onglet 3 : Historique des cycles de scan -->
        <template v-else-if="activeTab === 'history'">
          <VfScanHistory
            :live-scan="liveScan"
            :runs="scanRuns"
            :loading="scanRunsLoading"
            :expanded-run-id="expandedRunId"
            :items="runItems"
            :items-loading="runItemsLoading"
            :format-date="formatDate"
            :format-duration="formatDuration"
            :status-label="runStatusLabel"
            @toggle="toggleRunDetail"
          />
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

    <VfSettingsModal
      v-if="settingsOpen"
      :open="settingsOpen"
      @close="settingsOpen = false"
      @saved="onSettingsSaved"
    />
  </AppPage>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Film,
  MessageSquare,
  MessageSquareOff,
  RotateCcw,
  ScanSearch,
  Settings,
  SlidersHorizontal,
  Trash2,
  Tv,
  Volume2,
  VolumeX,
} from '@lucide/vue';
import { useRealtime } from '@/events';
import AppSubnav from '@/components/ui/AppSubnav.vue';
import FilterSidebar from '@/components/ui/FilterSidebar.vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiButton from '@/components/ui/UiButton.vue';
import VfUpgradeButton from '@/components/media/VfUpgradeButton.vue';
import AlignStreamsModal from '@/components/media/AlignStreamsModal.vue';
import SeasonEpisodeList from '@/components/media/SeasonEpisodeList.vue';
import VfSettingsModal from '@/components/vf-upgrades/VfSettingsModal.vue';
import VfUpgradeKpiBanner from '@/components/vf-upgrades/VfUpgradeKpiBanner.vue';
import VfUpgradeQuickFilters from '@/components/vf-upgrades/VfUpgradeQuickFilters.vue';
import VfScanHistory from '@/components/vf-upgrades/VfScanHistory.vue';
import { filterVfUpgradeItems, groupVfUpgradeItems } from '@/utils/vfUpgradeGroups';
import { useFiltersDrawer } from '@/composables/useFiltersDrawer';
import { useFeedback } from '@/composables/useFeedback';
import { useToast } from '@/composables/useToast';
import { formatDateTimeShort } from '@/utils/format';
import {
  audioRowClass, audioStatusLabel, canFixStreams, forcedRowClass, forcedStatusLabel, formatBackoff,
  formatRunDuration as formatDuration, runStatusLabel, statusLabel, subtitleRowClass, subtitleStatusLabel, targetLabel,
} from '@/utils/vfUpgradeLabels';
import { useAuditShowDetails } from '@/composables/vf/useAuditShowDetails';
import { useVfAudit } from '@/composables/vf/useVfAudit';
import { useVfScanHistory } from '@/composables/vf/useVfScanHistory';
import { useVfSelection } from '@/composables/vf/useVfSelection';
import { useVfUpgrades } from '@/composables/vf/useVfUpgrades';
import { useRoute } from 'vue-router';

const activeTab = ref('upgrades'); // 'upgrades' (*arr) | 'audit' (PASTA) | 'history'
const settingsOpen = ref(false);
const { message: feedback, type: feedbackType, show, clear: clearFeedback } = useFeedback();
const { undoable } = useToast();

/* Un lien peut arriver deja filtre : « 1 échec(s) » sur la page Configuration renvoie
   ici avec `?status=failed`. Sans cette lecture, le lien menait a la liste complete et
   laissait l'administrateur retrouver l'echec a la main. */
// `useRoute()` ne renvoie rien quand la vue est montee hors routeur (tests unitaires) :
// le filtre retombe alors sur sa valeur par defaut.
const route = useRoute();
const VALID_STATUS_FILTERS = ['pending', 'waiting_release', 'in_progress', 'failed', 'history', 'ignored', 'all'];
const initialStatus = String(route?.query?.status || '');
const statusFilter = ref(VALID_STATUS_FILTERS.includes(initialStatus) ? initialStatus : 'pending');
const mediaTypeFilter = ref('');
const query = ref('');
const auditIssueFilter = ref('');
const auditMediaTypeFilter = ref('');

// Onglet « Releases & Telechargements » : suggestions, selection et scan groupe.
const upgrades = useVfUpgrades(show, undoable);
const {
  items, loading, waitingTruncated,
  pendingCount, waitingReleaseCount, inProgressCount, failedCount, historyCount, ignoredCount,
  load, dismiss, maintenance,
} = upgrades;
const selection = useVfSelection(show, () => load({ silent: true }));
const { selectedKeys, scanning, scanSelected, clear: clearSelection } = selection;
const toggleGroupSelection = (group) => selection.toggle(group.key);
const ignoreSeries = (group, ignored) => upgrades.ignoreMedia(group, ignored);

// Onglet « Alignement des pistes » : audit Plex et detail des series.
const audit = useVfAudit(show);
const {
  items: auditItems, counts: auditCounts, loading: auditLoading, fixingAll,
  totalCount: auditTotalCount, eligibleFixCount: eligibleAuditFixCount, load: loadAudit,
} = audit;
const showDetails = useAuditShowDetails();
const {
  isExpanded: isAuditShowExpanded, isLoading: getAuditShowLoading, hasError: getAuditShowError,
  seasonsOf: getAuditShowSeasons, loadSeason: loadAuditShowSeason,
} = showDetails;
const toggleAuditShow = (item) => showDetails.toggle(item.id);

// Onglet « Historique des scans ».
const history = useVfScanHistory(show);
const {
  runs: scanRuns, loading: scanRunsLoading, liveScan, expandedRunId, runItems, runItemsLoading,
  loadRuns: loadScanRuns, toggleRun: toggleRunDetail,
} = history;

// Modale d'alignement unitaire
const alignModalOpen = ref(false);
const modalItem = ref(null);
const fixingItemId = ref(null);

const tabs = computed(() => [
  { key: 'audit', label: 'Alignement des pistes (Plex)', count: eligibleAuditFixCount.value || auditTotalCount.value },
  { key: 'upgrades', label: 'Releases & Téléchargements (*arr)', count: pendingCount.value || waitingReleaseCount.value },
  { key: 'history', label: 'Historique des scans' },
]);

function selectTab(value) {
  activeTab.value = value;
  if (value !== 'upgrades') clearSelection();
  if (value === 'audit' && !auditItems.value.length) loadAudit();
  if (value === 'history') history.activate();
  else history.deactivate();
}

/* Un réglage modifié depuis la modale change ce que les cycles retiennent (seuil de
   confiance, garde-fous techniques, portées) : on recharge la liste pour qu'elle
   reflète la nouvelle configuration plutôt que l'ancienne. */
async function onSettingsSaved() {
  settingsOpen.value = false;
  await load({ silent: true });
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

// « Tout aligner » ne touche que les medias affiches, filtres compris.
const fixAllStreams = () => audit.fixAll(auditFilteredItems.value);

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
function groupIsIgnored(group) {
  return group.items.some(i => i.is_ignored);
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
  if (activeTab.value === 'audit') auditMediaTypeFilter.value = type;
  else mediaTypeFilter.value = type;
}

function openAlignModal(item) {
  modalItem.value = item;
  alignModalOpen.value = true;
}
function onStreamsAligned({ item, res }) {
  const userMsg = res?.users_count > 1 ? ` pour ${res.users_count} profils Plex` : '';
  const partsMsg = res?.parts_processed > 1 ? `${res.parts_processed} parties` : 'le média';
  show(`Pistes réalignées avec succès sur Plex sur ${partsMsg}${userMsg}.`);
  audit.applyStreamsFixInPlace(item.id);
}

function mediaLink(group) {
  const type = group.source_type === 'request' ? 'request' : 'library';
  return `/library/media/${type}/${group.source_id}`;
}
function formatDate(value) {
  return formatDateTimeShort(value, '—');
}
function seasonStatusSummary(season) {
  const counts = new Map();
  for (const item of season.items) counts.set(item.status, (counts.get(item.status) || 0) + 1);
  return [...counts.entries()].map(([status, count]) => ({ status, count }));
}

// Branchement temps réel SSE ciblé par composant
useRealtime(['vf_upgrade.updated'], (_type, detail) => {
  const payload = detail?.payload || detail || {};

  // 1. Mise à jour chirurgicale in-place sur un média d'audit précis (aucun rechargement global)
  if (payload.type === 'streams_aligned' && payload.item_id) {
    audit.applyStreamsFixInPlace(payload.item_id, payload);
    return;
  }
  if (payload.type === 'streams_aligned_batch' && Array.isArray(payload.item_ids)) {
    payload.item_ids.forEach(id => audit.applyStreamsFixInPlace(id));
    return;
  }

  // 2. Si un cycle d'upgrade unitaire évolue
  if (payload.id && payload.status && upgrades.patchStatus(payload.id, payload.status, payload.arr_message)) return;

  // 3. Rechargement discret en arrière-plan uniquement si un scan complet est terminé
  if (payload.action === 'scan_completed') {
    load({ silent: true });
    if (activeTab.value === 'audit') loadAudit({ silent: true });
    if (activeTab.value === 'history') loadScanRuns();
  }
});

onMounted(() => {
  load();
  loadAudit();
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
.audit-list {
  display: grid;
  gap: var(--space-3);
}

.upgrade-list {
  display: grid;
  gap: var(--space-4);
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
  font-size: var(--fs-xs);
}

.badge-show {
  border-color: rgba(168, 85, 247, 0.4);
  color: #d8b4fe;
  background: rgba(168, 85, 247, 0.1);
  font-size: var(--fs-xs);
}

.badge-year {
  color: var(--muted);
  font-size: var(--fs-xs);
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
  gap: var(--space-5);
  padding: 20px 22px;
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

/* Les variantes compactes descendent a 30-32px : acceptable a la souris, sous le
   minimum tactile d'iOS et de Material des qu'il n'y a plus de curseur. « Ignorer »
   etait a 58x32 et se repetait 55 fois sur la page. */
@media (pointer: coarse) {
  .card-action-col button.compact,
  .card-action-col a.compact,
  .target-actions button.compact {
    min-height: var(--touch-target);
    padding-inline: 14px;
  }
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

.waiting-truncated {
  margin: 0 0 var(--space-3);
  font-size: 0.85rem;
  color: var(--text-muted);
}

</style>
