/* Activité : l'historique des lectures (recherche, filtres, tri, pages) et sa chronologie
   pour le gabarit Comprendre. */
import { computed, ref, type Ref } from 'vue';
import { refDebounced } from '@vueuse/core';
import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import { readCacheEntry, writeCache } from '@/cache';
import { useRealtime } from '@/events';
import { exportHistoryCsv, foldPlaybackRuns } from '@/activity/playbackRuns';
import type { UnderstandEvent } from '@/components/templates/understand/types';
import { historyEventOf } from './historyEvents';

interface HistoryPage {items?: any[]; total?: number; has_more?: boolean; facets?: {users?: string[]; devices?: string[]; servers?: Array<{id: number; name: string}>}}

/* L'historique ne vient plus de l'instantane d'activite -- borne a cent lignes toutes
   personnes confondues -- mais de son propre endpoint filtre et pagine. Filtrer cette
   fenetre-la donnait « les lectures d'Untel parmi les cent dernieres » au lieu de ses
   cent dernieres, sans que le compteur affiche ne le trahisse. */
export const HISTORY_PAGE_SIZE=100;
const HISTORY_CACHE_MAX_AGE_MS=6*60*60*1000;

export function useActivityHistory(days: Ref<number>, currentView: Ref<string>) {
  const queryClient = useQueryClient();
  const historySearch=ref(''),methodFilter=ref(''),typeFilter=ref(''),userFilter=ref(''),deviceFilter=ref(''),serverFilter=ref('');
  /* L'ordre de la chronologie : les plus recentes d'abord, ou les plus anciennes. Il part au
     serveur, qui ordonne toute la periode et pas seulement la premiere page. */
  const historySort=ref('date_desc');
  // La recherche part en base apres une pause de saisie ; les listes deroulantes, la periode
  // et le tri immediatement. Tous font partie de la cle : en changer annule la lecture en
  // cours et repart de la premiere page, ce que faisait `useLatestRequest` a la main.
  const historyNeedle=refDebounced(computed(()=>historySearch.value.trim()),250);
  const historyKey=computed(()=>({days:days.value,sort:historySort.value,query:historyNeedle.value,method:methodFilter.value,mediaType:typeFilter.value,user:userFilter.value,device:deviceFilter.value,server:serverFilter.value}));

  const isDefaultView = computed(() =>
    !historyNeedle.value &&
    !methodFilter.value &&
    !typeFilter.value &&
    !userFilter.value &&
    !deviceFilter.value &&
    !serverFilter.value
  );

  const historyCacheKey = () => `activity:history:${days.value}:${historySort.value}`;

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
    queryFn:async({pageParam,signal})=>{
      const page = await api<HistoryPage>(`/api/playback/history?${historyParams(pageParam)}`,{signal});
      if (pageParam === 0 && isDefaultView.value) {
        writeCache(historyCacheKey(), page);
      }
      return page;
    },
    initialPageParam:0,
    getNextPageParam:(last: HistoryPage,pages: HistoryPage[])=>last.has_more?pages.reduce((sum,page)=>sum+(page.items?.length||0),0):undefined,
    initialData:() => {
      if (!isDefaultView.value) return undefined;
      const cached = readCacheEntry<HistoryPage>(historyCacheKey(), { maxAgeMs: HISTORY_CACHE_MAX_AGE_MS });
      return cached?.data ? { pages: [cached.data], pageParams: [0] } : undefined;
    },
    initialDataUpdatedAt:() => {
      if (!isDefaultView.value) return undefined;
      return readCacheEntry<HistoryPage>(historyCacheKey(), { maxAgeMs: HISTORY_CACHE_MAX_AGE_MS })?.savedAt;
    },
    enabled:computed(()=>currentView.value==='history'||currentView.value==='live'),
    placeholderData:keepPreviousData,
    staleTime:30_000,
  });

  useRealtime(['activity.updated'], () => {
    if (currentView.value === 'history') {
      void queryClient.invalidateQueries({ queryKey: ['activity', 'history'] }, { cancelRefetch: false });
    }
  }, { refreshOnVisible: false });
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
  function resetActivityFilters(): void {historySearch.value='';methodFilter.value='';typeFilter.value='';userFilter.value='';deviceFilter.value='';serverFilter.value=''}

  const historyRuns=computed(()=>foldPlaybackRuns(history.value.items));
  const historyEvents=computed((): UnderstandEvent[]=>historyRuns.value.map(historyEventOf));
  const historySummary=computed(()=>[{key:'total',label:history.value.total>1?'lectures sur la période':'lecture sur la période',value:String(history.value.total)}]);
  function exportHistory(): void {exportHistoryCsv(historyRuns.value)}

  return {
    historySearch, methodFilter, typeFilter, userFilter, deviceFilter, serverFilter, historySort,
    historyNeedle, historyKey, historyParams, historyQuery, history, historyError, historyLoadingMore, loadHistory,
    historyUsers, historyDevices, historyServers, historyFilterCount, resetActivityFilters,
    historyRuns, historyEvents, historySummary, exportHistory,
  };
}
