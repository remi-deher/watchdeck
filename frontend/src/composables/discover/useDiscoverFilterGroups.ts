import { computed, type ComputedRef, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import { chipsFromGroups, type FilterGroupDefinition } from '@/composables/useFiltersDrawer';
import { AVAILABILITY_OPTIONS, MEDIA_TYPES, SECTIONS, SORT_OPTIONS } from './discoverRules';

interface DiscoverFilterState {
  query: Ref<string>;
  mediaType: Ref<string>;
  section: Ref<string>;
  genre: Ref<string>;
  availability: Ref<string>;
  sourceKey: Ref<string>;
  sortBy: Ref<string>;
  genres: Ref<any[]>;
  sources: Ref<any[]>;
  isSourceMode: ComputedRef<boolean>;
  fixedMediaType: ComputedRef<string>;
}

interface DiscoverFilterSetters {
  setSection: (value: string) => void;
  setMediaType: (value: string) => unknown;
  setSort: (value: string) => void;
  setAvailability: (value: string) => void;
  setGenre: (value: string) => void;
  selectSource: () => void;
}

/**
 * Filtres d'Explorer : des definitions (donnees), rendues par le meme composant que les
 * autres pages, et les pastilles actives qui s'en deduisent.
 */
export function useDiscoverFilterGroups(state: DiscoverFilterState, set: DiscoverFilterSetters) {
const route = useRoute();
const { query, mediaType, section, genre, availability, sourceKey, sortBy, genres, sources, isSourceMode, fixedMediaType } = state;
const genreOptions = computed(() => [{ value: '', label: 'Tous' }, ...genres.value.map((entry) => ({ value: String(entry.id), label: entry.name }))]);
const sourceOptions = computed(() => [{ value: '', label: 'Tous' }, ...sources.value.map((source) => ({ value: `${source.kind}:${source.id}`, label: source.name }))]);

const availableMediaTypes = computed(() => {
  const kind = sourceKey.value ? sourceKey.value.split(':')[0] : (route.params.kind || '');
  return kind === 'network' ? [{ value: 'show', label: 'Séries' }] : MEDIA_TYPES;
});

/* Ce que les deux longs groupes retiennent, pour le dire sans les deplier. */
const genreLabel = computed(() => genres.value.find(g => String(g.id) === String(genre.value))?.name || 'Tous');
const sourceLabel = computed(() => sources.value.find(s => `${s.kind}:${s.id}` === sourceKey.value)?.name || 'Tous');

const onSourcePage = computed(() => route.path.startsWith('/discover/source/'));
const filterGroups = computed<FilterGroupDefinition[]>(() => {
  const groups: FilterGroupDefinition[] = [];
  if (!isSourceMode.value) {
    groups.push({ key: 'section', label: 'Section', options: SECTIONS, value: query.value ? '' : section.value, fallback: query.value ? '' : 'trending', set: set.setSection });
  }
  if (!fixedMediaType.value) {
    groups.push({ key: 'type', label: 'Type de média', options: availableMediaTypes.value, value: mediaType.value, fallback: 'all', set: (value) => { void set.setMediaType(value); } });
  }
  if (isSourceMode.value) {
    groups.push({ key: 'sort', label: 'Tri', options: SORT_OPTIONS, value: sortBy.value, fallback: 'popularity.desc', set: set.setSort });
  }
  groups.push({ key: 'availability', label: 'Disponibilité', options: AVAILABILITY_OPTIONS, value: availability.value || '', fallback: '', set: set.setAvailability });
  // Vingt-et-un genres et une trentaine de diffuseurs : repliés d'office, ils annoncent ce qu'ils retiennent.
  if (genres.value.length) {
    groups.push({ key: 'genre', label: 'Genre', options: genreOptions.value, value: genre.value ? String(genre.value) : '', fallback: '', set: set.setGenre, collapsed: true, summary: genreLabel.value });
  }
  if (sources.value.length) {
    groups.push({ key: 'source', label: 'Diffuseur / Studio', options: sourceOptions.value, value: sourceKey.value || '', fallback: '', set: (key) => { sourceKey.value = key; set.selectSource(); }, collapsed: true, summary: sourceLabel.value });
  }
  return groups;
});
/* Filtres actifs, en pastilles retirables au-dessus des resultats. Sur la page d'un diffuseur,
   le diffuseur est le sujet de la page, pas un filtre. */
const chips = computed(() => chipsFromGroups(filterGroups.value.filter((group) => !(group.key === 'source' && onSourcePage.value))));

return { filterGroups, chips };
}
