/* Activité : les données de la page (lectures en cours, statistiques de la période,
   historique) et ce qu'elles donnent a chaque gabarit : chiffres cles (Analyser), elements
   suivis (Suivre), evenements (Comprendre). La page ne fait qu'assembler. */
import { playbackMethodLabel } from '@/utils/labels';
import { formatBandwidth, formatDateTimeShort, formatDuration, signedPercent } from '@/utils/format';
import { computed, ref, watch } from 'vue';
import { refDebounced, useDebounceFn, useIntervalFn } from '@vueuse/core';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRoute, useRouter } from 'vue-router';
import { activitySections } from '@/navigation';
import { api } from '@/api';
import { readCacheEntry, writeCache } from '@/cache';
import { useRealtime } from '@/events';
import { queryKeys } from '@/queryKeys';
import { playbackLiveQuery } from '@/sharedQueries';
import { humanizeError } from '@/utils/apiError';
import { etatDeSerie, etatDeSurface, etatDeVoisins, ouvrirFiche } from '@/composables/useMediaOverlay';
import { episodeLabel } from '@/utils/episode';
import { usePreference } from '@/composables/usePreference';
import { exportHistoryCsv, foldPlaybackRuns, playbackDisplayTitle } from '@/activity/playbackRuns';
import { plexClientName } from '@/utils/plexClient';
import type { AnalyzeKpi } from '@/components/templates/analyze/types';
import type { TrackRecent } from '@/components/templates/track/types';
import type { UnderstandEvent, UnderstandOutcome } from '@/components/templates/understand/types';

export function useActivity() {
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
  const averageWatch=computed(()=>summary.value.sessions?Math.round((summary.value.watch_ms||0)/summary.value.sessions):0);
  const relativeUpdate=computed(()=>{const seconds=Math.max(0,Math.floor((clock.value-updatedAt.value)/1000));return seconds<5?'à l’instant':`il y a ${seconds} s`});
  /* L'historique ne vient plus de l'instantane d'activite -- borne a cent lignes toutes
     personnes confondues -- mais de son propre endpoint filtre et pagine. Filtrer cette
     fenetre-la donnait « les lectures d'Untel parmi les cent dernieres » au lieu de ses
     cent dernieres, sans que le compteur affiche ne le trahisse. */
  const HISTORY_PAGE_SIZE=100;
  /* L'ordre de la chronologie : les plus recentes d'abord, ou les plus anciennes. Il part au
     serveur, qui ordonne toute la periode et pas seulement la premiere page. */
  const historySort=ref('date_desc');
  interface HistoryPage {items?: any[]; total?: number; has_more?: boolean; facets?: {users?: string[]; devices?: string[]; servers?: Array<{id: number; name: string}>}}
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
    enabled:computed(()=>currentView.value==='history'||currentView.value==='live'),
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

  const historyUsers=computed(()=>history.value.facets.users);
  const historyDevices=computed(()=>history.value.facets.devices);
  /* Serveurs Plex ayant des lectures sur la periode : le filtre n'apparait qu'a partir de deux. */
  const historyServers=computed<any[]>(()=>(Array.isArray(history.value.facets?.servers)?history.value.facets.servers:[]));
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
  /* Les statistiques ne servent qu'aux trois vues d'analyse : le direct et l'historique ont les leurs. */
  const STATISTICS_VIEWS=['overview','quality','users'];
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
    enabled:computed(()=>STATISTICS_VIEWS.includes(currentView.value)),
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
  const loaded=computed(()=>currentView.value==='history'||Boolean(statisticsQuery.data.value)||(currentView.value==='live'&&Boolean(liveQuery.data.value)));
  const loading=computed(()=>liveQuery.isFetching.value||statisticsQuery.isFetching.value);
  const error=computed(()=>{
    const failure=(STATISTICS_VIEWS.includes(currentView.value)?statisticsQuery.error.value:null)||liveQuery.error.value;
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
    if(STATISTICS_VIEWS.includes(currentView.value))void statisticsQuery.refetch();
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
    if(currentView.value==='history')return history.value.items;
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
    void queryClient.invalidateQueries({queryKey:queryKeys.playback.live},{cancelRefetch:false});
    if(STATISTICS_VIEWS.includes(currentView.value))void queryClient.invalidateQueries({queryKey:['playback','statistics']},{cancelRefetch:false});
  },{refreshOnVisible:false});
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

  /* Les dernieres lectures terminees, sous le suivi, avant le lien vers l'historique complet. */
const liveRecent=computed((): TrackRecent[]=>{
  const surface=etatDeSurface(route.fullPath);
  const ids=history.value.items.map((row: any)=>row.id).filter((id: any)=>id!=null);
  return history.value.items.slice(0,5).map((row: any)=>({
    key:`recent-${sessionKey(row)}`,
    title:displayTitle(row),
    detail:[row.user_name,formatDate(row.started_at)].filter(Boolean).join(' · '),
    poster:row.thumb_url||null,
    to:row.id!=null?{path:`/activity/session/${row.id}`,state:{...surface,...etatDeVoisins(ids)}}:null,
  }));
});

/* L'historique (gabarit Comprendre) : une ligne par reprise repliee, avec son mode de
     lecture comme resultat. Un transcodage est un avertissement, la lecture directe un succes. */
  const historyRuns=computed(()=>foldPlaybackRuns(history.value.items));
  const METHOD_OUTCOME: Record<string, UnderstandOutcome>={direct_play:'success',direct_stream:'info',transcode:'warning',mixed:'warning'};
  const historyEvents=computed((): UnderstandEvent[]=>historyRuns.value.map((run)=>({
    key:run.key,
    at:run.item.started_at||'',
    outcome:METHOD_OUTCOME[run.method]||'info',
    title:`${playbackDisplayTitle(run.item)||'Lecture Plex'}${run.count>1?` ×${run.count}`:''}`,
    detail:[run.item.user_name||'Utilisateur Plex',run.count>1?`${run.count} lectures consécutives`:'',formatDuration(run.watchedMs)].filter(Boolean).join(' · '),
    tags:run.method?[playbackMethodLabel(run.method,{fallback:run.method==='mixed'?'Lecture mixte':run.method})]:[],
    context:plexClientName(run.item),
    poster:run.item.thumb_url||null,
  })));
  const historySummary=computed(()=>[{key:'total',label:history.value.total>1?'lectures sur la période':'lecture sur la période',value:String(history.value.total)}]);
  function openHistoryEvent(event: UnderstandEvent): void {
    const run=historyRuns.value.find((entry)=>entry.key===event.key);
    if(run)openSession(run.item,run.items);
  }
  function exportHistory(): void {exportHistoryCsv(historyRuns.value)}
  const METHOD_CHOICES=[{value:'',label:'Tous les modes'},{value:'direct_play',label:'Lecture directe'},{value:'direct_stream',label:'Conversion légère'},{value:'transcode',label:'Transcodage'}];

  /* Les chiffres cles (gabarit Analyser) : la tendance vient du serveur, qui compare a la
     periode precedente. */
  const periodChoices=periodOptions.map((option)=>({value:String(option.value),label:option.label}));
  const comparable=computed(()=>days.value<ALL_TIME_DAYS);
  const analyzeKpis=computed((): AnalyzeKpi[]=>{
    const plural=(count: number,word: string)=>`${count} ${word}${count>1?'s':''}`;
    if(currentView.value==='overview'){
      return [
        {key:'live',label:'En direct',value:String(liveSessions.value.length),detail:'lectures maintenant'},
        {key:'sessions',label:'Sessions',value:String(summary.value.sessions||0),detail:`sur ${periodLabel.value}`,change:analytics.value.comparison?.sessions_change},
        {key:'watch',label:'Temps regardé',value:formatDuration(summary.value.watch_ms),detail:'durée cumulée',change:analytics.value.comparison?.watch_change},
        {key:'transcode',label:'Transcodage',value:`${summary.value.transcode_rate||0} %`,detail:transcodeDetail.value},
        {key:'completed',label:'Terminées',value:String(analytics.value.engagement?.completed||0),detail:'seuil Tautulli ou générique'},
        {key:'abandoned',label:'Abandonnées',value:String(analytics.value.engagement?.abandoned||0),detail:'avant le premier quart du seuil'},
        {key:'resumed',label:'Reprises',value:String(analytics.value.engagement?.resumed||0),detail:'sessions regroupées'},
        {key:'rewatches',label:'Revisionnages',value:String(analytics.value.engagement?.rewatches||0),detail:'nouvelle lecture du même média'},
        {key:'average',label:'Durée moyenne',value:formatDuration(averageWatch.value),detail:'par session'},
      ];
    }
    if(currentView.value==='quality'){
      const transcodes=summary.value.transcodes||0;
      const light=summary.value.direct_streams||0;
      return [
        {key:'bandwidth',label:'Débit moyen',value:formatBandwidth(analytics.value.bandwidth?.average_kbps),detail:bandwidthCoverageLabel.value},
        {key:'p95',label:'Débit P95',value:formatBandwidth(analytics.value.bandwidth?.p95_kbps),detail:`95 % sous ce seuil · ${bandwidthMeasured.value} mesurées`},
        {key:'peak',label:'Débit maximal',value:formatBandwidth(analytics.value.bandwidth?.peak_kbps),detail:'pic observé'},
        {key:'transcode',label:'Transcodage',value:`${summary.value.transcode_rate||0} %`,detail:`${plural(transcodes,'session')} réencodée${transcodes>1?'s':''}`},
        {key:'light',label:'Conversion légère',value:`${summary.value.direct_stream_rate||0} %`,detail:`${plural(light,'session')} sans réencodage`},
        {key:'storage',label:'Rendement stockage',value:analytics.value.storage?.watch_hours_per_gb==null?'—':`${analytics.value.storage.watch_hours_per_gb} h/Go`,detail:`${analytics.value.storage?.known_items||0} fichiers mesurés`},
      ];
    }
    return [];
  });
  const pageState=computed(()=>loaded.value?'ready':error.value?'error':'loading');

  return {
    historySort,
    methodFilter,
    typeFilter,
    userFilter,
    deviceFilter,
    serverFilter,
    ALL_TIME_DAYS,
    EMPTY_STATISTICS,
    HISTORY_PAGE_SIZE,
    METHOD_CHOICES,
    STATISTICS_CACHE_MAX_AGE_MS,
    allowedViews,
    analytics,
    analyticsUsers,
    analyzeKpis,
    applyScope,
    averageWatch,
    bandwidthBreakdown,
    bandwidthCoverageLabel,
    bandwidthMeasured,
    chart,
    codecBreakdown,
    comparable,
    comparisonLabel,
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
    historyKey,
    historyLoadingMore,
    historyNeedle,
    historyParams,
    historyQuery,
    historyRuns,
    historySearch,
    historyServers,
    historySummary,
    historyUsers,
    knownUsers,
    liveQuery,
    liveSessions,
    liveRecent,
    load,
    loadHistory,
    loaded,
    loading,
    matchedUser,
    matches,
    methodBreakdown,
    methodCoverageRate,
    needle,
    openHistoryEvent,
    openSession,
    openUserScope,
    pageState,
    periodChoices,
    periodLabel,
    periodOptions,
    qualityCoverage,
    qualityHistory,
    queryClient,
    relativeUpdate,
    resetActivityFilters,
    resolutionBreakdown,
    route,
    scopedUser,
    searchPlaceholder,
    sections,
    sessionKey,
    setDays,
    setPeriod,
    siblingSessions,
    statisticsCacheKey,
    statisticsQuery,
    statisticsUrl,
    storedDays,
    summary,
    transcodeDetail,
    transcodeReasonBreakdown,
    trendOf,
    updatedAt,
    userShare,
    viewTitle,
  };
}
