/* Activité : les données de la page (lectures en cours, statistiques de la période,
   historique) et ce qu'elles donnent a chaque gabarit : chiffres cles (Analyser), elements
   suivis (Suivre), evenements (Comprendre). La page ne fait qu'assembler.
   Les morceaux vivent dans `composables/activity/` : periode, vues, historique, statistiques,
   qualite, chiffres cles ; ce point d'entree les relie. */
import { formatDateTimeShort } from '@/utils/format';
import { computed, ref, watch } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';
import { useDebounceFn, useIntervalFn } from '@vueuse/core';
import { useRoute, useRouter } from 'vue-router';
import { activitySections } from '@/navigation';
import { etatDeSerie, etatDeVoisins, ouvrirFiche } from '@/composables/useMediaOverlay';
import { episodeLabel } from '@/utils/episode';
import { usePreference } from '@/composables/usePreference';
import type { UnderstandEvent } from '@/components/templates/understand/types';
import { ALL_TIME_DAYS, comparisonLabel, periodChoices, periodLabelOf, periodOptions, trendOf } from './activity/activityPeriod';
import { SEARCH_PLACEHOLDERS, VIEW_TITLES, allowedViews, displayTitle, sessionKey } from './activity/activityViews';
import { METHOD_CHOICES } from './activity/historyEvents';
import { activityKpis } from './activity/activityKpis';
import { HISTORY_PAGE_SIZE, useActivityHistory } from './activity/useActivityHistory';
import { EMPTY_STATISTICS, STATISTICS_CACHE_MAX_AGE_MS, useActivityStatistics } from './activity/useActivityStatistics';
import { useActivityQuality } from './activity/useActivityQuality';

export function useActivity() {
  const route=useRoute(),router=useRouter();
  const currentView=computed(()=>allowedViews.includes(String(route.query.view))?String(route.query.view):'overview');
  // La periode ne vit plus que dans l'URL : les sections de la destination (rail, barre
  // de contexte, page) pointent vers `/activity?view=...` sans la porter, et sans memoire
  // locale chaque changement de vue serait retombe sur 30 jours.
  const storedDays=usePreference('activity.days',30);
  const days=ref(Number(route.query.days)||storedDays.value);
  const periodLabel=computed(()=>periodLabelOf(days.value));
  const clock=ref(Date.now());

  const historyState=useActivityHistory(days,currentView);
  const {historySearch,history}=historyState;

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
  const searchPlaceholder=computed(()=>SEARCH_PLACEHOLDERS[currentView.value] || 'Filtrer');

  const statisticsState=useActivityStatistics({days,scopedUser,currentView,knownUsers});
  const {data,loaded,error,updatedAt}=statisticsState;
  const summary=computed(()=>data.value.summary||{});
  const analytics=computed(()=>data.value.analytics||{});
  const analyticsUsers=computed((): any[] =>analytics.value.users||[]);
  // Les sections de la destination sont reprises telles quelles, la vue « En direct »
  // portant en plus le nombre de lectures en cours.
  const sections=computed(()=>activitySections().map(section=>section.key==='live'?{...section,count:data.value.active.length}:section));
  const chart=computed(()=>data.value.daily||[]);
  const quality=useActivityQuality(analytics,summary);

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
  const viewTitle=computed(()=>VIEW_TITLES[currentView.value]);
  const averageWatch=computed(()=>summary.value.sessions?Math.round((summary.value.watch_ms||0)/summary.value.sessions):0);
  const relativeUpdate=computed(()=>{const seconds=Math.max(0,Math.floor((clock.value-updatedAt.value)/1000));return seconds<5?'à l’instant':`il y a ${seconds} s`});
  function openUserScope(name: string): void {
    historySearch.value=name;
    router.replace({path:'/activity',query:{...route.query,view:undefined}});
  }

  function setDays(value: number): void {days.value=value;storedDays.value=value;router.replace({query:{...route.query,days:value===30?undefined:String(value)}})}
  function setPeriod(value: string | number): void { if (typeof value === 'number') setDays(value); }
  const formatDate=(value: string)=>formatDateTimeShort(value,'—');
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
  const queryClient = useQueryClient();
  function openSession(item: any, run: any[]=[]): void {
    if(item?.id==null)return;
    const seed = (s: any) => {
      if (!s || s.id == null) return;
      queryClient.setQueryData(['playback', 'session', String(s.id)], (old: any) => old ?? {
        ...s,
        media: s.media || {
          poster_url: s.thumb_url,
          summary: s.summary,
        },
      });
    };
    seed(item);
    const lectures=run.filter((row: any)=>row?.id!=null);
    for (const other of lectures) seed(other);
    const ids=siblingSessions.value.map((row: any)=>row.id).filter((id: any)=>id!=null);
    const serie=lectures.length>1?etatDeSerie([...lectures].sort((a: any,b: any)=>String(a.started_at||'').localeCompare(String(b.started_at||''))).map((row: any)=>({
      id:String(row.id),
      method:row.playback_method||'',
      started_at:row.started_at||'',
      watched_ms:row.watched_ms||0,
      label:row.media_type==='episode'&&(row.season_number!=null||row.episode_number!=null)?`${episodeLabel(row)} · ${row.title||''}`:row.title||'Lecture Plex',
    }))):{};
    ouvrirFiche(router,`/activity/session/${item.id}`,route.fullPath,{...etatDeVoisins(ids),...serie});
  }
  function openHistoryEvent(event: UnderstandEvent): void {
    const run=historyState.historyRuns.value.find((entry)=>entry.key===event.key);
    if(run)openSession(run.item,run.items);
  }
  function userShare(sessions: number): number {return Math.round(Number(sessions||0)/Math.max(1,summary.value.sessions||0)*100)}
  watch(()=>route.query.days,value=>{const next=Number(value)||days.value;if(next!==days.value)days.value=next});
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

  const comparable=computed(()=>days.value<ALL_TIME_DAYS);
  const analyzeKpis=computed(()=>activityKpis({
    view:currentView.value,
    summary:summary.value,
    analytics:analytics.value,
    liveCount:liveSessions.value.length,
    periodLabel:periodLabel.value,
    averageWatch:averageWatch.value,
    transcodeDetail:quality.transcodeDetail.value,
    bandwidthCoverageLabel:quality.bandwidthCoverageLabel.value,
    bandwidthMeasured:quality.bandwidthMeasured.value,
  }));
  const pageState=computed(()=>loaded.value?'ready':error.value?'error':'loading');

  return {
    ...historyState,
    ...statisticsState,
    ...quality,
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
    chart,
    comparable,
    comparisonLabel,
    currentView,
    days,
    displayTitle,
    filterCounts,
    filteredAnalyticsUsers,
    formatDate,
    knownUsers,
    liveSessions,
    matchedUser,
    matches,
    needle,
    openHistoryEvent,
    openSession,
    openUserScope,
    pageState,
    periodChoices,
    periodLabel,
    periodOptions,
    qualityHistory,
    relativeUpdate,
    route,
    scopedUser,
    searchPlaceholder,
    sections,
    sessionKey,
    setDays,
    setPeriod,
    siblingSessions,
    storedDays,
    summary,
    trendOf,
    userShare,
    viewTitle,
  };
}
