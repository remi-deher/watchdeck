import type { MediaDetailResponse } from "@/types/generated/mediaAvailability";
import { isMusicType } from '@/utils/labels';
import { humanizeError } from '@/utils/apiError';
import { computed, reactive, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { queryKeys } from '@/queryKeys';
import { useRoute, useRouter } from "vue-router";
import { api, ApiError } from "@/api";
import { useToast } from "@/composables/useToast";
import { mediaDetailPath } from "@/mediaUrl";
import { proxyUrl } from '@/utils/mediaImage';
import { usePosterTint } from '@/composables/usePosterTint';
import { useMediaOverlay, useOuvrirFiche } from '@/composables/useMediaOverlay';
import { apercuRecent } from "@/composables/useFicheApercu";
import { useFileflowsConfigured } from '@/composables/useFileflows';
import { useConfirm } from "@/composables/useConfirm";
import { canModerateSession, loadSession } from "@/composables/useSession";
import { useSeasonEpisodes } from "@/composables/useSeasonEpisodes";
import { useRequestActions } from "@/composables/useRequestActions";
import { useDirectMediaRequest } from "@/composables/useDirectMediaRequest";
import { patchedAll } from '@/composables/useRealtimeQuery';

/* Tout ce que sait la fiche d'un media : ses requetes, ses actions (demande, correction, incident,
   import) et l'etat des fenetres. La page assemble les onglets. */
export function useMediaDetail() {
  const route = useRoute();
  const router = useRouter();
  const { actif: enSurface } = useMediaOverlay();
  // La recherche interactive s'ouvre dans la feuille, par-dessus la meme page de fond.
  const { ouvrir: ouvrirReleases } = useOuvrirFiche();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const kind = computed(() => String(route.params.kind || ''));
  const mediaId = computed(() => String(route.params.id || ''));
  // La fiche decouverte depend aussi du type de media et de l'espace d'identifiants.
  // TMDB/TVDB et films/series peuvent partager le meme identifiant numerique.
  const mediaQueryKey = computed(() => [
    'media',
    kind.value,
    mediaId.value,
    String(route.query.media_type || ''),
    String(route.query.id_type || ''),
  ] as const);

  const {
    requesting: recRequesting,
    requestMedia: requestRecMedia,
    optionsDialog: recOptionsDialog,
    confirmOptions: confirmRecOptions,
    cancelOptions: cancelRecOptions,
  } = useDirectMediaRequest({
    onUpdated: (changed: any, update: any) => {
      const change = { ...changed, ...update };
      queryClient.setQueryData<any>(mediaQueryKey.value, (current: any) => current && ({
        ...current,
        recommendations: patchedAll(current.recommendations || [], change, ['tmdb_id', 'id']).list,
        similar: patchedAll(current.similar || [], change, ['tmdb_id', 'id']).list,
      }));
    },
  });

  const busy = ref(false), actionError = ref(''), successMessage = ref(''), tab = ref('summary');
  /* Reussites et echecs d'une action passent par des notifications, pas par un bandeau dans la fiche. */
  watch(successMessage, (message) => { if (message) { addToast({ type: 'success', title: message }); successMessage.value = ''; } });
  watch(actionError, (message) => { if (message) addToast({ type: 'error', title: 'Action impossible', message }); });
  const showRequestOptions = ref(false);
  const requestForm = reactive<{ plex_user_id: string; root_folder: string; seasons: number[] }>({ plex_user_id: '', root_folder: '', seasons: [] });
  const isMusic = computed(() => isMusicType(detail.value?.media_type));
  const artistAlbums = computed(() => detail.value?.albums || []);
  const albumTracks = computed(() => detail.value?.tracks || []);
  const tabs = computed(() => {
    if (isMusic.value) return [];
    if (kind.value === 'discover') return ['summary'];
    return [
      'summary',
      ...(detail.value?.media_type === 'show' ? ['missing'] : []),
      'audio',
      'requests',
      'calendar',
      ...(fileflowsConfigured.value && libraryItemId.value ? ['encoding'] : []),
    ];
  });
  /* Les parties dont la page fournit le contenu : celles des onglets, ou la seule du catalogue d'un artiste. */
  const slotTabs = computed(() => (!detail.value ? [] : isMusic.value ? ['main'] : tabs.value));
  const mediaTabItems = computed(() => tabs.value.map((key) => ({ key, label: tabLabel(key) })));
  const admin = ref(false);
  const sessionUserId = ref('');
  const requestLabel = computed(() => (detail.value?.media_type === 'show' ? 'Demander la série' : 'Demander ce film'));
  async function handleRequestClick(): Promise<void> {
    if (admin.value || (detail.value?.media_type === 'show' && seasonNumbers.value.length > 1)) {
      showRequestOptions.value = true;
    } else {
      await submitRequest();
    }
  }

  const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();

  const showIssueForm = ref(false), showCorrectionForm = ref(false);
  const correctionForm = reactive<Record<string, any>>({ scope: 'media', season_number: null, episode_number: null, recipient_user_ids: [], corrections: [], note: '' });
  const newRequesterId = ref('');

  const inDiscoverShell = computed(() => route.path.startsWith('/discover/'));

  const statusLabel = computed(() => detail.value?.operational_status_label || (detail.value?.available || detail.value?.in_library ? 'Disponible' : detail.value?.requested ? 'Déjà demandé' : detail.value?.request_status || ''));
  const statusClass = computed(() => detail.value?.available || detail.value?.in_library ? 'available' : 'pending');
  const isInPlex = computed(() => Boolean(detail.value?.library_id || detail.value?.in_library));
  const seasonNumbers = computed(() => Array.from({ length: Number(detail.value?.number_of_seasons || 0) + 1 }, (_, i) => i));
  const addableUsers = computed(() => {
    const already = new Set((detail.value?.requests || []).flatMap((row: any) => row.requester_ids || [row.plex_user_id]));
    return users.value.filter((u: any) => !already.has(u.plex_user_id));
  });

  const releaseSourceType = computed(() => {
    if (detail.value?.vf_source_type === 'library' || detail.value?.library_id || detail.value?._kind === 'library' || kind.value === 'library') {
      return 'library_item';
    }
    if (detail.value?.vf_source_type === 'request' || detail.value?.request_id || detail.value?._kind === 'request' || kind.value === 'request') {
      return 'request';
    }
    return null;
  });

  /* Element de bibliotheque du media (FileFlows ne connait que des fichiers presents). */
  const libraryItemId = computed<number | null>(() => {
    if (detail.value?.library_id) return Number(detail.value.library_id);
    if (detail.value?._kind === 'library' && detail.value?.id) return Number(detail.value.id);
    if (kind.value === 'library' && route.params.id) return Number(route.params.id);
    return null;
  });
  const fileflowsConfigured = useFileflowsConfigured(admin);

  const releaseSourceId = computed(() => {
    if (detail.value?.vf_source_id) return Number(detail.value.vf_source_id);
    if (detail.value?.library_id) return Number(detail.value.library_id);
    if (detail.value?._kind === 'library' && detail.value?.id) return Number(detail.value.id);
    if (detail.value?.request_id) return Number(detail.value.request_id);
    if (detail.value?._kind === 'request' && detail.value?.id) return Number(detail.value.id);
    if (kind.value === 'library' && route.params.id) return Number(route.params.id);
    if (kind.value === 'request' && route.params.id) return Number(route.params.id);
    return null;
  });

  const seasons = useSeasonEpisodes(() => {
    const media = detail.value?.media || detail.value;
    const sType = media?.vf_source_type === 'library' || media?.library_id || kind.value === 'library' ? 'library' : 'requests';
    const sId = media?.vf_source_id || media?.library_id || (kind.value === 'library' ? route.params.id : null) || media?.request_id || (kind.value === 'request' ? route.params.id : null);
    if (!sId) return null;
    return {
      source: sType,
      id: Number(sId),
      mediaType: detail.value?.media_type,
    };
  });
  const mergedVfDetail = seasons.detail;
  const seasonSummary = seasons.seasonSummary;
  const { envelopeError, availabilityError, vfStatusError } = seasons;

  const invalidateMedia = () => queryClient.invalidateQueries({ queryKey: mediaQueryKey.value });
  const autoImportMutation = useMutation({
    mutationFn: ({ id, value }: { id: number; value: boolean | null }) => api(`/api/requests/${id}/auto-import`, {
      method: 'PUT', body: JSON.stringify({ auto_import_reconciliation: value }),
    }),
    retry: 0,
    onSuccess: invalidateMedia,
  });
  const recheckMutation = useMutation({
    mutationFn: (path: string) => api(path, { method: 'POST' }), retry: 0, onSuccess: invalidateMedia,
  });
  const issueMutation = useMutation({
    mutationFn: (body: Record<string, any>) => api('/api/media/issues', { method: 'POST', body: JSON.stringify(body) }),
    retry: 0, onSuccess: invalidateMedia,
  });
  const correctionMutation = useMutation({
    mutationFn: (body: Record<string, any>) => api('/api/media/send-correction', { method: 'POST', body: JSON.stringify(body) }),
    retry: 0, onSuccess: invalidateMedia,
  });

  function tabLabel(value: string): string {
    const audioLabel = detail.value?.media_type === 'show' ? 'Saisons & épisodes' : 'Pistes & langues';
    return ({ summary: 'Résumé', missing: 'Éléments manquants', audio: audioLabel, requests: 'Demandes', calendar: 'Calendrier', encoding: 'Encodage' } as Record<string, string>)[value];
  }

  function mediaPathFor(key: readonly [string, string, string, string, string], core = false): string {
    const [, routeKind, id, mediaType, idType] = key;
    if (routeKind === 'discover') {
      const p = new URLSearchParams();
      p.set('media_type', mediaType);
      if (idType === 'tvdb') p.set('tvdb_id', id); else p.set('tmdb_id', id);
      return `/api/discover/detail?${p}`;
    }
    if (routeKind === 'request') return `/api/media/detail?request_id=${id}${core ? '&core=true' : ''}`;
    return `/api/media/detail?library_id=${id}${core ? '&core=true' : ''}`;
  }

  const mediaQuery = useQuery({
    queryKey: mediaQueryKey,
    queryFn: async ({ queryKey }) => {
      const [, routeKind] = queryKey;
      const path = mediaPathFor(queryKey);
      if (routeKind === 'discover') return api(path);
      const payload = await api<MediaDetailResponse>(path);
      return { ...payload.media, ...payload };
    },
    staleTime: 60_000,
    // Afficher le cache tout de suite, puis le revalider à chaque réouverture : une fiche
    // partielle due à une panne temporaire d'un enrichissement ne reste pas figée en cache.
    refetchOnMount: 'always',
  });
  const detail = computed<any>(() => mediaQuery.data.value || null);
  const loading = computed(() => mediaQuery.isPending.value || mediaQuery.isFetching.value);
  /* Seul le PREMIER chargement remplace le contenu : un rafraichissement en arriere-plan
     (retour sur l'onglet, evenement temps reel) laissait auparavant la fiche entiere
     disparaitre derriere un « Chargement » le temps d'une requete. */
  const pending = computed(() => mediaQuery.isPending.value);
  // Ce que la carte touchee savait deja, pour dessiner la fiche avant sa reponse.
  const apercu = apercuRecent();

  /* Le prélèvement de couleur dessine l'affiche dans un canvas : passer par le proxy même
     pour TMDB évite de dépendre de ses en-têtes CORS et réutilise le cache d'images local. */
  const posterSrc = computed(() => {
    const source = (detail.value || apercu)?.poster_url;
    return source ? proxyUrl(source, { width: 780, forceProxy: true }) : null;
  });
  const tint = usePosterTint(() => posterSrc.value);
  const tintStyle = computed(() => (tint.value && posterSrc.value
    ? { '--poster-tint': tint.value, '--poster-image': `url("${posterSrc.value}")` }
    : undefined));
  const error = computed({
    get: () => actionError.value || (mediaQuery.error.value as Error | null)?.message || '',
    set: (value: string) => { actionError.value = value; },
  });

  const usersQuery = useQuery({
    queryKey: queryKeys.users.list,
    queryFn: () => api<any[]>('/api/users'),
    enabled: computed(() => showCorrectionForm.value || tab.value === 'requests'),
  });
  const correctionOptionsQuery = useQuery({
    queryKey: ['media', 'corrections', 'options'],
    queryFn: () => api<any[]>('/api/media/corrections/options'),
    enabled: showCorrectionForm,
    staleTime: 5 * 60_000,
  });
  const users = computed(() => usersQuery.data.value || []);
  const correctionOptions = computed(() => correctionOptionsQuery.data.value || []);

  const requestOptionsEnabled = computed(() => showRequestOptions.value && admin.value && kind.value === 'discover');
  const requestersQuery = useQuery({
    queryKey: ['discover', 'requesters'],
    queryFn: () => api<any[]>('/api/discover/requesters'),
    enabled: requestOptionsEnabled,
    staleTime: 60_000,
  });
  const requestService = computed(() => detail.value?.media_type === 'show' ? 'sonarr' : 'radarr');
  const foldersQuery = useQuery({
    queryKey: computed(() => ['discover', requestService.value, 'folders']),
    queryFn: () => api<any[]>(`/api/${requestService.value}/folders`).catch(() => []),
    enabled: requestOptionsEnabled,
    staleTime: 60_000,
  });
  const requesters = computed(() => requestersQuery.data.value || []);
  const folders = computed(() => foldersQuery.data.value || []);

  async function loadAdminFlag(): Promise<void> {
    admin.value = canModerateSession(await loadSession());
  }

  async function load(): Promise<void> {
    actionError.value = '';
    await mediaQuery.refetch();
  }

  function triggerBackgroundVfRescan(initialLoad: Promise<any>): void {
    initialLoad
      .then(() => {
        if (!isInPlex.value) return;
        return seasons.rescan();
      })
      .catch((e: any) => {
        if (e instanceof ApiError && e.status === 410) leaveRemovedMedia(e.message);
      });
  }

  const {
    requestAction, rejectRequest, closeRequest, resendMail, notifyUser,
    addRequester, catchUpAll, promoteRequester, removeRequester, deleteRequest, withdrawRequest,
  } = useRequestActions({
    detail, newRequesterId, askConfirm, busy, error,
    reload: () => queryClient.invalidateQueries({ queryKey: mediaQueryKey.value }),
    onDeleted: () => router.push('/library'),
    askReason: (row) => askWithdrawReason(row),
  });

  /* Le motif d'annulation se choisit dans la liste partagee : la promesse n'est tenue
     qu'une fois la modale refermee, ce qui laisse l'action attendre la reponse. */
  const withdrawTarget = ref<any | null>(null);
  let resolveReason: ((value: string | null) => void) | null = null;
  function askWithdrawReason(row: any): Promise<string | null> {
    withdrawTarget.value = row;
    return new Promise((resolve) => { resolveReason = resolve; });
  }
  function settleReason(value: string | null): void {
    withdrawTarget.value = null;
    resolveReason?.(value);
    resolveReason = null;
  }

  /* Surcharge par media du rapprochement automatique : `null` remet la demande sous le
     reglage global, ce qui n'est pas la meme chose que « desactive ». */
  async function setAutoImport(row: any, value: boolean | null): Promise<void> {
    busy.value = true;
    try {
      await autoImportMutation.mutateAsync({ id: row.id, value });
    } catch (e: any) {
      error.value = humanizeError(e);
    } finally {
      busy.value = false;
    }
  }

  function goBack(): void {
    if (window.history.state?.back) router.back();
    else router.push(inDiscoverShell.value ? '/discover' : '/library');
  }

  /* Recommandations et saga viennent de TMDB (mode Decouvrir), mais le catalogue d'un
     artiste renvoie des elements de bibliotheque : leur `_kind` doit primer, sinon l'id de
     bibliotheque d'un album etait pris pour un id TMDB (fiche cassee, libelle « Film »). */
  function relatedMediaPath(item: any): string {
    const kind = item._kind || (item.library_id ? 'library' : item.request_id ? 'request' : 'discover');
    return mediaDetailPath(item, kind, { discover: inDiscoverShell.value });
  }

  function openDetail(item: any): void {
    const path = relatedMediaPath(item);
    if (path) router.push(path);
  }

  async function openCorrection(scope: string, season: number | null, episode: number | null): Promise<void> {
    showCorrectionForm.value = true;
    await Promise.all([usersQuery.refetch(), correctionOptionsQuery.refetch()]).catch(() => {});
    correctionForm.scope = scope;
    correctionForm.season_number = season;
    correctionForm.episode_number = episode;
    const reqIds = (detail.value?.requests || []).map((r: any) => r.plex_user_id);
    correctionForm.recipient_user_ids = users.value.filter((u: any) => reqIds.includes(u.plex_user_id)).map((u: any) => u.id);
    showIssueForm.value = false;
  }

  async function submitRequest(): Promise<void> {
    busy.value = true;
    error.value = '';
    try {
      const data = await api('/api/media/add', {
        method: 'POST',
        body: JSON.stringify({
          title: detail.value.title,
          year: detail.value.year,
          media_type: detail.value.media_type,
          tmdb_id: detail.value.tmdb_id,
          tvdb_id: detail.value.tvdb_id,
          imdb_id: detail.value.imdb_id,
          poster_url: detail.value.poster_url,
          overview: detail.value.overview,
          plex_user_id: requestForm.plex_user_id || sessionUserId.value,
          root_folder: requestForm.root_folder || null,
          seasons: detail.value.media_type === 'show' ? requestForm.seasons : null,
          auto_search: true,
        }),
      });
      successMessage.value = data.already_existed
        ? `${detail.value.title} était déjà demandé.`
        : `Demande envoyée pour ${detail.value.title}.`;
      if (data.request_id) {
        const nextPath = inDiscoverShell.value
          ? `/discover/media/request/${data.request_id}`
          : `/library/media/request/${data.request_id}`;
        router.replace(nextPath);
      } else {
        await queryClient.invalidateQueries({ queryKey: mediaQueryKey.value });
      }
    } catch (e: any) {
      error.value = e.message;
    } finally {
      busy.value = false;
    }
  }

  /** Le média n'est plus dans Plex et le serveur vient de le retirer : la fiche n'existe plus. */
  function leaveRemovedMedia(message: string): void {
    addToast({ type: 'info', title: 'Média retiré', message, duration: 8000 });
    queryClient.invalidateQueries({ queryKey: ['library'] });
    router.push(inDiscoverShell.value ? '/discover' : '/library');
  }

  async function scanVff(): Promise<void> {
    busy.value = true;
    try { await seasons.rescan(); }
    catch (e: any) {
      if (e instanceof ApiError && e.status === 410) leaveRemovedMedia(e.message);
      else error.value = e.message;
    } finally { busy.value = false; }
  }

  async function recheckPlex(): Promise<void> {
    busy.value = true; error.value = '';
    try {
      const media = detail.value.media || {};
      const data = await recheckMutation.mutateAsync(`/api/media/recheck-plex?${media.library_id ? `library_id=${media.library_id}` : `request_id=${media.request_id}`}`);
      if (data?.removed) leaveRemovedMedia(`« ${data.title} » n’est plus dans Plex : il a été retiré de Watchdeck.`);
      else if (data?.found) successMessage.value = 'Présent dans Plex.';
      else error.value = 'Toujours introuvable dans Plex.';
    } catch (e: any) { error.value = e.message; } finally { busy.value = false; }
  }

  async function reportIssue(issueMessage: string): Promise<void> {
    busy.value = true;
    try {
      const media = detail.value.media || {};
      await issueMutation.mutateAsync({ library_id: media.library_id, request_id: media.request_id, issue_type: 'other', message: issueMessage });
      showIssueForm.value = false;
    } catch (e: any) { error.value = e.message; } finally { busy.value = false; }
  }

  async function sendCorrection(formPayload: Record<string, any>): Promise<void> {
    busy.value = true; error.value = '';
    try {
      const media = detail.value.media || {};
      await correctionMutation.mutateAsync({ ...formPayload, library_id: media.library_id, request_id: media.request_id });
      showCorrectionForm.value = false;
      successMessage.value = 'Correction envoyée !';
    } catch (e: any) { error.value = e.message; } finally { busy.value = false; }
  }

  function onStreamsAligned(): void {
    successMessage.value = 'Alignement des flux Plex appliqué avec succès.';
    seasons.rescan();
  }

  watch(detail, async (payload) => {
    if (!payload) return;
    seasons.reset();
    tab.value = ['summary','missing','audio','requests','calendar'].includes(String(route.query.tab)) ? String(route.query.tab) : 'summary';
    if (kind.value === 'discover') {
      if (payload.library_id) {
        await router.replace(inDiscoverShell.value ? `/discover/media/library/${payload.library_id}` : `/library/media/library/${payload.library_id}`);
        return;
      }
      if (payload.request_id) {
        await router.replace(inDiscoverShell.value ? `/discover/media/request/${payload.request_id}` : `/library/media/request/${payload.request_id}`);
        return;
      }
      const session = await loadSession();
      admin.value = canModerateSession(session);
      sessionUserId.value = session?.plex_user_id || '';
      requestForm.seasons = seasonNumbers.value.filter((season: number) => season !== 0);
      return;
    }
    if (payload.media_type === 'show') triggerBackgroundVfRescan(seasons.loadAll());
    else triggerBackgroundVfRescan(seasons.loadMovieVf().catch(e => { envelopeError.value = true; throw e; }));
    loadAdminFlag().catch(() => {});
  }, { immediate: true });

  watch([requesters, sessionUserId], ([rows, userId]) => {
    requestForm.plex_user_id = rows.find((user: any) => user.plex_user_id === userId)?.plex_user_id || userId || rows[0]?.plex_user_id || '';
  });

  return { busy, showRequestOptions, requestForm, isMusic, artistAlbums, albumTracks, slotTabs, mediaTabItems, admin, requestLabel, handleRequestClick, showIssueForm, correctionForm, newRequesterId, statusLabel, statusClass, isInPlex, seasonNumbers, addableUsers, releaseSourceType, libraryItemId, releaseSourceId, seasons, mergedVfDetail, seasonSummary, detail, loading, pending, apercu, tint, tintStyle, error, users, correctionOptions, requesters, folders, load, withdrawTarget, settleReason, setAutoImport, goBack, openDetail, openCorrection, submitRequest, scanVff, recheckPlex, reportIssue, sendCorrection, onStreamsAligned, showCorrectionForm, enSurface, ouvrirReleases, recRequesting, requestRecMedia, recOptionsDialog, confirmRecOptions, cancelRecOptions, confirmDialog, resolveConfirm, envelopeError, availabilityError, vfStatusError, requestAction, rejectRequest, closeRequest, resendMail, notifyUser, addRequester, catchUpAll, promoteRequester, removeRequester, deleteRequest, withdrawRequest, tab };
}
