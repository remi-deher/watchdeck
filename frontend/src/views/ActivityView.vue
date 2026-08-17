<template>
  <div class="page activity-page">
    <PageSearchHeader
      :title="viewTitle"
      :description="viewDescription"
      eyebrow="Activité Plex"
      v-model:query="historySearch"
      placeholder="Média, utilisateur ou appareil"
      :hide-search="currentView !== 'history'"
      :has-filters="currentView === 'history'"
      :active-count="historyFilterCount"
      :filters-open="filtersOpen"
      @toggle-filters="filtersOpen = !filtersOpen"
    >
      <template #actions>
        <UiSegmentedControl v-if="currentView!=='live'" :model-value="days" :options="periodOptions" :ariaLabel="'Période d’analyse'" @update:model-value="setPeriod" />
      </template>
    </PageSearchHeader>

    <TabNav :model-value="currentView" :tabs="activityTabs" aria-label="Sections de l'activité Plex" @update:model-value="selectView" />
    <UiFeedback v-if="loading && !loaded" type="loading" message="Chargement de l'activité Plex…" />
    <UiFeedback v-if="error" type="error" :message="error" retry @retry="load" />

    <div class="psh-layout">
      <FilterSidebar v-if="currentView === 'history'" :open="filtersOpen" :active-count="historyFilterCount" @close="filtersOpen=false" @reset="resetHistoryFilters">
        <select v-model="methodFilter"><option value="">Toutes les lectures</option><option value="direct_play">Lecture directe</option><option value="direct_stream">Direct Stream</option><option value="transcode">Transcodage</option></select>
        <select v-model="typeFilter"><option value="">Tous les types</option><option value="movie">Films</option><option value="episode">Séries</option><option value="track">Musique</option></select>
      </FilterSidebar>
      <div class="psh-main">
    <template v-if="loaded">
      <template v-if="currentView==='overview'">
        <MetricGrid grid-class="activity-metrics overview-metrics">
          <MetricCard card-class="activity-metric-card overview-metric-card accent" label="En direct" :value="data.active.length" detail="lectures maintenant" :icon="Radio"/>
          <MetricCard card-class="activity-metric-card overview-metric-card" label="Sessions" :value="summary.sessions||0" :detail="`sur ${days} jours`" :icon="PlayCircle"/>
          <MetricCard card-class="activity-metric-card overview-metric-card" label="Temps regardé" :value="formatDuration(summary.watch_ms)" detail="durée cumulée" :icon="Clock3"/>
          <MetricCard card-class="activity-metric-card overview-metric-card" label="Transcodage" :value="`${summary.transcode_rate||0} %`" :detail="`${summary.transcodes||0} sessions`" :icon="Cpu" :progress="{ value: summary.transcode_rate || 0, max: 100 }"/>
        </MetricGrid>
        <LiveSessionsPanel :sessions="data.active" :collection-enabled="data.liveEnabled" interactive @select="selectedSession=$event"/>
        <div class="activity-grid">
          <DailyActivityChart :points="chart"/>
          <UserRankingPanel :users="data.users" :format-duration="formatDuration"/>
        </div>
      </template>

      <template v-else-if="currentView==='live'">
        <section class="live-heading">
          <div><span class="live-indicator"><i></i>{{ data.active.length }} active{{ data.active.length>1?'s':'' }}</span><h2>Flux en direct</h2><p>Suivez la progression et ouvrez une session pour consulter son diagnostic complet.</p></div>
          <span class="live-updated">Actualisé {{ relativeUpdate }}</span>
        </section>
        <LiveSessionsPanel :sessions="data.active" :collection-enabled="data.liveEnabled" :show-link="false" interactive @select="selectedSession=$event"/>
      </template>

      <template v-else-if="currentView==='history'">
        <HistoryTable :items="filteredHistory" @select="selectedSession=$event"/>
      </template>

      <template v-else-if="currentView==='stats'">
        <MetricGrid grid-class="activity-metrics">
          <MetricCard
            card-class="activity-metric-card accent"
            label="Sessions"
            :value="summary.sessions||0"
            :detail="comparisonLabel(analytics.comparison?.sessions_change)"
            :trend="analytics.comparison?.sessions_change != null ? { direction: analytics.comparison.sessions_change > 0 ? 'up' : analytics.comparison.sessions_change < 0 ? 'down' : 'stable', label: comparisonLabel(analytics.comparison.sessions_change) } : null"
            :icon="PlayCircle"
          />
          <MetricCard
            card-class="activity-metric-card"
            label="Temps regardé"
            :value="formatDuration(summary.watch_ms)"
            :detail="comparisonLabel(analytics.comparison?.watch_change)"
            :trend="analytics.comparison?.watch_change != null ? { direction: analytics.comparison.watch_change > 0 ? 'up' : analytics.comparison.watch_change < 0 ? 'down' : 'stable', label: comparisonLabel(analytics.comparison.watch_change) } : null"
            :icon="Clock3"
          />
          <MetricCard card-class="activity-metric-card" label="Simultanéité max." :value="analytics.concurrency?.peak||0" detail="flux au même moment" :icon="Users"/>
          <MetricCard card-class="activity-metric-card" label="Moyenne" :value="formatDuration(averageWatch)" detail="par session" :icon="Timer"/>
        </MetricGrid>
        <div class="activity-grid">
          <DailyActivityChart :points="chart"/>
          <ConcurrencyPanel :daily="analytics.concurrency?.daily" :peak="analytics.concurrency?.peak" :peak-at="analytics.concurrency?.peak_at"/>
        </div>
        <ActivityHeatmap :points="analytics.heatmap"/>
        <MetricGrid grid-class="activity-metrics engagement-metrics">
          <MetricCard card-class="activity-metric-card accent" label="Terminées" :value="analytics.engagement?.completed||0" detail="seuil Tautulli ou générique" :icon="CheckCircle2"/>
          <MetricCard card-class="activity-metric-card" label="Abandonnées" :value="analytics.engagement?.abandoned||0" detail="avant le premier quart du seuil" :icon="CircleStop"/>
          <MetricCard card-class="activity-metric-card" label="Reprises" :value="analytics.engagement?.resumed||0" detail="sessions regroupées" :icon="History"/>
          <MetricCard card-class="activity-metric-card" label="Revisionnages" :value="analytics.engagement?.rewatches||0" detail="nouvelle lecture du même média" :icon="Repeat2"/>
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
        <section class="panel binge-panel">
          <div class="panel-head"><div><span class="eyebrow">Habitudes</span><h2>Marathons détectés</h2></div><small>3 épisodes ou plus</small></div>
          <div class="binge-list">
            <article v-for="item in analytics.binges||[]" :key="`${item.user_name}:${item.started_at}`"><Tv/><span><strong>{{ item.title }}</strong><small>{{ item.user_name }} · {{ formatDate(item.started_at) }}</small></span><em>{{ item.episodes }} épisodes<strong>{{ formatDuration(item.watch_ms) }}</strong></em></article>
            <p v-if="!analytics.binges?.length" class="empty">Aucun marathon détecté sur cette période.</p>
          </div>
        </section>
      </template>

      <template v-else-if="currentView==='quality'">
        <MetricGrid grid-class="activity-metrics quality-metrics">
          <MetricCard card-class="activity-metric-card accent" label="Débit moyen" :value="formatBandwidth(analytics.bandwidth?.average_kbps)" detail="toutes sessions" :icon="Gauge"/>
          <MetricCard card-class="activity-metric-card" label="Débit P95" :value="formatBandwidth(analytics.bandwidth?.p95_kbps)" detail="95 % sous ce seuil" :icon="Activity"/>
          <MetricCard card-class="activity-metric-card" label="Débit maximal" :value="formatBandwidth(analytics.bandwidth?.peak_kbps)" detail="pic observé" :icon="Zap"/>
          <MetricCard card-class="activity-metric-card" label="Rendement stockage" :value="analytics.storage?.watch_hours_per_gb==null?'—':`${analytics.storage.watch_hours_per_gb} h/Go`" :detail="`${analytics.storage?.known_items||0} fichiers mesurés`" :icon="HardDrive"/>
        </MetricGrid>
        <div class="quality-grid">
          <BreakdownPanel title="Résolutions" eyebrow="Source" :items="resolutionBreakdown"/>
          <BreakdownPanel title="Codecs vidéo" eyebrow="Source" :items="codecBreakdown"/>
          <BreakdownPanel title="Causes de transcodage" eyebrow="Diagnostic" :items="transcodeReasonBreakdown"/>
          <BreakdownPanel title="Bande passante par utilisateur" eyebrow="Réseau" :items="bandwidthBreakdown"/>
        </div>
        <section class="panel compatibility-panel">
          <div class="panel-head"><div><span class="eyebrow">Compatibilité</span><h2>Appareils et lecteurs</h2></div></div>
          <div class="compatibility-table">
            <article v-for="device in analytics.quality?.devices||[]" :key="device.device">
              <MonitorPlay/><span><strong>{{ device.device }}</strong><small>{{ device.sessions }} sessions · {{ device.transcodes }} transcodages</small></span>
              <div><i :style="{width:`${device.compatibility_score}%`}"></i></div><em>{{ device.compatibility_score }} %</em>
            </article>
            <p v-if="!analytics.quality?.devices?.length" class="empty">Aucune donnée d'appareil.</p>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><div><span class="eyebrow">Diagnostic</span><h2>Derniers modes de lecture</h2></div></div>
          <div class="quality-list">
            <button v-for="item in data.history.slice(0,20)" :key="`${item.source}:${item.session_id}`" @click="selectedSession=item">
              <MediaArtwork :src="item.thumb_url" :alt="displayTitle(item)" :type="item.media_type" size="small"/>
              <span><strong>{{ displayTitle(item) }}</strong><small>{{ item.player||item.platform||'Plex' }} · {{ item.quality||'Auto' }}</small></span>
              <PlaybackMethodBadge :method="item.playback_method"/>
            </button>
            <p v-if="!data.history.length" class="empty">Aucune donnée de qualité sur cette période.</p>
          </div>
        </section>
      </template>

      <template v-else-if="currentView==='users'">
        <div class="user-cards">
          <article v-for="(user,index) in analyticsUsers" :key="user.name" class="panel user-card">
            <div class="user-avatar">{{ initials(user.name) }}</div>
            <div><h3>{{ user.name }}</h3><p>{{ user.sessions }} session{{ user.sessions>1?'s':'' }} sur {{ days }} jours</p></div>
            <strong>{{ formatDuration(user.watch_ms) }}</strong>
            <div class="user-share"><i :style="{width:`${userShare(user.sessions)}%`}"></i></div>
            <small>#{{ index+1 }} · {{ userShare(user.sessions) }} % des lectures · <b :class="{down:user.watch_change<0}">{{ signedPercent(user.watch_change) }}</b></small>
            <dl><div><dt>Média favori</dt><dd>{{ user.favorite_title||'—' }}</dd></div><div><dt>Appareil habituel</dt><dd>{{ user.favorite_device||'—' }}</dd></div><div><dt>Dernière activité</dt><dd>{{ formatDate(user.last_seen_at) }}</dd></div></dl>
          </article>
          <p v-if="!analytics.users?.length" class="panel empty">Aucun utilisateur actif sur cette période.</p>
        </div>
      </template>
    </template>

    <SessionDetailDrawer v-if="selectedSession" :session="selectedSession" @close="selectedSession=null"/>
      </div><!-- .psh-main -->
    </div><!-- .psh-layout -->
  </div>
</template>

<script setup lang="ts">
import { playbackMethodLabel } from '@/utils/labels';
import { formatBandwidth, formatDateTimeShort, formatDuration, signedPercent } from '@/utils/format';
import { computed,onMounted,ref,watch } from 'vue';
import { usePolling } from '@/composables/usePolling';
import { useRoute,useRouter } from 'vue-router';
import { Activity, CheckCircle2,CircleStop,Clock3,Cpu,Gauge,HardDrive,History,MonitorPlay,PlayCircle,Radio,Repeat2,Search,Timer,Tv,Users,Zap } from '@lucide/vue';
import { api } from '@/api';
import { readCacheEntry, writeCache } from '@/cache';
import { useRealtime } from '@/events';
import MetricCard from '@/components/ui/MetricCard.vue';
import MetricGrid from '@/components/ui/MetricGrid.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import ActivityHeatmap from '@/components/activity/ActivityHeatmap.vue';
import TabNav from '@/components/ui/TabNav.vue';
import BreakdownPanel from '@/components/activity/BreakdownPanel.vue';
import CompletionPanel from '@/components/activity/CompletionPanel.vue';
import ConcurrencyPanel from '@/components/activity/ConcurrencyPanel.vue';
import DailyActivityChart from '@/components/activity/DailyActivityChart.vue';
import HistoryTable from '@/components/activity/HistoryTable.vue';
import LiveSessionsPanel from '@/components/activity/LiveSessionsPanel.vue';
import MediaArtwork from '@/components/activity/MediaArtwork.vue';
import PlaybackMethodBadge from '@/components/activity/PlaybackMethodBadge.vue';
import PopularMediaPanel from '@/components/activity/PopularMediaPanel.vue';
import SessionDetailDrawer from '@/components/activity/SessionDetailDrawer.vue';
import UserRankingPanel from '@/components/activity/UserRankingPanel.vue';

const route=useRoute(),router=useRouter();
const allowedViews=['overview','live','history','stats','quality','users'];
const currentView=computed(()=>allowedViews.includes(String(route.query.view))?String(route.query.view):'overview');
const days=ref(Number(route.query.days)||30),loading=ref(false),loaded=ref(false),error=ref('');
const periodOptions = [7, 30, 90, 365].map(value => ({ value, label: `${value} j` }));
const data=ref<Record<string, any>>({active:[],liveEnabled:true,liveConfigured:true,history:[],daily:[],users:[],summary:{}});
const selectedSession=ref<any>(null),historySearch=ref(''),methodFilter=ref(''),typeFilter=ref(''),updatedAt=ref(Date.now()),clock=ref(Date.now());
const filtersOpen=ref(false);
const summary=computed(()=>data.value.summary||{});
const analytics=computed(()=>data.value.analytics||{});
const analyticsUsers=computed((): any[] =>analytics.value.users||[]);
const chart=computed(()=>data.value.daily||[]);
const activityTabs=computed(()=>[
  {value:'overview',label:'Vue d’ensemble'},
  {value:'live',label:'En direct',count:data.value.active.length},
  {value:'history',label:'Historique'},
  {value:'stats',label:'Statistiques'},
  {value:'quality',label:'Qualité'},
  {value:'users',label:'Utilisateurs'},
]);
const viewTitle=computed(()=>({overview:'Vue d’ensemble',live:'Activité en direct',history:'Historique des lectures',stats:'Statistiques',quality:'Qualité des flux',users:'Utilisateurs'} as Record<string, string>)[currentView.value]);
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
const filteredHistory=computed(()=>data.value.history.filter((item: any)=>{
  const needle=historySearch.value.trim().toLowerCase();
  const haystack=[displayTitle(item),item.user_name,item.player,item.product,item.platform,item.address,item.geo_city,item.geo_region,item.geo_country,item.geo_country_code].filter(Boolean).join(' ').toLowerCase();
  return (!needle||haystack.includes(needle))&&(!methodFilter.value||item.playback_method===methodFilter.value)&&(!typeFilter.value||item.media_type===typeFilter.value);
}));
const historyFilterCount=computed(()=>[historySearch.value,methodFilter.value,typeFilter.value].filter(Boolean).length);
const methodBreakdown=computed(()=>(analytics.value.quality?.methods||[]).map((item: any)=>({label:playbackMethodLabel(item.key,{fallback:item.key==='unknown'?'Inconnu':item.key}),value:item.count,suffix:` · ${item.rate} %`})));
const resolutionBreakdown=computed(()=>(analytics.value.quality?.resolutions||[]).map((item: any)=>({label:item.label,value:item.count})));
const codecBreakdown=computed(()=>(analytics.value.quality?.codecs||[]).map((item: any)=>({label:item.label,value:item.count})));
const transcodeReasonBreakdown=computed(()=>(analytics.value.quality?.transcode_reasons||[]).map((item: any)=>({label:item.label,value:item.count})));
const bandwidthBreakdown=computed(()=>(analytics.value.bandwidth?.by_user||[]).map((item: any)=>({label:item.name,value:Math.round(item.average_kbps/100)/10,suffix:' Mb/s',detail:`Pic ${formatBandwidth(item.peak_kbps)}`})));

// Seules les statistiques sont mises en cache, jamais les sessions `active` : repeindre
// une lecture « en cours » terminee depuis serait un contresens, alors qu'une tendance
// sur 30 jours vieille de quelques minutes reste juste.
const STATISTICS_CACHE_MAX_AGE_MS=6*60*60*1000;
const statisticsCacheKey=()=>`activity:statistics:${days.value}`;

function applySnapshot(snapshot: any,{savedAt=Date.now()}: {savedAt?: number}={}){
  data.value={
    ...snapshot,
    liveEnabled:snapshot.enabled ?? snapshot.liveEnabled ?? data.value.liveEnabled ?? true,
    liveConfigured:snapshot.configured ?? snapshot.liveConfigured ?? data.value.liveConfigured ?? true,
  };
  if(selectedSession.value){
    const candidates=[...(snapshot.active||[]),...(snapshot.history||[])];
    const fresh=candidates.find((item: any)=>item.source===selectedSession.value.source&&item.session_id===selectedSession.value.session_id);
    if(fresh)selectedSession.value=fresh;
  }
  loaded.value=true;
  updatedAt.value=savedAt;
}
function applyLive(snapshot: any): void {
  data.value={
    ...data.value,
    active:snapshot.active||[],
    liveEnabled:snapshot.enabled!==false,
    liveConfigured:snapshot.configured!==false,
  };
  if(selectedSession.value){
    const fresh=(snapshot.active||[]).find((item: any)=>item.source===selectedSession.value.source&&item.session_id===selectedSession.value.session_id);
    if(fresh)selectedSession.value=fresh;
  }
  updatedAt.value=Date.now();
}
function applyStatistics(snapshot: any,options?: {savedAt?: number}): void {applySnapshot({...snapshot,active:data.value.active||[]},options)}
function primeFromCache(): void {
  const entry=readCacheEntry(statisticsCacheKey(),{maxAgeMs:STATISTICS_CACHE_MAX_AGE_MS});
  if(entry)applyStatistics(entry.data,{savedAt:entry.savedAt});
}
async function loadLive(silent=true): Promise<void> {try{applyLive(await api('/api/playback/live'))}catch(e: any){if(!silent)error.value=e.message}}
async function loadStatistics(silent=true,refresh=false): Promise<void> {try{const statistics=await api(`/api/playback/statistics?days=${days.value}${refresh?'&refresh=true':''}`);applyStatistics(statistics);writeCache(statisticsCacheKey(),statistics)}catch(e: any){if(!silent)error.value=e.message}}
async function load(silent=false): Promise<void> {
  if(loading.value)return;
  if(!silent){loading.value=true;error.value=''}
  try{
    if(currentView.value==='live'){
      applyLive(await api('/api/playback/live'));
      loaded.value=true;
    }else{
      const [statistics,live]=await Promise.all([api(`/api/playback/statistics?days=${days.value}`),api('/api/playback/live')]);
      applyStatistics(statistics);writeCache(statisticsCacheKey(),statistics);applyLive(live);
    }
  }catch(e: any){if(!silent)error.value=e.message}
  finally{if(!silent)loading.value=false}
}
function setDays(value: number): void {days.value=value;router.replace({query:{...route.query,days:value===30?undefined:String(value)}});loadStatistics(false)}
function setPeriod(value: string | number): void { if (typeof value === 'number') setDays(value); }
function selectView(value: string): void {router.replace({path:'/activity',query:{view:value==='overview'?undefined:value,days:days.value===30?undefined:String(days.value)}})}
function resetHistoryFilters(): void {historySearch.value='';methodFilter.value='';typeFilter.value=''}
const formatDate=(value: string)=>formatDateTimeShort(value,'—');
function comparisonLabel(value: number): string {return `${signedPercent(value)} vs période précédente`}
function displayTitle(item: any): string {return item.grandparent_title?`${item.grandparent_title} · ${item.title}`:item.title}
function initials(name: string): string {return String(name||'?').split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()}
function userShare(sessions: number): number {return Math.round(Number(sessions||0)/Math.max(1,summary.value.sessions||0)*100)}
watch(()=>route.query.days,value=>{const next=Number(value)||30;if(next!==days.value){days.value=next;loadStatistics(false)}});
useRealtime(['activity.updated'],()=>currentView.value==='live'?loadLive():Promise.allSettled([loadLive(),loadStatistics()]));
// Horloge locale du libelle « actualise il y a N s » : doit tourner meme onglet masque,
// sinon l'age affiche au retour sur l'onglet est faux.
usePolling(()=>clock.value=Date.now(),1000,{whenVisible:false});
watch(currentView,(next,previous)=>{if(next===previous)return;if(next==='live')loadLive(false);else if(!data.value.history?.length)loadStatistics(false)});
onMounted(()=>{primeFromCache();load()});
</script>

<style scoped lang="scss">
.activity-title-tabs{margin:0}
.period-picker{display:flex;padding:2px;border:1px solid var(--border);border-radius:var(--radius-pill)}.period-picker button{border:0;border-radius:var(--radius-pill);background:transparent;color:var(--muted);padding:6px 9px}.period-picker button.active{background:var(--accent);color:#111}.activity-metrics{margin:0 0 14px}.overview-metrics{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap: var(--space-2)}.overview-metric-card{padding:12px!important;gap: var(--space-2)!important}.overview-metric-card :deep(svg){width:17px!important}.overview-metric-card :deep(strong){font-size:var(--fs-lg)!important;white-space:nowrap}.overview-metric-card :deep(span),.overview-metric-card :deep(small){font-size:10px!important}.activity-grid{display:grid;grid-template-columns:2fr 1fr;gap: var(--space-4);margin:14px 0}.analytics-secondary{grid-template-columns:1fr 1fr}.activity-page :deep(.heatmap-panel),.activity-page :deep(.popular-panel){margin-top:14px}.live-heading{display:flex;align-items:flex-end;justify-content:space-between;gap: var(--space-4);margin:8px 2px 16px}.live-heading h2{margin:6px 0 3px}.live-heading p,.live-updated{margin:0;color:var(--muted);font-size:var(--fs-xs)}.live-indicator{display:flex;align-items:center;gap: var(--space-2);color:#4ade80;font-size:var(--fs-xs);font-weight:700;text-transform:uppercase}.live-indicator i{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.12)}.search-field{display:flex;align-items:center;gap: var(--space-2);min-width:min(360px,100%);padding:0 11px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-2)}.search-field svg{width:15px;color:var(--muted)}.search-field input{width:100%;border:0;background:transparent}.quality-grid{display:grid;grid-template-columns:repeat(2,1fr);gap: var(--space-4);margin-bottom:14px}.compatibility-panel{margin-bottom:14px}.compatibility-table{display:grid;margin-top:10px}.compatibility-table article{display:grid;grid-template-columns:28px minmax(150px,1fr) minmax(100px,1fr) 50px;gap: var(--space-3);align-items:center;padding:10px 4px;border-bottom:1px solid var(--border)}.compatibility-table article>svg{width:18px;color:var(--muted)}.compatibility-table article>span{display:grid;min-width:0}.compatibility-table article small{color:var(--muted);font-size:var(--fs-xs)}.compatibility-table article>div{height:6px;overflow:hidden;border-radius:var(--radius-pill);background:rgba(255,255,255,.07)}.compatibility-table article>div i{display:block;height:100%;background:#4ade80}.compatibility-table em{color:#4ade80;font-size:var(--fs-xs);font-style:normal;text-align:right}.quality-list{display:grid;margin-top:10px}.quality-list button{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap: var(--space-3);align-items:center;width:100%;padding:9px;border:0;border-bottom:1px solid var(--border);background:transparent;color:var(--text);text-align:left}.quality-list button:hover{background:rgba(255,255,255,.025)}.quality-list button>span{display:grid;min-width:0}.quality-list strong,.quality-list small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.quality-list small{color:var(--muted);font-size:var(--fs-xs)}.binge-panel{margin-top:14px}.binge-panel .panel-head>small{color:var(--muted);font-size:var(--fs-xs)}.binge-list{display:grid;margin-top:10px}.binge-list article{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap: var(--space-3);align-items:center;padding:10px 2px;border-bottom:1px solid var(--border)}.binge-list article>svg{width:19px;color:var(--muted)}.binge-list article>span,.binge-list article>em{display:grid}.binge-list small,.binge-list em{color:var(--muted);font-size:var(--fs-xs);font-style:normal}.binge-list em{justify-items:end}.binge-list em>strong{color:var(--text)}.user-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap: var(--space-3)}.user-card{display:grid;grid-template-columns:46px minmax(0,1fr) auto;gap: var(--space-3);align-items:center}.user-avatar{display:grid;grid-row:1/3;place-items:center;width:46px;height:46px;border-radius:50%;background:rgba(229,160,13,.13);color:var(--accent);font-weight:800}.user-card h3,.user-card p{margin:0}.user-card p,.user-card small{color:var(--muted);font-size:var(--fs-xs)}.user-card>strong{color:var(--text)}.user-share{grid-column:2/4;height:5px;overflow:hidden;border-radius:var(--radius-pill);background:rgba(255,255,255,.08)}.user-share i{display:block;height:100%;border-radius:inherit;background:var(--accent)}.user-card>small{grid-column:2/4}.user-card>small b{color:#4ade80}.user-card>small b.down{color:#fb7185}.user-card dl{display:grid;grid-column:1/-1;grid-template-columns:repeat(3,1fr);gap: var(--space-2);margin:5px 0 0}.user-card dl>div{display:grid;gap: var(--space-1);padding:8px;border-radius:var(--radius-sm);background:var(--surface-2)}.user-card dt{color:var(--muted);font-size:var(--fs-xs);}.user-card dd{overflow:hidden;margin:0;font-size:var(--fs-xs);text-overflow:ellipsis;white-space:nowrap}@media(max-width:900px){.activity-grid,.analytics-secondary{grid-template-columns:1fr}}@media(max-width:700px){.quality-grid{grid-template-columns:1fr}.compatibility-table article{grid-template-columns:28px minmax(0,1fr) 44px}.compatibility-table article>div{grid-column:2}.compatibility-table em{grid-column:3;grid-row:2}}@media(max-width:540px){.period-picker{order:3}.live-heading{align-items:flex-start;flex-direction:column}.live-updated{display:none}.quality-list button{grid-template-columns:42px minmax(0,1fr)}.quality-list :deep(.playback-badge){grid-column:2}.user-card dl{grid-template-columns:1fr}}@media(max-width:480px){.overview-metrics{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media(max-width:767.98px){.quality-grid{grid-template-columns:1fr}.period-picker{order:3;max-width:100%;overflow-x:auto}.period-picker button,.quality-list button{min-height:44px}.live-heading{align-items:flex-start;flex-direction:column}.live-updated{display:none}.user-cards{grid-template-columns:1fr}}
</style>
