<template>
  <!-- Fiche d'une session de lecture Plex, en cours ou terminee. Ouverte depuis Activite ou
       le tableau de bord, elle se pose dans la feuille ; par son adresse, en pleine page. -->
  <SheetPage
    eyebrow="Session Plex"
    headless
    :title="session ? playbackTitle(session) : 'Session de lecture'"
    :pager="pager"
    :loading="query.isPending.value && !session"
    @navigate="navigate"
    :error="query.error.value && !session ? 'Cette session est introuvable ou n’a pas pu être chargée.' : ''"
  >
    <SessionDetail
      v-if="session"
      :session="session"
      :run="serie"
      @open-run="ouvrirLecture"
      @terminated="query.refetch()"
    />
  </SheetPage>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api';
import { useRealtime } from '@/events';
import { etatDeSurfaceCourant, serieCourante } from '@/composables/useMediaOverlay';
import { useSheetPager } from '@/composables/useSheetPager';
import { playbackTitle } from '@/playbackToast';
import SheetPage from '@/components/layout/SheetPage.vue';
import SessionDetail from '@/components/activity/SessionDetail.vue';

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.sessionId || ''));

/* Lectures consecutives de la ligne ouverte : meme mecanique, a l'interieur de la serie. */
const serie = computed(() => { void route.fullPath; return serieCourante(); });

const query = useQuery({
  queryKey: computed(() => ['playback', 'session', id.value]),
  queryFn: ({ signal }) => api<Record<string, any>>(`/api/playback/sessions/${encodeURIComponent(id.value)}`, { signal }),
  enabled: computed(() => Boolean(id.value)),
  staleTime: 30_000,
  retry: 0,
  /* D'une lecture a l'autre de la serie, la fiche precedente reste affichee le temps du
     chargement : la remplacer par un « Chargement… » la raccourcissait et ramenait la
     fenetre en haut, la ou l'on venait de cliquer. Hors de la serie, on repart de zero. */
  placeholderData: (precedent) => (serie.value.some((lecture) => String(lecture.id) === id.value) ? precedent : undefined),
});
const session = computed(() => query.data.value || null);

/* Une lecture en cours avance : la fiche suit les mises a jour temps reel, comme le
   faisait le tiroir du tableau de bord. Terminee, elle ne bouge plus. */
useRealtime(['activity.updated'], () => {
  if (session.value && !session.value.ended_at) void query.refetch();
}, { debounceMs: 500 });

const { pager, navigate } = useSheetPager(id, (cible) => `/activity/session/${cible}`);
function ouvrirLecture(cible: string): void {
  if (!cible || cible === id.value) return;
  void router.replace({ path: `/activity/session/${cible}`, state: etatDeSurfaceCourant() as any });
}
</script>
