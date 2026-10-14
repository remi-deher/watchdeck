<template>
    <!-- Activité : cinq vues, qui sont les sections de l'entrée du menu, chacune sur le gabarit
         de son besoin. Vue d'ensemble, qualité et utilisateurs : Analyser (la période, comparée
         à la précédente, cadre toute la page). En direct : Suivre. Historique : Comprendre
         (période et mode de lecture, une ligne par reprise, la fiche de la lecture en feuille).
         La recherche et les filtres passent par la barre du haut. -->
    <PageTemplate
      :title="viewTitle"
      class="activity-page"
      v-model:query="historySearch"
      :search="{ placeholder: searchPlaceholder, scope: 'Activité', kind: 'filter' }"
      :match-count="filterCounts.matched"
      :total-count="filterCounts.total"
      :filter-count="currentView === 'history' ? historyFilterCount : 0"
      :sections="sections"
      :active-section="currentView"
      :state="pageState"
      :error="error"
      skeleton="cards"
      loading-message="Chargement de l'activité Plex…"
      @retry="load"
      @reset-filters="resetActivityFilters"
    >

    <template v-if="currentView === 'history'" #filters>
        <FilterGroup label="Ordre">
          <UiChipGroup label="Ordre de l’historique" :options="[{ value: 'date_desc', label: 'Plus récentes d’abord' }, { value: 'date_asc', label: 'Plus anciennes d’abord' }]" v-model="historySort" />
        </FilterGroup>
        <FilterGroup label="Type de média">
          <UiChipGroup label="Type de média" :options="[{ value: '', label: 'Tous les types' }, { value: 'movie', label: 'Films' }, { value: 'episode', label: 'Séries' }, { value: 'track', label: 'Musique' }]" v-model="typeFilter" />
        </FilterGroup>
        <FilterGroup label="Utilisateur">
          <UiCombobox label="Utilisateur" placeholder="Tous les utilisateurs" :options="historyUsers.map((user: string) => ({ value: user, label: user }))" v-model="userFilter" />
        </FilterGroup>
        <FilterGroup label="Appareil">
          <UiCombobox label="Appareil" placeholder="Tous les appareils" :options="historyDevices.map((device: string) => ({ value: device, label: device }))" v-model="deviceFilter" />
        </FilterGroup>
        <FilterGroup v-if="historyServers.length > 1" label="Serveur">
          <UiChipGroup label="Serveur Plex" :options="[{ value: '', label: 'Tous les serveurs' }, ...historyServers.map((server: any) => ({ value: String(server.id), label: server.name }))]" v-model="serverFilter" />
        </FilterGroup>
    </template>

    <template v-if="loaded">
      <AnalyzeTemplate
        v-if="currentView === 'overview' || currentView === 'quality' || currentView === 'users'"
        :period="String(days)"
        :periods="periodChoices"
        :comparable="comparable"
        :kpis="analyzeKpis"
        :loading="loading"
        @update:period="setPeriod(Number($event))"
      >
        <template #blocks>
          <template v-if="currentView === 'overview'">
            <!-- La recherche y designe un utilisateur, pas un texte. Le filtre part au serveur
                 (`?user=`), qui recalcule tout sur ce seul spectateur -- engagement, marathons
                 et simultanéité compris. Rien n'est masqué ici, parce que plus rien n'est
                 global. -->
            <UiEmptyState v-if="needle && !matchedUser" class="activity-wide" title="Aucun utilisateur" :message="`Aucun utilisateur ne correspond à « ${historySearch.trim()} » sur cette période.`" compact />
            <template v-else>
              <section v-if="scopedUser" class="scope-note activity-wide">
                <span><UsersIcon aria-hidden="true" /> Toute la page est limitée à <strong>{{ scopedUser }}</strong> sur cette période.</span>
                <UiButton @click="historySearch=''">Revenir à tout le monde</UiButton>
              </section>

              <LiveSessionsPanel class="activity-wide" :sessions="liveSessions" :collection-enabled="data.liveEnabled" interactive @select="openSession($event)"/>
              <DailyActivityChart class="activity-wide" :points="chart"/>
              <ConcurrencyPanel :daily="analytics.concurrency?.daily" :peak="analytics.concurrency?.peak" :peak-at="analytics.concurrency?.peak_at"/>
              <CompletionPanel :items="analytics.completion"/>
              <BreakdownPanel title="Types de lecture" eyebrow="Qualité" :items="methodBreakdown"/>
              <PopularMediaPanel :items="analytics.popular" title="Médias les plus regardés" eyebrow="Durée cumulée"/>
              <PopularMediaPanel :items="analytics.popular_by_audience" title="Médias les plus populaires" eyebrow="Audience distincte"/>
              <UserRankingPanel class="activity-wide" :users="data.users" :format-duration="formatDuration"/>
              <ActivityHeatmap class="activity-wide" :points="analytics.heatmap"/>

              <section class="panel binge-panel activity-wide">
                <div class="panel-head"><div><span class="eyebrow">Habitudes</span><h2>Marathons détectés</h2></div><small>3 épisodes ou plus</small></div>
                <div class="binge-list">
                  <article v-for="item in analytics.binges||[]" :key="`${item.user_name}:${item.started_at}`"><Tv/><span><strong>{{ item.title }}</strong><small>{{ item.user_name }} · {{ formatDate(item.started_at) }}</small></span><em>{{ item.episodes }} épisodes<strong>{{ formatDuration(item.watch_ms) }}</strong></em></article>
                  <p v-if="!analytics.binges?.length" class="empty">Aucun marathon détecté sur cette période.</p>
                </div>
              </section>
            </template>
          </template>

          <template v-else-if="currentView === 'quality'">
            <!-- Plex ne renseigne ni la décision de lecture ni le débit sur toutes les
                 sessions. Sans ce rappel, « 78 % Inconnu » se lisait comme une mesure de la
                 qualité alors que c'est une mesure de ce qu'on ne sait pas. -->
            <section v-if="qualityCoverage.sessions" class="coverage-note activity-wide">
              <span><Info aria-hidden="true" /> Mode de lecture connu sur <strong>{{ qualityCoverage.method_known }}</strong> des {{ qualityCoverage.sessions }} lectures de la période ({{ methodCoverageRate }} %) · débit mesuré sur <strong>{{ bandwidthMeasured }}</strong>.</span>
            </section>
            <BreakdownPanel title="Résolutions" eyebrow="Source" :items="resolutionBreakdown"/>
            <BreakdownPanel title="Codecs vidéo" eyebrow="Source" :items="codecBreakdown"/>
            <BreakdownPanel title="Causes de transcodage" eyebrow="Diagnostic" :items="transcodeReasonBreakdown"/>
            <BreakdownPanel title="Causes de conversion légère" eyebrow="Diagnostic" :items="directStreamReasonBreakdown"/>
            <BreakdownPanel title="Conteneurs" eyebrow="Source" :items="containerBreakdown"/>
            <BreakdownPanel title="Bande passante par utilisateur" eyebrow="Réseau" :items="bandwidthBreakdown"/>
            <section class="panel compatibility-panel activity-wide">
              <div class="panel-head"><div><span class="eyebrow">Compatibilité</span><h2>Appareils et lecteurs</h2></div></div>
              <div class="compatibility-table">
                <article v-for="device in analytics.quality?.devices||[]" :key="device.device">
                  <MonitorPlay/><span><strong>{{ device.device }}</strong><small>{{ device.sessions }} sessions · {{ device.transcodes }} transcodages<template v-if="device.direct_streams"> · {{ device.direct_streams }} conversion{{ device.direct_streams>1?'s':'' }} légère{{ device.direct_streams>1?'s':'' }}</template></small></span>
                  <div><i :style="{width:`${device.compatibility_score}%`}"></i></div><em>{{ device.compatibility_score }} %</em>
                </article>
                <p v-if="!analytics.quality?.devices?.length" class="empty">Aucune donnée d'appareil.</p>
              </div>
            </section>
            <section class="panel activity-wide">
              <div class="panel-head"><div><span class="eyebrow">Diagnostic</span><h2>Derniers modes de lecture</h2></div></div>
              <div class="quality-list">
                <button v-for="item in qualityHistory" :key="sessionKey(item)" @click="openSession(item)">
                  <MediaArtwork :src="item.thumb_url" :alt="displayTitle(item)" :type="item.media_type" size="small"/>
                  <span><strong>{{ displayTitle(item) }}</strong><small>{{ item.player||item.platform||'Plex' }} · {{ item.quality||'Auto' }}</small></span>
                  <PlaybackMethodBadge :playback="item"/>
                </button>
                <p v-if="!qualityHistory.length" class="empty">Aucune donnée de qualité sur cette période.</p>
              </div>
            </section>
          </template>

          <template v-else>
            <!-- Chaque carte ouvre la Vue d'ensemble restreinte à cette personne : c'est le
                 seul écran qui les liste toutes, il sert donc d'annuaire vers le périmètre. -->
            <div v-balanced-grid="{ min: 340 }" class="user-cards activity-wide">
              <article v-for="(user,index) in filteredAnalyticsUsers" :key="user.name" class="panel user-card">
                <button type="button" class="user-card-open" :aria-label="`Voir l’activité de ${user.name}`" @click="openUserScope(user.name)"></button>
                <UiAvatar class="user-avatar" :person="user" size="lg" tone="accent" />
                <div><h3>{{ user.name }}</h3><p>{{ user.sessions }} session{{ user.sessions>1?'s':'' }} sur {{ periodLabel }}</p></div>
                <strong>{{ formatDuration(user.watch_ms) }}</strong>
                <div class="user-share"><i :style="{width:`${userShare(user.sessions)}%`}"></i></div>
                <small>#{{ index+1 }} · {{ userShare(user.sessions) }} % des lectures · <b :class="{down:user.watch_change<0}">{{ signedPercent(user.watch_change) }}</b></small>
                <dl><div><dt>Média favori</dt><dd>{{ user.favorite_title||'—' }}</dd></div><div><dt>Appareil habituel</dt><dd>{{ user.favorite_device||'—' }}</dd></div><div><dt>Dernière activité</dt><dd>{{ formatDate(user.last_seen_at) }}</dd></div></dl>
                <span class="user-card-cue"><ArrowRight aria-hidden="true" />Voir son activité</span>
              </article>
              <p v-if="!filteredAnalyticsUsers.length" class="panel empty">Aucun utilisateur actif sur cette période.</p>
            </div>
          </template>
        </template>
      </AnalyzeTemplate>

      <TrackTemplate
        v-else-if="currentView === 'live'"
        :items="[]"
        :recent="liveRecent"
        :updated="`Actualisé ${relativeUpdate}`"
        :history-to="{ path: '/activity', query: { view: 'history' } }"
        :labels="{ items: 'lectures', empty: data.liveEnabled ? 'Aucune lecture en cours' : 'Collecte en direct désactivée', emptyDetail: data.liveEnabled ? 'Les lectures Plex s’afficheront ici dès qu’elles démarrent.' : 'Aucune lecture Plex ne peut apparaître tant que ce réglage est désactivé.', history: 'Historique des lectures' }"
      >
        <!-- Les lectures : le même bandeau que sur l'Accueil. -->
        <template #live>
          <DashboardLiveStrip :sessions="liveSessions" :collection-enabled="data.liveEnabled !== false" :show-link="false" @select="openSession($event)" />
        </template>
        <template #after><PlexServerTasks v-if="data.liveEnabled"/></template>
      </TrackTemplate>

      <UnderstandTemplate
        v-else
        :events="historyEvents"
        :period="String(days)"
        :periods="periodChoices"
        :outcomes="METHOD_CHOICES"
        :outcome="methodFilter"
        :summary="historySummary"
        :has-more="history.hasMore"
        :loading="historyQuery.isFetching.value && !historyEvents.length"
        :loading-more="historyLoadingMore"
        empty-title="Aucune lecture"
        empty-message="Aucune lecture ne correspond à la période et aux filtres choisis."
        @update:period="setPeriod(Number($event))"
        @update:outcome="methodFilter = $event"
        @open="openHistoryEvent"
        @export="exportHistory"
        @load-more="loadHistory(true)"
      >
        <template #after><UiFeedback v-if="historyError" type="error" :message="historyError" retry @retry="loadHistory()" /></template>
      </UnderstandTemplate>
    </template>

  </PageTemplate>
</template>

<script setup lang="ts">
import { Info, MonitorPlay, Tv, Users as UsersIcon, ArrowRight } from '@lucide/vue';
import AnalyzeTemplate from '@/components/templates/AnalyzeTemplate.vue';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import TrackTemplate from '@/components/templates/TrackTemplate.vue';
import UnderstandTemplate from '@/components/templates/UnderstandTemplate.vue';
import UiAvatar from '@/components/ui/UiAvatar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import UiCombobox from '@/components/ui/UiCombobox.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import ActivityHeatmap from '@/components/activity/ActivityHeatmap.vue';
import BreakdownPanel from '@/components/activity/BreakdownPanel.vue';
import CompletionPanel from '@/components/activity/CompletionPanel.vue';
import ConcurrencyPanel from '@/components/activity/ConcurrencyPanel.vue';
import DailyActivityChart from '@/components/activity/DailyActivityChart.vue';
import DashboardLiveStrip from '@/components/dashboard/DashboardLiveStrip.vue';
import LiveSessionsPanel from '@/components/activity/LiveSessionsPanel.vue';
import MediaArtwork from '@/components/activity/MediaArtwork.vue';
import PlaybackMethodBadge from '@/components/activity/PlaybackMethodBadge.vue';
import PlexServerTasks from '@/components/activity/PlexServerTasks.vue';
import PopularMediaPanel from '@/components/activity/PopularMediaPanel.vue';
import UserRankingPanel from '@/components/activity/UserRankingPanel.vue';
import { useActivity } from '@/composables/useActivity';
import { formatDuration, signedPercent } from '@/utils/format';

const {
  METHOD_CHOICES,
  historySort,
  methodFilter,
  typeFilter,
  userFilter,
  deviceFilter,
  serverFilter,
  analytics,
  analyzeKpis,
  bandwidthBreakdown,
  bandwidthMeasured,
  chart,
  codecBreakdown,
  comparable,
  containerBreakdown,
  currentView,
  data,
  days,
  directStreamReasonBreakdown,
  displayTitle,
  error,
  exportHistory,
  filterCounts,
  filteredAnalyticsUsers,
  formatDate,
  history,
  historyDevices,
  historyError,
  historyEvents,
  historyFilterCount,
  historyLoadingMore,
  historyQuery,
  historySearch,
  historyServers,
  historySummary,
  historyUsers,
  liveRecent,
  liveSessions,
  load,
  loadHistory,
  loaded,
  loading,
  matchedUser,
  methodBreakdown,
  methodCoverageRate,
  needle,
  openHistoryEvent,
  openSession,
  openUserScope,
  pageState,
  periodChoices,
  periodLabel,
  qualityCoverage,
  qualityHistory,
  relativeUpdate,
  resetActivityFilters,
  resolutionBreakdown,
  scopedUser,
  searchPlaceholder,
  sections,
  sessionKey,
  setPeriod,
  transcodeReasonBreakdown,
  userShare,
  viewTitle,
} = useActivity();
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
/* Un bloc d'analyse qui prend toute la rangee (la grille des blocs est en colonnes auto). */
.activity-wide{grid-column:1/-1}
.coverage-note{display:flex;align-items:center;gap:var(--space-2);margin:0 0 14px;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-2);color:var(--muted);font-size:var(--fs-xs)}.coverage-note svg{flex:none;width:15px}.coverage-note strong{color:var(--text)}.user-card{position:relative}.user-card-open{position:absolute;inset:0;z-index:1;border:0;border-radius:inherit;background:transparent;cursor:pointer}.user-card-open:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.user-card>*:not(.user-card-open){position:relative;z-index:2;pointer-events:none}.user-card-cue{display:inline-flex;align-items:center;gap:6px;grid-column:1/-1;margin-top:2px;color:var(--muted);font-size:var(--fs-xs);font-weight:600}.user-card-cue svg{width:14px}.user-card:hover .user-card-cue{color:var(--accent)}.scope-note{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);flex-wrap:wrap;margin:0 0 4px;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-2);color:var(--muted);font-size:var(--fs-xs)}.scope-note span{display:inline-flex;align-items:center;gap:var(--space-2)}.scope-note svg{width:15px}.scope-note strong{color:var(--text)}.activity-page :deep(.heatmap-panel),.activity-page :deep(.popular-panel){margin-top:14px}.compatibility-panel{margin-bottom:14px}.compatibility-table{display:grid;margin-top:10px}.compatibility-table article{display:grid;grid-template-columns:28px minmax(150px,1fr) minmax(100px,1fr) 50px;gap: var(--space-3);align-items:center;padding:10px 4px;border-bottom:1px solid var(--border)}.compatibility-table article>svg{width:18px;color:var(--muted)}.compatibility-table article>span{display:grid;min-width:0}.compatibility-table article small{color:var(--muted);font-size:var(--fs-xs)}.compatibility-table article>div{height:6px;overflow:hidden;border-radius:var(--radius-pill);background:rgb(var(--ink) / .07)}.compatibility-table article>div i{display:block;height:100%;background:var(--green-text)}.compatibility-table em{color:var(--green-text);font-size:var(--fs-xs);font-style:normal;text-align:right}.quality-list{display:grid;margin-top:10px}.quality-list button{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap: var(--space-3);align-items:center;width:100%;padding:9px;border:0;border-bottom:1px solid var(--border);background:transparent;color:var(--text);text-align:left}.quality-list button:hover{background:rgb(var(--ink) / .025)}.quality-list button>span{display:grid;min-width:0}.quality-list strong,.quality-list small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.quality-list small{color:var(--muted);font-size:var(--fs-xs)}.binge-panel{margin-top:14px}.binge-panel .panel-head>small{color:var(--muted);font-size:var(--fs-xs)}.binge-list{display:grid;margin-top:10px}.binge-list article{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap: var(--space-3);align-items:center;padding:10px 2px;border-bottom:1px solid var(--border)}.binge-list article>svg{width:19px;color:var(--muted)}.binge-list article>span,.binge-list article>em{display:grid}.binge-list small,.binge-list em{color:var(--muted);font-size:var(--fs-xs);font-style:normal}.binge-list em{justify-items:end}.binge-list em>strong{color:var(--text)}.user-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap: var(--space-3)}.user-card{display:grid;grid-template-columns:46px minmax(0,1fr) auto;gap: var(--space-3);align-items:center}.user-avatar{grid-row:1/3}.user-card h3,.user-card p{margin:0}.user-card p,.user-card small{color:var(--muted);font-size:var(--fs-xs)}.user-card>strong{color:var(--text)}.user-share{grid-column:2/4;height:5px;overflow:hidden;border-radius:var(--radius-pill);background:rgb(var(--ink) / .08)}.user-share i{display:block;height:100%;border-radius:inherit;background:var(--accent)}.user-card>small{grid-column:2/4}.user-card>small b{color:var(--green-text)}.user-card>small b.down{color:var(--red-text)}.user-card dl{display:grid;grid-column:1/-1;grid-template-columns:repeat(3,1fr);gap: var(--space-2);margin:5px 0 0}.user-card dl>div{display:grid;gap: var(--space-1);padding:8px;border-radius:var(--radius-sm);background:var(--surface-2)}.user-card dt{color:var(--muted);font-size:var(--fs-xs);}.user-card dd{overflow:hidden;margin:0;font-size:var(--fs-xs);text-overflow:ellipsis;white-space:nowrap}@container page (max-width: 957px) {.user-cards{grid-template-columns:1fr}}@include bp.until(tablet) {.compatibility-table article{grid-template-columns:28px minmax(0,1fr) 44px}.compatibility-table article>div{grid-column:2}.compatibility-table em{grid-column:3;grid-row:2}}@container page (max-width: 504px) {.quality-list button{grid-template-columns:42px minmax(0,1fr)}.quality-list :deep(.playback-badge){grid-column:2}.user-card dl{grid-template-columns:1fr}}
@include bp.until(tablet) {.quality-list button {min-height:44px}.user-cards{grid-template-columns:1fr}}
</style>
