<template>
  <!-- Fiche d'une session de lecture Plex, en cours ou terminee. Ouverte depuis Activite ou
       le tableau de bord, elle se pose dans la feuille ; par son adresse, en pleine page. -->
  <SheetPage
    eyebrow="Session Plex"
    :title="session ? playbackTitle(session) : 'Session de lecture'"
    :loading="query.isPending.value"
    :error="query.error.value ? 'Cette session est introuvable ou n’a pas pu être chargée.' : ''"
  >
    <SessionDetail
      v-if="session"
      :session="session"
      :has-previous="index > 0"
      :has-next="index >= 0 && index < voisins.length - 1"
      @navigate="naviguer"
    />
  </SheetPage>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { useEventListener } from '@vueuse/core';
import { api } from '@/api';
import { useRealtime } from '@/events';
import { etatDeSurfaceCourant, voisinsCourants } from '@/composables/useMediaOverlay';
import { playbackTitle } from '@/playbackToast';
import SheetPage from '@/components/layout/SheetPage.vue';
import SessionDetail from '@/components/activity/SessionDetail.vue';

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.sessionId || ''));

const query = useQuery({
  queryKey: computed(() => ['playback', 'session', id.value]),
  queryFn: ({ signal }) => api<Record<string, any>>(`/api/playback/sessions/${encodeURIComponent(id.value)}`, { signal }),
  enabled: computed(() => Boolean(id.value)),
  retry: 0,
});
const session = computed(() => query.data.value || null);

/* Une lecture en cours avance : la fiche suit les mises a jour temps reel, comme le
   faisait le tiroir du tableau de bord. Terminee, elle ne bouge plus. */
useRealtime(['activity.updated'], () => {
  if (session.value && !session.value.ended_at) void query.refetch();
}, { debounceMs: 500 });

/* « Precedent / suivant » parcourt la liste d'ou l'on a ouvert la fiche (voir
   `etatDeVoisins`). `replace` : passer d'une session a l'autre ne doit pas empiler
   d'entrees, « retour » ramene a la liste. L'etat de l'entree -- page de fond et
   voisins -- est repris tel quel. */
const voisins = computed(() => { void route.fullPath; return voisinsCourants(); });
const index = computed(() => voisins.value.indexOf(id.value));
function naviguer(direction: number): void {
  const suivant = voisins.value[index.value + direction];
  if (!suivant) return;
  void router.replace({ path: `/activity/session/${suivant}`, state: etatDeSurfaceCourant() as any });
}
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
  if (event.key === 'j') naviguer(1);
  else if (event.key === 'k') naviguer(-1);
});
</script>
