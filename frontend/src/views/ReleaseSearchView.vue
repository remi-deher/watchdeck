<template>
  <SheetPage
    eyebrow="Recherche interactive"
    :title="request?.title || 'Releases'"
    :subtitle="subtitle"
    :loading="loading && releases.length === 0"
    :error="loadError"
  >
    <ChooseTemplate
      :candidates="candidates"
      :sorts="SORTS"
      recommend-by="best"
      :searching="loading"
      :busy="Boolean(grabbing)"
      :choosing="grabbing || ''"
      :result="result"
      empty-message="Aucune release disponible."
      @refresh="load"
      @choose="grab"
      @reset="result = null"
    >
      <template v-if="rootFolder" #context>
        <p class="root-folder-info"><FolderOpen :size="14" /> Dossier racine : <code>{{ rootFolder }}</code></p>
      </template>
    </ChooseTemplate>
  </SheetPage>
</template>

<script setup lang="ts">
/* Recherche interactive d'une demande : dans la feuille depuis Workflow > Demandes ou la
   fiche media, en pleine page par son adresse. Les releases sont des candidats du gabarit
   Choisir ; la VF est mise en avant (la recommandation la prefere, a score egal). */
import { computed, ref } from 'vue';
import { FolderOpen } from '@lucide/vue';
import { useRoute } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api';
import { humanizeError } from '@/utils/apiError';
import { formatBytes } from '@/utils/format';
import { useToast } from '@/composables/useToast';
import SheetPage from '@/components/layout/SheetPage.vue';
import ChooseTemplate, { type ChooseCandidate, type ChooseResult } from '@/components/templates/ChooseTemplate.vue';

interface Release { guid: string; title?: string; indexer?: string; quality?: string; protocol?: string; size?: number; seeders?: number; custom_format_score?: number; rejections?: string[]; is_french?: boolean; indexer_id?: number | string }
interface MediaRequest { id: number | string; title?: string; media_type: string; arr_instance_id?: number | string }

const SORTS = [
  { key: 'best', label: 'Recommandé' },
  { key: 'score', label: 'Score' },
  { key: 'size', label: 'Taille' },
  { key: 'seeds', label: 'Seeders' },
];

const route = useRoute();
const toast = useToast();
const grabbing = ref<string | null>(null);
const result = ref<ChooseResult | null>(null);

const requestId = computed(() => String(route.params.requestId || ''));
const requestQuery = useQuery({
  queryKey: computed(() => ['requests', 'detail', requestId.value]),
  queryFn: ({ signal }) => api<MediaRequest>(`/api/requests/${requestId.value}`, { signal }),
  enabled: computed(() => Boolean(requestId.value)),
});
const request = computed(() => requestQuery.data.value ?? null);
const releaseParams = computed(() => (request.value ? String(new URLSearchParams({ media_type: request.value.media_type, request_id: String(request.value.id) })) : ''));
/* Chaque lecture relance une recherche sur tous les indexeurs : pas de relecture au retour
   sur l'onglet, pas de nouvel essai automatique, et un resultat garde 5 minutes. */
const releasesQuery = useQuery({
  queryKey: computed(() => ['arr', 'releases', releaseParams.value]),
  queryFn: ({ signal }) => api<Release[]>(`/api/arr/releases?${releaseParams.value}`, { signal }),
  enabled: computed(() => Boolean(releaseParams.value)),
  staleTime: 5 * 60_000,
  refetchOnWindowFocus: false,
  retry: 0,
});
const rootFolderQuery = useQuery({
  queryKey: computed(() => ['arr', 'root-folder', releaseParams.value]),
  queryFn: ({ signal }) => api<{ root_folder_path?: string }>(`/api/arr/root-folder?${releaseParams.value}`, { signal }).catch(() => null),
  enabled: computed(() => Boolean(releaseParams.value)),
});
const releases = computed(() => releasesQuery.data.value ?? []);
const rootFolder = computed(() => rootFolderQuery.data.value?.root_folder_path || '');
const loading = computed(() => requestQuery.isFetching.value || releasesQuery.isFetching.value);
/* Une erreur de lecture remplace la liste ; celle d'un choix passe par un message. */
const loadError = computed(() => [requestQuery.error.value, releasesQuery.error.value].filter(Boolean).map(humanizeError)[0] || '');
const subtitle = computed(() => {
  if (!request.value) return '';
  const type = request.value.media_type === 'show' ? 'Série' : 'Film';
  return releases.value.length ? `${type} · ${releases.value.length} release${releases.value.length > 1 ? 's' : ''}` : type;
});

/* Les criteres de chaque release, toujours dans le meme ordre : langue, qualite, indexeur. */
const candidates = computed<ChooseCandidate[]>(() => releases.value.map((release) => ({
  key: release.guid,
  title: release.title || release.guid,
  badges: [
    ...(release.is_french ? [{ label: 'VF', tone: 'success' as const }] : []),
    { label: release.quality || release.protocol || '—' },
    { label: release.indexer || 'Indexeur' },
  ],
  facts: [release.size ? formatBytes(release.size) : '—', `${release.seeders || 0} seeds`, `CF ${release.custom_format_score || 0}`],
  metrics: {
    // La VF d'abord, puis le score : la recommandation et le tri par defaut.
    best: (release.is_french ? 1_000_000 : 0) + (release.custom_format_score || 0),
    score: release.custom_format_score || 0,
    size: release.size || 0,
    seeds: release.seeders || 0,
  },
  rejected: release.rejections?.length ? release.rejections.join(', ') : undefined,
  release,
})));

function load(): void {
  void (request.value ? releasesQuery.refetch() : requestQuery.refetch());
}

async function grab(candidate: ChooseCandidate): Promise<void> {
  if (grabbing.value || !request.value) return;
  const release = candidate.release as Release;
  grabbing.value = release.guid;
  try {
    await api('/api/arr/grab', {
      method: 'POST',
      body: JSON.stringify({ media_type: request.value.media_type, guid: release.guid, indexer_id: release.indexer_id, instance_id: request.value.arr_instance_id, request_id: request.value.id }),
    });
    result.value = { message: `« ${release.title || 'Release'} » envoyée à ${request.value.media_type === 'show' ? 'Sonarr' : 'Radarr'}.`, to: '/downloads', linkLabel: 'Suivre' };
  } catch (e: any) {
    toast.error('Envoi impossible', e.message);
  } finally {
    grabbing.value = null;
  }
}
</script>

<style scoped lang="scss">
.root-folder-info { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.root-folder-info code { color: var(--text); font-family: inherit; }
</style>
