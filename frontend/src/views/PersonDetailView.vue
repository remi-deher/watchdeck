<template>
  <PageTemplate
    :title="person?.name || 'Personne'"
    :state="person ? 'ready' : error ? 'error' : loading ? 'loading' : 'ready'"
    skeleton="detail"
    :error="error"
    @retry="load"
  >
    <DetailTemplate
      v-if="person"
      variant="card"
      back
      :title="person.name"
      :poster="person.profile_url"
      :icon="UserRound"
      :eyebrow="person.known_for_department || 'Interprétation'"
      :meta="lifeMeta"
      :summary="person.biography"
      @back="goBack"
    >
      <template #tab-main>
        <section class="credits-section" aria-labelledby="credits-heading">
          <div class="credits-heading">
            <div><span class="eyebrow">Filmographie</span><h2 id="credits-heading">Films et séries</h2></div>
            <UiSegmentedControl v-model="filter" :options="filters" ariaLabel="Filtrer la filmographie" />
          </div>
          <MediaGrid :items="visibleCredits" empty-message="Aucun média trouvé dans cette catégorie.">
            <MediaPosterCard v-for="item in visibleCredits" :key="`${item.media_type}:${item.tmdb_id}`" :media="item" :to="detailPath(item)" :action-label="item.character || 'Voir la fiche'" />
          </MediaGrid>
        </section>
      </template>
    </DetailTemplate>
  </PageTemplate>
</template>

<script setup lang="ts">
/* Fiche d'une personne (distribution d'un film) : identite et biographie en en-tete, la
   filmographie en contenu. Ouverte par son adresse, elle porte un « Retour ». */
import { computed, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { UserRound } from '@lucide/vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import { mediaDetailPath } from '@/mediaUrl';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import DetailTemplate from '@/components/templates/DetailTemplate.vue';
import MediaPosterCard from '@/components/media/MediaPosterCard.vue';
import MediaGrid from '@/components/ui/MediaGrid.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import { formatDateLong } from '@/utils/format';
import { humanizeError } from '@/utils/apiError';

import type { MediaRef } from '@/types';

interface Credit extends MediaRef {
  tmdb_id?: number | string;
  character?: string;
  library_id?: number | string;
  request_id?: number | string;
  [key: string]: any;
}

interface Person {
  name: string;
  profile_url?: string;
  known_for_department?: string;
  biography?: string;
  birthday?: string;
  deathday?: string;
  place_of_birth?: string;
  credits?: Credit[];
}

const route = useRoute();
const router = useRouter();
const personId = computed(() => String(route.params.id || ''));
const personQuery = useQuery({
  queryKey: computed(() => ['discover', 'person', personId.value]),
  queryFn: ({ signal }) => api<Person>(`/api/discover/person/${personId.value}`, { signal }),
  enabled: computed(() => Boolean(personId.value)),
});
const person = computed(() => personQuery.data.value ?? null);
const loading = computed(() => personQuery.isPending.value && personQuery.isFetching.value);
// Une relecture en echec ne masque pas une fiche deja affichee.
const error = computed(() => (!person.value && personQuery.error.value ? humanizeError(personQuery.error.value) : ''));
const filter = ref('all');
const filters = [{ value: 'all', label: 'Tout' }, { value: 'movie', label: 'Films' }, { value: 'show', label: 'Séries' }];
const visibleCredits = computed(() => (person.value?.credits || []).filter((item) => filter.value === 'all' || item.media_type === filter.value));
const lifeMeta = computed(() => [
  person.value?.birthday && `Né(e) le ${formatDateLong(person.value.birthday)}`,
  person.value?.deathday && `décédé(e) le ${formatDateLong(person.value.deathday)}`,
  person.value?.place_of_birth,
].filter(Boolean) as string[]);

function detailPath(item: Credit): string { return mediaDetailPath(item, item.library_id ? 'library' : item.request_id ? 'request' : 'discover', { discover: true }); }
function goBack(): void { if (window.history.state?.back) router.back(); else router.push('/discover'); }
function load(): void { void personQuery.refetch(); }
watch(personId, () => { filter.value = 'all'; });
</script>

<style scoped lang="scss">
.credits-section { display: grid; gap: var(--space-4); }
.credits-heading { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--space-3); }
.credits-heading > div:first-child { display: grid; gap: var(--space-1); }
.credits-heading h2 { margin: 0; }
.eyebrow { color: var(--accent); font-size: var(--fs-xs); font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
</style>
