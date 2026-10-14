/* Activité : statistiques de la periode et lectures en cours, leur etat de chargement et
   leur rafraichissement en direct. */
import { computed, watch, type Ref } from 'vue';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import { readCacheEntry, writeCache } from '@/cache';
import { useRealtime } from '@/events';
import { queryKeys } from '@/queryKeys';
import { playbackLiveQuery } from '@/sharedQueries';
import { humanizeError } from '@/utils/apiError';
import { STATISTICS_VIEWS } from './activityViews';

// Seules les statistiques sont mises en cache, jamais les sessions `active` : repeindre
// une lecture « en cours » terminee depuis serait un contresens, alors qu'une tendance
// sur 30 jours vieille de quelques minutes reste juste.
export const STATISTICS_CACHE_MAX_AGE_MS=6*60*60*1000;
export const EMPTY_STATISTICS={history:[],daily:[],users:[],summary:{}};

interface StatisticsScope {
  days: Ref<number>;
  scopedUser: Ref<string>;
  currentView: Ref<string>;
  /** Noms connus hors perimetre, rafraichis a chaque reponse non restreinte. */
  knownUsers: Ref<string[]>;
}

export function useActivityStatistics({days,scopedUser,currentView,knownUsers}: StatisticsScope) {
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
    enabled:computed(()=>STATISTICS_VIEWS.includes(currentView.value)),
  });
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
  useRealtime(['activity.updated'],()=>{
    void queryClient.invalidateQueries({queryKey:queryKeys.playback.live},{cancelRefetch:false});
    if(STATISTICS_VIEWS.includes(currentView.value))void queryClient.invalidateQueries({queryKey:['playback','statistics']},{cancelRefetch:false});
  },{refreshOnVisible:false});

  return {
    queryClient, liveQuery, statisticsQuery, statisticsCacheKey, statisticsUrl,
    data, loaded, loading, error, updatedAt, load,
  };
}
