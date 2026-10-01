<template>
    <AppPage
      :title="viewTitle"
      v-model:query="historySearch"
      search-scope="Activité"
      :placeholder="searchPlaceholder"
      search-kind="filter"
      :match-count="filterCounts.matched"
      :total-count="filterCounts.total"
      :has-filters="currentView === 'history'"
      :active-count="historyFilterCount"
      :filters-open="filtersOpen"
      :sections="sections"
      :active-section="currentView"
      @toggle-filters="filtersOpen = !filtersOpen" page-class="activity-page">

    <!-- La periode n'est pas un filtre : c'est le cadre de lecture de toute la page, et
         l'enfermer derriere le bouton « Filtres » donnait un tiroir a une seule entree,
         invisible depuis les chiffres qu'elle commande. Elle partage donc la rangee
         collante des sections, ou elle ne coute aucune hauteur tant qu'il reste de la
         place. La vue « En direct » n'a pas de periode : elle montre l'instant. -->
    <template v-if="currentView !== 'live'" #tools>
      <UiSegmentedControl :model-value="days" :options="periodOptions" :ariaLabel="'Période d’analyse'" @update:model-value="setPeriod" />
    </template>

    <UiFeedback v-if="loading && !loaded" type="loading" message="Chargement de l'activité Plex…" />
    <UiFeedback v-if="error" type="error" :message="error" retry @retry="load" />

    <div class="psh-layout">
      <FilterSidebar v-if="currentView === 'history'" :open="filtersOpen" :active-count="historyFilterCount" @close="filtersOpen=false" @reset="resetActivityFilters">
        <FilterGroup label="Lecture">
          <UiChipGroup label="Mode de lecture" :options="[{ value: '', label: 'Tous les modes' }, { value: 'direct_play', label: 'Lecture directe' }, { value: 'direct_stream', label: 'Conversion légère' }, { value: 'transcode', label: 'Transcodage' }]" v-model="methodFilter" />
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
      </FilterSidebar>
      <div class="psh-main">
    <template v-if="loaded">
      <template v-if="currentView==='overview'">
        <!-- Vue d’ensemble et Statistiques etaient deux pages dont la premiere etait le
             sous-ensemble strict de la seconde : meme courbe, meme heatmap, memes medias,
             meme classement. Une seule page desormais, ordonnee de l’instant present vers
             l’analyse de fond.
             La recherche y designe un utilisateur, pas un texte. Le filtre part au serveur
             (`?user=`), qui recalcule tout sur ce seul spectateur -- engagement, marathons
             et simultaneite compris. Rien n’est masque ici, parce que plus rien n’est
             global. -->
        <UiEmptyState v-if="needle && !matchedUser" title="Aucun utilisateur" :message="`Aucun utilisateur ne correspond à « ${historySearch.trim()} » sur cette période.`" compact />
        <template v-else>
          <section v-if="scopedUser" class="scope-note">
            <span><UsersIcon aria-hidden="true" /> Toute la page est limitée à <strong>{{ scopedUser }}</strong> sur cette période.</span>
            <UiButton @click="historySearch=''">Revenir à tout le monde</UiButton>
          </section>

          <MetricGrid grid-class="activity-metrics overview-metrics">
            <MetricCard card-class="activity-metric-card overview-metric-card accent" label="En direct" :value="liveSessions.length" detail="lectures maintenant" :icon="Radio"/>
            <MetricCard
              card-class="activity-metric-card overview-metric-card"
              label="Sessions"
              :value="summary.sessions||0"
              :detail="`sur ${periodLabel}`"
              :trend="trendOf(analytics.comparison?.sessions_change)"
              :icon="PlayCircle"
            />
            <MetricCard
              card-class="activity-metric-card overview-metric-card"
              label="Temps regardé"
              :value="formatDuration(summary.watch_ms)"
              detail="durée cumulée"
              :trend="trendOf(analytics.comparison?.watch_change)"
              :icon="Clock3"
            />
            <MetricCard card-class="activity-metric-card overview-metric-card" label="Transcodage" :value="`${summary.transcode_rate||0} %`" :detail="transcodeDetail" :icon="Cpu" :progress="{ value: summary.transcode_rate || 0, max: 100 }"/>
          </MetricGrid>

          <LiveSessionsPanel :sessions="liveSessions" :collection-enabled="data.liveEnabled" interactive @select="openSession($event)"/>

          <div class="activity-grid">
            <DailyActivityChart :points="chart"/>
            <ConcurrencyPanel :daily="analytics.concurrency?.daily" :peak="analytics.concurrency?.peak" :peak-at="analytics.concurrency?.peak_at"/>
          </div>

          <MetricGrid grid-class="activity-metrics engagement-metrics">
            <MetricCard card-class="activity-metric-card accent" label="Terminées" :value="analytics.engagement?.completed||0" detail="seuil Tautulli ou générique" :icon="CheckCircle2"/>
            <MetricCard card-class="activity-metric-card" label="Abandonnées" :value="analytics.engagement?.abandoned||0" detail="avant le premier quart du seuil" :icon="CircleStop"/>
            <MetricCard card-class="activity-metric-card" label="Reprises" :value="analytics.engagement?.resumed||0" detail="sessions regroupées" :icon="History"/>
            <MetricCard card-class="activity-metric-card" label="Revisionnages" :value="analytics.engagement?.rewatches||0" detail="nouvelle lecture du même média" :icon="Repeat2"/>
            <MetricCard card-class="activity-metric-card" label="Durée moyenne" :value="formatDuration(averageWatch)" detail="par session" :icon="Timer"/>
          </MetricGrid>

          <div class="activity-grid analytics-secondary">
            <CompletionPanel :items="analytics.completion"/>
            <BreakdownPanel title="Types de lecture" eyebrow="Qualité" :items="methodBreakdown"/>
          </div>

          <div class="activity-grid analytics-secondary media-rankings">
            <PopularMediaPanel :items="analytics.popular" title="Médias les plus regardés" eyebrow="Durée cumulée"/>
            <PopularMediaPanel :items="analytics.popular_by_audience" title="Médias les plus populaires" eyebrow="Audience distincte"/>
          </div>

          <div class="activity-grid analytics-secondary user-rankings">
            <UserRankingPanel :users="data.users" :format-duration="formatDuration"/>
          </div>

          <ActivityHeatmap :points="analytics.heatmap"/>

          <section class="panel binge-panel">
            <div class="panel-head"><div><span class="eyebrow">Habitudes</span><h2>Marathons détectés</h2></div><small>3 épisodes ou plus</small></div>
            <div class="binge-list">
              <article v-for="item in analytics.binges||[]" :key="`${item.user_name}:${item.started_at}`"><Tv/><span><strong>{{ item.title }}</strong><small>{{ item.user_name }} · {{ formatDate(item.started_at) }}</small></span><em>{{ item.episodes }} épisodes<strong>{{ formatDuration(item.watch_ms) }}</strong></em></article>
              <p v-if="!analytics.binges?.length" class="empty">Aucun marathon détecté sur cette période.</p>
            </div>
          </section>
        </template>
      </template>

      <template v-else-if="currentView==='live'">
        <section class="live-heading">
          <div><span class="live-indicator"><i></i>{{ liveSessions.length }} active{{ liveSessions.length>1?'s':'' }}</span><h2>Flux en direct</h2><p>Suivez la progression et ouvrez une session pour consulter son diagnostic complet.</p></div>
          <span class="live-updated">Actualisé {{ relativeUpdate }}</span>
        </section>
        <LiveSessionsPanel :sessions="liveSessions" :collection-enabled="data.liveEnabled" :show-link="false" interactive @select="openSession($event)"/>
        <PlexServerTasks v-if="data.liveEnabled"/>
      </template>

      <template v-else-if="currentView==='history'">
        <UiFeedback v-if="historyError" type="error" :message="historyError" retry @retry="loadHistory()" />
        <HistoryTable
          :items="sortedHistoryItems"
          :total="history.total"
          :has-more="history.hasMore"
          :loading-more="historyLoadingMore"
          :page-size="HISTORY_PAGE_SIZE"
          :sort="historySort"
          :group-by-day="historySort.startsWith('date')"
          @select="(item: any, run: any[]) => openSession(item, run)"
          @load-more="loadHistory(true)"
          @update:sort="setHistorySort"
        />
      </template>

      <template v-else-if="currentView==='quality'">
        <MetricGrid grid-class="activity-metrics quality-metrics">
          <MetricCard card-class="activity-metric-card accent" label="Débit moyen" :value="formatBandwidth(analytics.bandwidth?.average_kbps)" :detail="bandwidthCoverageLabel" :icon="Gauge"/>
          <MetricCard card-class="activity-metric-card" label="Débit P95" :value="formatBandwidth(analytics.bandwidth?.p95_kbps)" :detail="`95 % sous ce seuil · ${bandwidthMeasured} mesurées`" :icon="Activity"/>
          <MetricCard card-class="activity-metric-card" label="Débit maximal" :value="formatBandwidth(analytics.bandwidth?.peak_kbps)" detail="pic observé" :icon="Zap"/>
          <!-- Le suivi des conversions : le transcodage complet, et la conversion légère
               (Direct Stream), où seul le conteneur ou les sous-titres changent. -->
          <MetricCard card-class="activity-metric-card" label="Transcodage" :value="`${summary.transcode_rate||0} %`" :detail="`${summary.transcodes||0} session${(summary.transcodes||0)>1?'s':''} réencodée${(summary.transcodes||0)>1?'s':''}`" :icon="Cpu" :progress="{ value: summary.transcode_rate || 0, max: 100 }"/>
          <MetricCard card-class="activity-metric-card" label="Conversion légère" :value="`${summary.direct_stream_rate||0} %`" :detail="`${summary.direct_streams||0} session${(summary.direct_streams||0)>1?'s':''} sans réencodage`" :icon="ArrowLeftRight" :progress="{ value: summary.direct_stream_rate || 0, max: 100 }"/>
          <MetricCard card-class="activity-metric-card" label="Rendement stockage" :value="analytics.storage?.watch_hours_per_gb==null?'—':`${analytics.storage.watch_hours_per_gb} h/Go`" :detail="`${analytics.storage?.known_items||0} fichiers mesurés`" :icon="HardDrive"/>
        </MetricGrid>
        <!-- Plex ne renseigne ni la decision de lecture ni le debit sur toutes les
             sessions. Sans ce rappel, « 78 % Inconnu » se lisait comme une mesure de la
             qualite alors que c'est une mesure de ce qu'on ne sait pas. -->
        <section v-if="qualityCoverage.sessions" class="coverage-note">
          <span><Info aria-hidden="true" /> Mode de lecture connu sur <strong>{{ qualityCoverage.method_known }}</strong> des {{ qualityCoverage.sessions }} lectures de la période ({{ methodCoverageRate }} %) · débit mesuré sur <strong>{{ bandwidthMeasured }}</strong>.</span>
        </section>
        <div class="quality-grid">
          <BreakdownPanel title="Résolutions" eyebrow="Source" :items="resolutionBreakdown"/>
          <BreakdownPanel title="Codecs vidéo" eyebrow="Source" :items="codecBreakdown"/>
          <BreakdownPanel title="Causes de transcodage" eyebrow="Diagnostic" :items="transcodeReasonBreakdown"/>
          <BreakdownPanel title="Causes de conversion légère" eyebrow="Diagnostic" :items="directStreamReasonBreakdown"/>
          <BreakdownPanel title="Conteneurs" eyebrow="Source" :items="containerBreakdown"/>
          <BreakdownPanel title="Bande passante par utilisateur" eyebrow="Réseau" :items="bandwidthBreakdown"/>
        </div>
        <section class="panel compatibility-panel">
          <div class="panel-head"><div><span class="eyebrow">Compatibilité</span><h2>Appareils et lecteurs</h2></div></div>
          <div class="compatibility-table">
            <article v-for="device in analytics.quality?.devices||[]" :key="device.device">
              <MonitorPlay/><span><strong>{{ device.device }}</strong><small>{{ device.sessions }} sessions · {{ device.transcodes }} transcodages<template v-if="device.direct_streams"> · {{ device.direct_streams }} conversion{{ device.direct_streams>1?'s':'' }} légère{{ device.direct_streams>1?'s':'' }}</template></small></span>
              <div><i :style="{width:`${device.compatibility_score}%`}"></i></div><em>{{ device.compatibility_score }} %</em>
            </article>
            <p v-if="!analytics.quality?.devices?.length" class="empty">Aucune donnée d'appareil.</p>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><div><span class="eyebrow">Diagnostic</span><h2>Derniers modes de lecture</h2></div></div>
          <div class="quality-list">
            <button v-for="item in qualityHistory" :key="sessionKey(item)" @click="openSession(item)">
              <MediaArtwork :src="item.thumb_url" :alt="displayTitle(item)" :type="item.media_type" size="small"/>
              <span><strong>{{ displayTitle(item) }}</strong><small>{{ item.player||item.platform||'Plex' }} · {{ item.quality||'Auto' }}</small></span>
              <PlaybackMethodBadge :method="item.playback_method"/>
            </button>
            <p v-if="!qualityHistory.length" class="empty">Aucune donnée de qualité sur cette période.</p>
          </div>
        </section>
      </template>

      <template v-else-if="currentView==='users'">
        <!-- Chaque carte ouvre la Vue d'ensemble restreinte a cette personne : c'est le
             seul ecran qui les liste toutes, il sert donc d'annuaire vers le perimetre. -->
        <div v-balanced-grid="{ min: 340 }" class="user-cards">
          <article v-for="(user,index) in filteredAnalyticsUsers" :key="user.name" class="panel user-card">
            <button type="button" class="user-card-open" :aria-label="`Voir l’activité de ${user.name}`" @click="openUserScope(user.name)"></button>
            <UiAvatar class="user-avatar" :name="user.name" size="lg" tone="accent" />
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

      </div><!-- .psh-main -->
    </div><!-- .psh-layout -->
  </AppPage>
</template>

<script setup lang="ts">
import UiAvatar from '@/components/ui/UiAvatar.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import UiCombobox from '@/components/ui/UiCombobox.vue';
import { playbackMethodLabel } from '@/utils/labels';
import { formatBandwidth, formatDateTimeShort, formatDuration, signedPercent } from '@/utils/format';
import { computed,onUnmounted,ref,watch } from 'vue';
import { refDebounced, useDebounceFn, useIntervalFn } from '@vueuse/core';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRoute,useRouter } from 'vue-router';
import { Activity, ArrowLeftRight, ArrowRight,CheckCircle2,CircleStop,Clock3,Cpu,Gauge,HardDrive,History,Info,MonitorPlay,PlayCircle,Radio,Repeat2,Search,Timer,Tv,Users,Users as UsersIcon,Zap } from '@lucide/vue';
import { activitySections } from '@/navigation';
import { api } from '@/api';
import { readCacheEntry, writeCache } from '@/cache';
import { useRealtime } from '@/events';
import { queryKeys } from '@/queryKeys';
import { playbackLiveQuery } from '@/sharedQueries';
import { humanizeError } from '@/utils/apiError';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import MetricCard from '@/components/ui/MetricCard.vue';
import MetricGrid from '@/components/ui/MetricGrid.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import ActivityHeatmap from '@/components/activity/ActivityHeatmap.vue';
import BreakdownPanel from '@/components/activity/BreakdownPanel.vue';
import CompletionPanel from '@/components/activity/CompletionPanel.vue';
import ConcurrencyPanel from '@/components/activity/ConcurrencyPanel.vue';
import DailyActivityChart from '@/components/activity/DailyActivityChart.vue';
import HistoryTable from '@/components/activity/HistoryTable.vue';
import LiveSessionsPanel from '@/components/activity/LiveSessionsPanel.vue';
import PlexServerTasks from '@/components/activity/PlexServerTasks.vue';
import MediaArtwork from '@/components/activity/MediaArtwork.vue';
import PlaybackMethodBadge from '@/components/activity/PlaybackMethodBadge.vue';
import PopularMediaPanel from '@/components/activity/PopularMediaPanel.vue';
import { etatDeSerie, etatDeVoisins, ouvrirFiche } from '@/composables/useMediaOverlay';
import { episodeLabel } from '@/utils/episode';
import UserRankingPanel from '@/components/activity/UserRankingPanel.vue';
import { usePreference } from '@/composables/usePreference';

const route=useRoute(),router=useRouter();
const allowedViews=['overview','live','history','quality','users'];
const currentView=computed(()=>allowedViews.includes(String(route.query.view))?String(route.query.view):'overview');
// La periode ne vit plus que dans l'URL : les sections de la destination (rail, barre
// de contexte, page) pointent vers `/activity?view=...` sans la porter, et sans memoire
// locale chaque changement de vue serait retombe sur 30 jours.
const storedDays=usePreference('activity.days',30);
const days=ref(Number(route.query.days)||storedDays.value);
// « Tout » est demande comme un siecle (MAX_PERIOD_DAYS cote API) plutot que comme un
// parametre absent : le service garde un seul chemin de calcul, borne. Les libelles
// restent courts car le selecteur partage la rangee de la barre du haut.
const ALL_TIME_DAYS = 36500;
const periodOptions = [
  { value: 7, label: '7 j' },
  { value: 30, label: '30 j' },
  { value: 90, label: '90 j' },
  { value: 365, label: '1 an' },
  { value: 730, label: '2 a' },
  { value: 1095, label: '3 a' },
  { value: 1825, label: '5 a' },
  { value: 3650, label: '10 a' },
  { value: ALL_TIME_DAYS, label: 'Tout' },
];
/** « sur 36500 jours » n'a aucun sens a l'ecran : chaque periode a son libelle long. */
const periodLabel = computed(() => {
  const value = days.value;
  if (value >= ALL_TIME_DAYS) return 'tout l’historique';
  if (value >= 365 && value % 365 === 0) {
    const years = value / 365;
    return `${years} an${years > 1 ? 's' : ''}`;
  }
  return `${value} jours`;
});
const historySearch=ref(''),methodFilter=ref(''),typeFilter=ref(''),userFilter=ref(''),deviceFilter=ref(''),serverFilter=ref(''),clock=ref(Date.now());
const filtersOpen=ref(false);
const summary=computed(()=>data.value.summary||{});
const analytics=computed(()=>data.value.analytics||{});
const analyticsUsers=computed((): any[] =>analytics.value.users||[]);
// Les sections de la destination sont reprises telles quelles, la vue « En direct »
// portant en plus le nombre de lectures en cours.
const sections=computed(()=>activitySections().map(section=>section.key==='live'?{...section,count:data.value.active.length}:section));
const chart=computed(()=>data.value.daily||[]);

/* Une seule recherche pour toute la page, et elle filtre ce que la vue affichee liste
   reellement : lectures en cours, historique, medias, utilisateurs, marathons. Les
   cartes de synthese restent calculees par le serveur sur la periode complete -- les
   faire varier avec une saisie locale aurait laisse croire a un recalcul qui n'a pas
   lieu. */
const needle=computed(()=>historySearch.value.trim().toLowerCase());
function matches(...parts: Array<unknown>): boolean {
  if(!needle.value)return true;
  return parts.filter(Boolean).join(' ').toLowerCase().includes(needle.value);
}
/* Vue d'ensemble : la saisie designe un utilisateur, et ce nom part au serveur, qui
   recalcule toute la periode sur lui. On ne retient que le premier qui corresponde -- un
   « filtre » qui en garderait plusieurs ne saurait plus quels chiffres afficher dans des
   cartes qui n'existent que par utilisateur.
   `knownUsers` n'est rafraichi qu'hors perimetre : une fois la page restreinte, la
   reponse ne contient plus qu'un seul nom, et s'y fier aurait interdit d'en viser un
   autre sans tout effacer d'abord. */
const knownUsers=ref<string[]>([]);
const scopedUser=ref('');
const matchedUser=computed((): string|null=>{
  if(currentView.value!=='overview'||!needle.value)return null;
  return knownUsers.value.find(name=>name.toLowerCase().includes(needle.value))||null;
});
const searchPlaceholder=computed(()=>({
  overview:'Filtrer par utilisateur',
  live:'Filtrer les lectures en cours',
  history:'Filtrer par média, utilisateur ou appareil',
  quality:'Filtrer par média, utilisateur ou appareil',
  users:'Filtrer par utilisateur',
} as Record<string, string>)[currentView.value] || 'Filtrer');
/* Le direct ne depend pas de la periode, donc d'aucun recalcul serveur : c'est la seule
   surface que l'on restreint encore ici, sur le nom deja retenu. */
const liveSessions=computed(()=>{
  const sessions=data.value.active||[];
  if(currentView.value==='overview')return scopedUser.value?sessions.filter((item: any)=>item.user_name===scopedUser.value):sessions;
  return sessions.filter((item: any)=>matches(displayTitle(item),item.user_name,item.player,item.product,item.platform));
});
const filteredAnalyticsUsers=computed(()=>analyticsUsers.value.filter((user: any)=>matches(user.name,user.favorite_title,user.favorite_device)));
const qualityHistory=computed(()=>(data.value.history||[]).slice(0,20));

/* Ce que le champ retranche, vue par vue : sans ce compte, une liste filtree se lit
   comme une liste complete. L'historique est filtre en base, son total vient donc du
   serveur ; les autres vues filtrent ce qu'elles ont deja sous la main. */
const filterCounts=computed(()=>{
  switch(currentView.value){
    case 'live':
      return {matched:liveSessions.value.length, total:(data.value.active||[]).length};
    case 'history':
      // Le serveur renvoie le total de la requete filtree : le total non filtre nous est
      // inconnu, on n'annonce donc que le nombre de resultats.
      return {matched:history.value.total, total:null};
    case 'users':
      return {matched:filteredAnalyticsUsers.value.length, total:analyticsUsers.value.length};
    default:
      return {matched:null, total:null};
  }
});
const viewTitle=computed(()=>({overview:'Vue d’ensemble',live:'Activité en direct',history:'Historique des lectures',quality:'Qualité des flux',users:'Utilisateurs'} as Record<string, string>)[currentView.value]);
const viewDescription=computed(()=>({
  overview:'Vue synthétique des lectures, tendances et utilisateurs.',
  live:'Lectures en cours et diagnostic détaillé des flux.',
  history:'Recherchez et analysez les dernières lectures.',
  stats:'Tendances de consommation et engagement sur la période.',
  quality:'Lecture directe, Direct Stream et transcodage.',
  users:'Activité et temps de visionnage par utilisateur.',
} as Record<string, string>)[currentView.value]);
const averageWatch=computed(()=>summary.value.sessions?Math.round((summary.value.watch_ms||0)/summary.value.sessions):0);
const relativeUpdate=computed(()=>{const seconds=Math.max(0,Math.floor((clock.value-updatedAt.value)/1000));return seconds<5?'à l’instant':`il y a ${seconds} s`});
/* L'historique ne vient plus de l'instantane d'activite -- borne a cent lignes toutes
   personnes confondues -- mais de son propre endpoint filtre et pagine. Filtrer cette
   fenetre-la donnait « les lectures d'Untel parmi les cent dernieres » au lieu de ses
   cent dernieres, sans que le compteur affiche ne le trahisse. */
const HISTORY_PAGE_SIZE=100;
interface HistoryPage {items?: any[]; total?: number; has_more?: boolean; facets?: {users?: string[]; devices?: string[]; servers?: Array<{id: number; name: string}>}}
const historySort=ref('date_desc');
// La recherche part en base apres une pause de saisie ; les listes deroulantes, la periode
// et le tri immediatement. Tous font partie de la cle : en changer annule la lecture en
// cours et repart de la premiere page, ce que faisait `useLatestRequest` a la main.
const historyNeedle=refDebounced(computed(()=>historySearch.value.trim()),250);
const historyKey=computed(()=>({days:days.value,sort:historySort.value,query:historyNeedle.value,method:methodFilter.value,mediaType:typeFilter.value,user:userFilter.value,device:deviceFilter.value,server:serverFilter.value}));
function historyParams(offset: number): URLSearchParams {
  const key=historyKey.value;
  const params=new URLSearchParams({days:String(key.days),limit:String(HISTORY_PAGE_SIZE),offset:String(offset)});
  if(key.query)params.set('query',key.query);
  if(key.method)params.set('method',key.method);
  if(key.mediaType)params.set('media_type',key.mediaType);
  if(key.user)params.set('user',key.user);
  if(key.device)params.set('device',key.device);
  if(key.server)params.set('server',key.server);
  params.set('sort',key.sort);
  return params;
}
const historyQuery=useInfiniteQuery({
  queryKey:computed(()=>['activity','history',historyKey.value]),
  queryFn:({pageParam,signal})=>api<HistoryPage>(`/api/playback/history?${historyParams(pageParam)}`,{signal}),
  initialPageParam:0,
  getNextPageParam:(last: HistoryPage,pages: HistoryPage[])=>last.has_more?pages.reduce((sum,page)=>sum+(page.items?.length||0),0):undefined,
  enabled:computed(()=>currentView.value==='history'),
  placeholderData:keepPreviousData,
  staleTime:30_000,
});
const history=computed(()=>{
  const pages=historyQuery.data.value?.pages||[];
  const first=pages[0];
  return {
    items:pages.flatMap(page=>page.items||[]),
    total:first?.total||0,
    hasMore:Boolean(historyQuery.hasNextPage.value),
    facets:{users:first?.facets?.users||[],devices:first?.facets?.devices||[],servers:first?.facets?.servers||[]},
  };
});
const historyError=computed(()=>{const e: any=historyQuery.error.value;return e?(e.message||String(e)):''});
const historyLoadingMore=computed(()=>historyQuery.isFetchingNextPage.value);
function loadHistory(more=false): void {if(more)void historyQuery.fetchNextPage();else void historyQuery.refetch()}

/* Les trois tris passent par le serveur. Reordonner les lignes deja chargees ne triait
   que la premiere page : « Anciennes » remettait dans l'autre sens les cent lectures les
   plus recentes -- donc ne montrait jamais les plus anciennes -- et le tri n'etait meme
   pas rejoue au changement, faute de rechargement. */
const sortedHistoryItems=computed(()=>history.value.items);
function setHistorySort(value: string): void {
  if(value===historySort.value)return;
  historySort.value=value;
}
const historyUsers=computed(()=>history.value.facets.users);
const historyDevices=computed(()=>history.value.facets.devices);
/* Serveurs Plex ayant des lectures sur la periode : le filtre n'apparait qu'a partir de deux. */
const historyServers=computed(()=>history.value.facets.servers);
const historyFilterCount=computed(()=>[historySearch.value,methodFilter.value,typeFilter.value,userFilter.value,deviceFilter.value,serverFilter.value].filter(Boolean).length);
const methodBreakdown=computed(()=>(analytics.value.quality?.methods||[]).map((item: any)=>({label:playbackMethodLabel(item.key,{fallback:item.key==='unknown'?'Inconnu':item.key}),value:item.count,suffix:` · ${item.rate} %`})));
const resolutionBreakdown=computed(()=>(analytics.value.quality?.resolutions||[]).map((item: any)=>({label:item.label,value:item.count})));
const codecBreakdown=computed(()=>(analytics.value.quality?.codecs||[]).map((item: any)=>({label:item.label,value:item.count})));
const transcodeReasonBreakdown=computed(()=>(analytics.value.quality?.transcode_reasons||[]).map((item: any)=>({label:item.label,value:item.count})));
const directStreamReasonBreakdown=computed(()=>(analytics.value.quality?.direct_stream_reasons||[]).map((item: any)=>({label:item.label,value:item.count})));
/* Conteneur du fichier source, et combien de lectures ont dû en changer pour le lecteur. */
const containerBreakdown=computed(()=>(analytics.value.quality?.containers||[]).map((item: any)=>({label:item.label,value:item.count,suffix:item.converted?` · ${item.converted} converti${item.converted>1?'s':''}`:' · inchangé'})));
const transcodeDetail=computed(()=>{
  const transcodes=summary.value.transcodes||0;
  const light=summary.value.direct_streams||0;
  return `${transcodes} session${transcodes>1?'s':''}${light?` · ${light} conversion${light>1?'s':''} légère${light>1?'s':''}`:''}`;
});
const qualityCoverage=computed(()=>analytics.value.quality?.coverage||{sessions:0,method_known:0,bandwidth_measured:0});
const bandwidthMeasured=computed(()=>analytics.value.bandwidth?.measured??qualityCoverage.value.bandwidth_measured??0);
const methodCoverageRate=computed(()=>{
  const total=qualityCoverage.value.sessions||0;
  return total?Math.round((qualityCoverage.value.method_known||0)/total*100):0;
});
const bandwidthCoverageLabel=computed(()=>{
  const measured=bandwidthMeasured.value;
  const total=qualityCoverage.value.sessions||0;
  return measured?`mesuré sur ${measured} lecture${measured>1?'s':''} sur ${total}`:'aucun débit communiqué par Plex';
});
function openUserScope(name: string): void {
  historySearch.value=name;
  router.replace({path:'/activity',query:{...route.query,view:undefined}});
}
const bandwidthBreakdown=computed(()=>(analytics.value.bandwidth?.by_user||[]).map((item: any)=>({label:item.name,value:Math.round(item.average_kbps/100)/10,suffix:' Mb/s',detail:`Pic ${formatBandwidth(item.peak_kbps)}`})));

// Seules les statistiques sont mises en cache, jamais les sessions `active` : repeindre
// une lecture « en cours » terminee depuis serait un contresens, alors qu'une tendance
// sur 30 jours vieille de quelques minutes reste juste.
const STATISTICS_CACHE_MAX_AGE_MS=6*60*60*1000;
const statisticsCacheKey=()=>`activity:statistics:${days.value}${scopedUser.value?`:${scopedUser.value}`:''}`;

/* Statistiques de la periode et lectures en cours : deux requetes. Le direct a la meme
   cle que le tableau de bord ; les statistiques repartent du dernier resultat connu
   (`@/cache`) pour s'afficher avant le premier aller-retour. */
const queryClient=useQueryClient();
const liveQuery=useQuery(playbackLiveQuery());
function statisticsUrl(): string {
  const params=new URLSearchParams({days:String(days.value)});
  if(scopedUser.value)params.set('user',scopedUser.value);
  return `/api/playback/statistics?${params}`;
}
const statisticsQuery=useQuery({
  queryKey:computed(()=>['playback','statistics',days.value,scopedUser.value]),
  queryFn:async({signal})=>{
    const cacheKey=statisticsCacheKey();
    const statistics=await api<Record<string, any>>(statisticsUrl(),{signal});
    writeCache(cacheKey,statistics);
    return statistics;
  },
  initialData:()=>readCacheEntry(statisticsCacheKey(),{maxAgeMs:STATISTICS_CACHE_MAX_AGE_MS})?.data,
  initialDataUpdatedAt:()=>readCacheEntry(statisticsCacheKey(),{maxAgeMs:STATISTICS_CACHE_MAX_AGE_MS})?.savedAt,
  // Changer de periode ou d'utilisateur garde les chiffres affiches jusqu'aux nouveaux.
  placeholderData:keepPreviousData,
  // La vue « En direct » n'affiche aucune statistique.
  enabled:computed(()=>currentView.value!=='live'),
});
const EMPTY_STATISTICS={history:[],daily:[],users:[],summary:{}};
const data=computed<Record<string, any>>(()=>{
  const statistics=statisticsQuery.data.value||EMPTY_STATISTICS;
  const live=liveQuery.data.value;
  return {
    ...statistics,
    active:live?.active||[],
    liveEnabled:live?live.enabled!==false:(statistics.enabled??statistics.liveEnabled??true),
    liveConfigured:live?live.configured!==false:(statistics.configured??statistics.liveConfigured??true),
  };
});
const loaded=computed(()=>Boolean(statisticsQuery.data.value)||(currentView.value==='live'&&Boolean(liveQuery.data.value)));
const loading=computed(()=>liveQuery.isFetching.value||statisticsQuery.isFetching.value);
const error=computed(()=>{
  const failure=(currentView.value!=='live'?statisticsQuery.error.value:null)||liveQuery.error.value;
  return failure?humanizeError(failure):'';
});
const updatedAt=computed(()=>Math.max(statisticsQuery.dataUpdatedAt.value||0,liveQuery.dataUpdatedAt.value||0)||Date.now());
watch(()=>statisticsQuery.data.value,(snapshot)=>{
  if(!snapshot||scopedUser.value)return;
  const names=[...(snapshot.users||[]),...(snapshot.analytics?.users||[])].map((user: any)=>String(user.name||'')).filter(Boolean);
  if(names.length)knownUsers.value=[...new Set(names)];
},{immediate:true});
function load(): void {
  void liveQuery.refetch();
  if(currentView.value!=='live')void statisticsQuery.refetch();
}
function setDays(value: number): void {days.value=value;storedDays.value=value;router.replace({query:{...route.query,days:value===30?undefined:String(value)}})}
function setPeriod(value: string | number): void { if (typeof value === 'number') setDays(value); }
function resetActivityFilters(): void {historySearch.value='';methodFilter.value='';typeFilter.value='';userFilter.value='';deviceFilter.value='';serverFilter.value=''}
const formatDate=(value: string)=>formatDateTimeShort(value,'—');
function comparisonLabel(value: number): string {return `${signedPercent(value)} vs période précédente`}
// Les cartes de tete portent la tendance : sans comparaison disponible, aucun chevron
// plutot qu'un « stable » qui affirmerait une mesure qu'on n'a pas faite.
function trendOf(change?: number|null): {direction: string; label: string}|null {
  if(change==null)return null;
  return {direction:change>0?'up':change<0?'down':'stable',label:comparisonLabel(change)};
}
/* Plex reutilise la meme cle de session sur plusieurs lectures successives (cinq lignes
   d'affilee peuvent partager `session_id`) : seule la cle de la ligne en base identifie
   vraiment une lecture. S'en remettre a `session_id` donnait des cles de liste dupliquees
   et bloquait la navigation « suivante » du tiroir sur la premiere ligne homonyme. */
function sessionKey(item: any): string {
  if (!item) return '';
  return item.id != null ? `row:${item.id}` : `${item.source}:${item.session_id}`;
}
function displayTitle(item: any): string {return item.grandparent_title?`${item.grandparent_title} · ${item.title}`:item.title}
/* Les sessions voisines sont celles de la liste effectivement affichee : passer de
   l'une a l'autre depuis la fiche doit suivre l'ordre que l'on avait sous les yeux.
   La fiche s'ouvre dans la feuille, avec sa propre adresse (voir SessionDetailView). */
const siblingSessions=computed((): any[]=>{
  if(currentView.value==='history')return sortedHistoryItems.value;
  if(currentView.value==='quality')return qualityHistory.value;
  return liveSessions.value;
});
/* Une ligne repliee de l'historique (lectures consecutives) ouvre sa premiere lecture, et
   la fiche garde la liste des autres, dans l'ordre chronologique, pour passer de l'une a
   l'autre : chacune a son propre mode, ses flux et sa conversion. */
function openSession(item: any, run: any[]=[]): void {
  if(item?.id==null)return;
  const ids=siblingSessions.value.map((row: any)=>row.id).filter((id: any)=>id!=null);
  const lectures=run.filter((row: any)=>row?.id!=null);
  const serie=lectures.length>1?etatDeSerie([...lectures].sort((a: any,b: any)=>String(a.started_at||'').localeCompare(String(b.started_at||''))).map((row: any)=>({
    id:String(row.id),
    method:row.playback_method||'',
    started_at:row.started_at||'',
    watched_ms:row.watched_ms||0,
    label:row.media_type==='episode'&&(row.season_number!=null||row.episode_number!=null)?`${episodeLabel(row)} · ${row.title||''}`:row.title||'Lecture Plex',
  }))):{};
  ouvrirFiche(router,`/activity/session/${item.id}`,route.fullPath,{...etatDeVoisins(ids),...serie});
}
function userShare(sessions: number): number {return Math.round(Number(sessions||0)/Math.max(1,summary.value.sessions||0)*100)}
watch(()=>route.query.days,value=>{const next=Number(value)||days.value;if(next!==days.value)days.value=next});
useRealtime(['activity.updated'],()=>{
  void queryClient.invalidateQueries({queryKey:queryKeys.playback.live});
  if(currentView.value!=='live')void queryClient.invalidateQueries({queryKey:['playback','statistics']});
});
// Horloge locale du libelle « actualise il y a N s » : doit tourner meme onglet masque,
// sinon l'age affiche au retour sur l'onglet est faux.
useIntervalFn(()=>{clock.value=Date.now()},1000);
// Une frappe ne doit pas declencher une requete par lettre : on n'appelle le serveur que
// lorsque le nom retenu change vraiment, et apres une pause de saisie.
const applyScope=useDebounceFn(()=>{
  const next=matchedUser.value||'';
  if(next===scopedUser.value)return;
  scopedUser.value=next;
},350);
watch(matchedUser,()=>applyScope());
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.activity-title-tabs{margin:0}.coverage-note{display:flex;align-items:center;gap:var(--space-2);margin:0 0 14px;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-2);color:var(--muted);font-size:var(--fs-xs)}.coverage-note svg{flex:none;width:15px}.coverage-note strong{color:var(--text)}.user-card{position:relative}.user-card-open{position:absolute;inset:0;z-index:1;border:0;border-radius:inherit;background:transparent;cursor:pointer}.user-card-open:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.user-card>*:not(.user-card-open){position:relative;z-index:2;pointer-events:none}.user-card-cue{display:inline-flex;align-items:center;gap:6px;grid-column:1/-1;margin-top:2px;color:var(--muted);font-size:var(--fs-xs);font-weight:600}.user-card-cue svg{width:14px}.user-card:hover .user-card-cue{color:var(--accent)}.scope-note{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);flex-wrap:wrap;margin:0 0 4px;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-2);color:var(--muted);font-size:var(--fs-xs)}.scope-note span{display:inline-flex;align-items:center;gap:var(--space-2)}.scope-note svg{width:15px}.scope-note strong{color:var(--text)}
.period-picker{display:flex;padding:2px;border:1px solid var(--border);border-radius:var(--radius-pill)}.period-picker button{border:0;border-radius:var(--radius-pill);background:transparent;color:var(--muted);padding:6px 9px}.period-picker button.active{background:var(--accent);color:var(--on-accent)}.activity-metrics{margin:0 0 14px}.overview-metrics{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap: var(--space-2)}.overview-metric-card{padding:12px!important;gap: var(--space-2)!important}.overview-metric-card :deep(svg){width:17px!important}.overview-metric-card :deep(strong){font-size:var(--fs-lg)!important;white-space:nowrap}.overview-metric-card :deep(span),.overview-metric-card :deep(small){font-size: var(--fs-xs)!important}.activity-grid{display:grid;grid-template-columns:2fr 1fr;gap: var(--space-4);margin:14px 0}
/* Un panneau seul sur sa rangee -- unique de sa grille, ou laisse seul par un voisin
   pleine largeur -- prend toute la ligne au lieu d'une colonne, le reste vide. */
.activity-grid>:only-child,.activity-grid>.span-two+:last-child{grid-column:1/-1}.analytics-secondary{grid-template-columns:1fr 1fr}.activity-page :deep(.heatmap-panel),.activity-page :deep(.popular-panel){margin-top:14px}.live-heading{display:flex;align-items:flex-end;justify-content:space-between;gap: var(--space-4);margin:8px 2px 16px}.live-heading h2{margin:6px 0 3px}.live-heading p,.live-updated{margin:0;color:var(--muted);font-size:var(--fs-xs)}.live-indicator{display:flex;align-items:center;gap: var(--space-2);color:var(--green-text);font-size:var(--fs-xs);font-weight:700;text-transform:uppercase}.live-indicator i{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 0 4px color-mix(in srgb, var(--green) 12%, transparent)}.search-field{display:flex;align-items:center;gap: var(--space-2);min-width:min(360px,100%);padding:0 11px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-2)}.search-field svg{width:15px;color:var(--muted)}.search-field input{width:100%;border:0;background:transparent}.quality-grid{display:grid;grid-template-columns:repeat(2,1fr);gap: var(--space-4);margin-bottom:14px}.compatibility-panel{margin-bottom:14px}.compatibility-table{display:grid;margin-top:10px}.compatibility-table article{display:grid;grid-template-columns:28px minmax(150px,1fr) minmax(100px,1fr) 50px;gap: var(--space-3);align-items:center;padding:10px 4px;border-bottom:1px solid var(--border)}.compatibility-table article>svg{width:18px;color:var(--muted)}.compatibility-table article>span{display:grid;min-width:0}.compatibility-table article small{color:var(--muted);font-size:var(--fs-xs)}.compatibility-table article>div{height:6px;overflow:hidden;border-radius:var(--radius-pill);background:rgb(var(--ink) / .07)}.compatibility-table article>div i{display:block;height:100%;background:var(--green-text)}.compatibility-table em{color:var(--green-text);font-size:var(--fs-xs);font-style:normal;text-align:right}.quality-list{display:grid;margin-top:10px}.quality-list button{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap: var(--space-3);align-items:center;width:100%;padding:9px;border:0;border-bottom:1px solid var(--border);background:transparent;color:var(--text);text-align:left}.quality-list button:hover{background:rgb(var(--ink) / .025)}.quality-list button>span{display:grid;min-width:0}.quality-list strong,.quality-list small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.quality-list small{color:var(--muted);font-size:var(--fs-xs)}.binge-panel{margin-top:14px}.binge-panel .panel-head>small{color:var(--muted);font-size:var(--fs-xs)}.binge-list{display:grid;margin-top:10px}.binge-list article{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap: var(--space-3);align-items:center;padding:10px 2px;border-bottom:1px solid var(--border)}.binge-list article>svg{width:19px;color:var(--muted)}.binge-list article>span,.binge-list article>em{display:grid}.binge-list small,.binge-list em{color:var(--muted);font-size:var(--fs-xs);font-style:normal}.binge-list em{justify-items:end}.binge-list em>strong{color:var(--text)}.user-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap: var(--space-3)}.user-card{display:grid;grid-template-columns:46px minmax(0,1fr) auto;gap: var(--space-3);align-items:center}.user-avatar{grid-row:1/3}.user-card h3,.user-card p{margin:0}.user-card p,.user-card small{color:var(--muted);font-size:var(--fs-xs)}.user-card>strong{color:var(--text)}.user-share{grid-column:2/4;height:5px;overflow:hidden;border-radius:var(--radius-pill);background:rgb(var(--ink) / .08)}.user-share i{display:block;height:100%;border-radius:inherit;background:var(--accent)}.user-card>small{grid-column:2/4}.user-card>small b{color:var(--green-text)}.user-card>small b.down{color:var(--red-text)}.user-card dl{display:grid;grid-column:1/-1;grid-template-columns:repeat(3,1fr);gap: var(--space-2);margin:5px 0 0}.user-card dl>div{display:grid;gap: var(--space-1);padding:8px;border-radius:var(--radius-sm);background:var(--surface-2)}.user-card dt{color:var(--muted);font-size:var(--fs-xs);}.user-card dd{overflow:hidden;margin:0;font-size:var(--fs-xs);text-overflow:ellipsis;white-space:nowrap}@container page (max-width: 957px) {.user-cards{grid-template-columns:1fr}}@container page (max-width: 757px) {.activity-grid,.analytics-secondary{grid-template-columns:1fr}}@include bp.until(tablet) {.quality-grid{grid-template-columns:1fr}.compatibility-table article{grid-template-columns:28px minmax(0,1fr) 44px}.compatibility-table article>div{grid-column:2}.compatibility-table em{grid-column:3;grid-row:2}}@container page (max-width: 504px) {.period-picker{order:3}.live-heading{align-items:flex-start;flex-direction:column}.live-updated{display:none}.quality-list button{grid-template-columns:42px minmax(0,1fr)}.quality-list :deep(.playback-badge){grid-column:2}.user-card dl{grid-template-columns:1fr}}@container page (max-width: 444px) {.overview-metrics{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@include bp.until(tablet) {.quality-grid{grid-template-columns:1fr}.period-picker{order:3;max-width:100%;overflow-x:auto}.period-picker button,.quality-list button{min-height:44px}.live-heading{align-items:flex-start;flex-direction:column}.live-updated{display:none}.user-cards{grid-template-columns:1fr}}
</style>
