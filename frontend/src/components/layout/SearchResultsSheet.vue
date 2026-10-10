<template>
  <BarSheet
    :open="isOpen"
    :title="`Résultats pour « ${query} »`"
    @close="close"
  >
    <template v-if="query.trim().length >= 2">
      <MediaPosterCollection
        v-for="source in mediaSources" :key="source.key" mode="rail" size="compact"
        :title="source.title" :items="source.items" :loading="source.loading" :error="source.error"
        :more-to="source.to" empty-message="Aucun résultat dans cette source."
        @retry="source.retry"
      >
        <MediaPosterCard v-for="media in source.items.slice(0, 6)" :key="media.id" :media="media"
          :animated="false" @open="openMedia(media, source.key)" />
      </MediaPosterCollection>
    </template>
    <p v-else class="palette-empty">Saisissez au moins deux caractères pour chercher des médias.</p>
    <ListboxRoot class="palette" highlight-on-hover :model-value="undefined" @update:model-value="onPick">
      <template v-if="query.trim()">
        <button v-if="expanded" type="button" class="palette-back" @click="expanded = false">
          <ArrowLeft aria-hidden="true" /> Tous les résultats
        </button>

        <p v-if="!hasResults" class="palette-empty">Aucune page ni aucun réglage pour « {{ query }} ».</p>

        <ListboxContent v-else id="command-palette-list" class="palette-list" aria-label="Résultats">
          <ListboxGroup v-if="appVisible.length" class="palette-group-block">
            <div v-if="!expanded" class="palette-heading">
              <ListboxGroupLabel>Navigation &amp; réglages</ListboxGroupLabel>
            </div>
            <ListboxItem v-for="item in appVisible" :key="item.id" :value="item.id" class="palette-option">
              <component :is="item.icon" v-if="item.icon" aria-hidden="true" />
              <span class="palette-label">{{ item.label }}</span>
              <span class="palette-group">{{ item.group }}</span>
            </ListboxItem>
            <ListboxItem v-if="!expanded && appResults.length > APP_PREVIEW" :value="MORE_APP" class="palette-option palette-more">
              <ArrowRight aria-hidden="true" />
              <span class="palette-label">Voir les {{ appResults.length }} résultats</span>
            </ListboxItem>
          </ListboxGroup>
        </ListboxContent>
      </template>
    </ListboxRoot>


  </BarSheet>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import { ListboxContent, ListboxGroup, ListboxGroupLabel, ListboxItem, ListboxRoot } from 'reka-ui';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowRight } from '@lucide/vue';
import { mediaDetailPath } from '@/mediaUrl';
import BarSheet from '@/components/ui/BarSheet.vue';
import { useSearchResults } from '@/composables/useSearchResults';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import MediaPosterCollection from '@/components/media/MediaPosterCollection.vue';
import MediaPosterCard from '@/components/media/MediaPosterCard.vue';
import { useComplementaryMediaSearch } from '@/composables/useComplementaryMediaSearch';
import type { MediaRef } from '@/types';
import { useSearchDestinations, type SearchDestination } from '@/composables/useSearchDestinations';

const props = withDefaults(
  defineProps<{ isAdmin?: boolean; canModerate?: boolean }>(),
  { isAdmin: false, canModerate: false }
);

const router = useRouter();
const route = useRoute();
const { open: isOpen, query } = useSearchResults();
// « Voir tous » cote navigation : la liste complete remplace l'apercu.
const expanded = ref(false);
const APP_PREVIEW = 5;
const MORE_APP = '__more-app';
const { library, discover } = useComplementaryMediaSearch(query, isOpen);
const mediaSources = computed(() => [
  { key: 'library', title: 'Bibliothèque', items: library.items.value, loading: library.loading.value, error: library.error.value, retry: library.retry, to: { path: '/library', query: { query: query.value.trim() } } },
  { key: 'discover', title: 'Découvrir', items: discover.items.value, loading: discover.loading.value, error: discover.error.value, retry: discover.retry, to: { path: '/discover/explore', query: { q: query.value.trim() } } },
]);
async function openMedia(media: MediaRef, source: string): Promise<void> {
  const to = mediaDetailPath(media, source === 'library' ? 'library' : undefined, { discover: source === 'discover' });
  if (!to) return;
  await ouvrirFiche(router, to, route.fullPath);
  close();
}

// Les libelles commencant par la saisie passent devant les simples correspondances.
const { results: appResults, load: loadSources } = useSearchDestinations(query, toRef(props, 'isAdmin'), toRef(props, 'canModerate'));
const appVisible = computed(() => (expanded.value ? appResults.value : appResults.value.slice(0, APP_PREVIEW)));
const results = appVisible;
const hasResults = computed(() => results.value.length > 0);

// Nouvelle saisie : on revient a l'apercu des deux blocs.
watch(query, () => { expanded.value = false; });
watch(() => route.fullPath, () => {
  // Découvrir porte aussi la saisie dans l'adresse : cela ne ferme pas ses résultats.
  if (!document.activeElement?.matches('.app-topbar .ui-search-field__input')) close();
});
watch(isOpen, (value) => { if (value && props.isAdmin) void loadSources(); });

function onPick(id: unknown): void {
  if (id === MORE_APP) {
    expanded.value = true;
    return;
  }
  void activate(results.value.find((item) => item.id === id));
}

async function activate(item?: SearchDestination): Promise<void> {
  if (!item) return;
  if (item.run) {
    item.run();
    close();
    return;
  }
  // La sheet reste ouverte jusqu'à l'arrivée de la page demandée.
  await router.push(item.to as any);
  close();
}

/** La sheet reprend la saisie de la barre. */
function open(prefill = ''): void {
  isOpen.value = true;
  expanded.value = false;
  query.value = prefill;
}

function close(): void {
  // Fermer désactive les recherches complémentaires.
  isOpen.value = false;
}

defineExpose({ open, close });
</script>

<style scoped lang="scss">
.palette-back {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  margin-top: var(--space-3);
  padding: 0;
  border: 0;
  background: none;
  color: var(--muted);
  font-size: var(--fs-sm);
  cursor: pointer;
}
.palette-back svg { width: 14px; height: 14px; }

.palette-group-block { display: grid; gap: 2px; }
.palette-group-block + .palette-group-block { margin-top: var(--space-3); }
.palette-heading { padding: 0 var(--space-3) var(--space-1); color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }

.palette-more .palette-label { color: var(--muted); }
.palette-empty { margin: var(--space-3) 0 0; color: var(--muted); font-size: var(--fs-sm); }

.palette-list {
  display: grid;
  gap: 2px;
  max-height: min(52dvh, 420px);
  margin: var(--space-3) 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.palette-option {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  min-height: 42px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--muted);
  cursor: pointer;
}

.palette-option svg { flex: none; width: 16px; height: 16px; }
.palette-label { flex: 1; min-width: 0; color: var(--text); font-size: var(--fs-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.palette-group { flex: none; color: var(--muted); font-size: var(--fs-xs); }

.palette-option { outline: none; }
.palette-option[data-highlighted] {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}

.palette-option[data-highlighted] .palette-label { color: var(--accent); }

@media (forced-colors: active) {
  .palette-option[data-highlighted] { forced-color-adjust: none; color: HighlightText; background: Highlight; }
  .palette-option[data-highlighted] .palette-label { color: HighlightText; }
}
</style>
