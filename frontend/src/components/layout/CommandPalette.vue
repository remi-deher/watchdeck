<!--
  Palette de commandes (Ctrl/Cmd + K).

  L'application compte une vingtaine de routes, douze sections de reglages et autant
  d'instances *arr / clients nommes : atteindre l'un d'eux demandait de connaitre
  l'arborescence. La palette rend tout cela accessible au clavier depuis n'importe quelle
  page -- ce qui permet en retour d'assumer une navigation visuelle plus sobre, les
  utilisateurs avances ne dependant plus des menus.

  Elle interroge aussi le catalogue : « trouver Dune » obligeait a rejoindre Explorer
  d'abord, alors que c'est la recherche la plus courante. Les destinations restent
  locales et instantanees ; les medias arrivent apres, sans jamais faire attendre le
  reste de la liste.

  Bâtie sur ModalShell pour heriter du piege de focus, d'Echap, de l'inertie de
  l'arriere-plan et de la fermeture au bouton « retour ». La liste est un Listbox de
  Reka UI : fleches, Entree, survol et annonce de l'option active sont les siens ; le
  classement des resultats reste le notre.
-->
<template>
  <ModalShell
    v-if="isOpen"
    :open="isOpen"
    title="Rechercher"
    panel-class="command-palette"
    initial-focus=".palette-input"
    @close="close"
  >
    <ListboxRoot ref="listboxRef" class="palette" highlight-on-hover :model-value="undefined" @update:model-value="onPick">
      <ListboxFilter
        v-model="query"
        class="palette-input"
        role="combobox"
        aria-expanded="true"
        aria-controls="command-palette-list"
        auto-focus
        aria-label="Rechercher une destination"
        placeholder="Rechercher un film, une série, une page ou un réglage…"
        autocomplete="off"
        @keydown="onArrowAcross"
      />

      <!-- Palette vide : rien a montrer. Des qu'on tape, deux blocs : les medias en
           affiches, puis navigation et reglages en liste compacte. « Voir tous » deplie
           le bloc concerne. -->
      <template v-if="query.trim()">
        <button v-if="expanded" type="button" class="palette-back" @click="expanded = false">
          <ArrowLeft aria-hidden="true" /> Tous les résultats
        </button>

        <p v-if="!hasResults && !searching" class="palette-empty">Aucun résultat pour « {{ query }} ».</p>

        <ListboxContent v-else id="command-palette-list" class="palette-list" aria-label="Résultats">
          <ListboxGroup v-if="!expanded && (mediaResults.length || searching)" class="palette-group-block">
            <div class="palette-heading">
              <ListboxGroupLabel>Médias</ListboxGroupLabel>
            </div>
            <div class="palette-covers">
              <ListboxItem v-for="item in mediaPreview" :key="item.id" :value="item.id" class="palette-cover">
                <img v-if="item.poster" :src="item.poster" alt="" loading="lazy" decoding="async" />
                <span v-else class="palette-cover-fallback"><component :is="item.icon" aria-hidden="true" /></span>
                <span class="palette-cover-title">{{ item.label }}</span>
              </ListboxItem>
              <ListboxItem v-if="mediaResults.length" :value="MORE_MEDIA" class="palette-cover palette-cover-more">
                <span class="palette-cover-fallback"><ArrowRight aria-hidden="true" /></span>
                <span class="palette-cover-title">Voir tous les médias</span>
              </ListboxItem>
            </div>
          </ListboxGroup>

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

    <p v-if="searching && !expanded" class="palette-empty" role="status">Recherche dans le catalogue…</p>
  </ModalShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { ListboxContent, ListboxFilter, ListboxGroup, ListboxGroupLabel, ListboxItem, ListboxRoot } from 'reka-ui';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { refDebounced } from '@vueuse/core';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowRight, Film, Monitor, Moon, Server, Sun, Tv } from '@lucide/vue';
import { THEME_OPTIONS, useTheme, type ThemeChoice } from '@/composables/useTheme';
import { api } from '@/api';
import { mediaDetailPath } from '@/mediaUrl';
import ModalShell from '@/components/ui/ModalShell.vue';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import { destinationsFor, sectionsFor } from '@/navigation';
import { useDownloadSources } from '@/composables/useDownloadSources';
import { settingsSections } from '@/settingsSections';
import { rankCommands } from '@/utils/commandScore';
import { proxyUrl } from '@/utils/mediaImage';

const props = withDefaults(
  defineProps<{ isAdmin?: boolean; canModerate?: boolean }>(),
  { isAdmin: false, canModerate: false }
);

interface Command {
  id: string;
  label: string;
  group: string;
  to: string | Record<string, any>;
  icon?: any;
  /** Affiche, pour les medias. */
  poster?: string;
  /** Une fiche media s'ouvre par-dessus la page courante, pas a sa place. */
  media?: boolean;
  /** Action sur place, sans navigation (choix du theme). */
  run?: () => void;
}

const router = useRouter();
const route = useRoute();
const { arrInstances, downloadClients, load: loadSources } = useDownloadSources();
const isOpen = ref(false);
const { setTheme } = useTheme();
const THEME_ICONS: Record<ThemeChoice, any> = { system: Monitor, dark: Moon, light: Sun };
const query = ref('');
const listboxRef = ref<{ highlightFirstItem?: () => void } | null>(null);
// « Voir tous » cote navigation : la liste complete remplace l'apercu.
const expanded = ref(false);
const MEDIA_PREVIEW = 5;
const APP_PREVIEW = 5;
const MORE_MEDIA = '__more-media';
const MORE_APP = '__more-app';
/**
 * Recherche differee dans le catalogue.
 *
 * Trois garde-fous : un delai, pour ne pas lancer une requete par frappe ; une cle qui
 * porte la saisie, pour qu'une reponse lente arrivee apres une plus recente ne puisse
 * pas afficher des resultats qui ne correspondent plus (TanStack Query annule et ignore
 * la lecture obsolete) ; et un echec silencieux, sans nouvelle tentative, la palette
 * devant rester utilisable pour naviguer meme si TMDB est injoignable.
 */
const MIN_MEDIA_QUERY = 2;
const typedNeedle = computed(() => query.value.trim());
const mediaNeedle = refDebounced(typedNeedle, 250);
const mediaQuery = useQuery({
  queryKey: computed(() => ['palette', 'media', mediaNeedle.value]),
  queryFn: ({ signal }) => api<any>(`/api/discover/search?query=${encodeURIComponent(mediaNeedle.value)}&media_type=all`, { signal }),
  select: (payload: any): Command[] => {
    const items = Array.isArray(payload) ? payload : (payload?.items ?? []);
    return items.map((item: any) => ({
      id: `media-${item.media_type}-${item.tmdb_id || item.id}`,
      label: item.year ? `${item.title || item.name} (${item.year})` : (item.title || item.name),
      group: item.media_type === 'movie' ? 'Films' : 'Séries',
      to: mediaDetailPath(item, undefined, { discover: true }),
      icon: item.media_type === 'movie' ? Film : Tv,
      poster: proxyUrl(item.poster_url, { width: 160 }) || undefined,
      media: true,
    }));
  },
  enabled: computed(() => isOpen.value && mediaNeedle.value.length >= MIN_MEDIA_QUERY),
  placeholderData: keepPreviousData,
  retry: 0,
  staleTime: 60_000,
});
const mediaResults = computed<Command[]>(() =>
  typedNeedle.value.length >= MIN_MEDIA_QUERY && !mediaQuery.isError.value ? mediaQuery.data.value || [] : []
);
// « Recherche en cours » couvre aussi la pause de saisie, avant meme que la requete parte.
const searching = computed(() =>
  typedNeedle.value.length >= MIN_MEDIA_QUERY && (typedNeedle.value !== mediaNeedle.value || mediaQuery.isFetching.value)
);


const commands = computed<Command[]>(() => {
  const context = {
    isAdmin: props.isAdmin,
    canModerate: props.canModerate,
    arrInstances: arrInstances.value,
    downloadClients: downloadClients.value,
  };

  const items: Command[] = destinationsFor(props.isAdmin, props.canModerate).map((destination) => ({
    id: `nav-${destination.key}`,
    label: destination.label,
    group: destination.group,
    to: destination.to,
    icon: destination.icon,
  }));

  // Toute section est atteignable par son nom, y compris les instances *arr et les
  // clients torrent : c'est ce qui permet a la navigation visible de rester sobre.
  for (const destination of destinationsFor(props.isAdmin, props.canModerate)) {
    for (const section of sectionsFor(destination.key, context)) {
      items.push({
        id: `section-${destination.key}-${section.key}`,
        label: section.label,
        group: destination.label,
        to: section.to,
        icon: section.icon || destination.icon,
      });
    }
  }

  // Les réglages détaillés et les instances sont des destinations de recherche, pas
  // des onglets. La palette garde donc l'accès direct apprécié des utilisateurs
  // avancés sans encombrer le shell visible.
  if (props.isAdmin) {
    for (const setting of settingsSections) {
      items.push({
        id: `setting-${setting.key}`,
        label: setting.label,
        group: setting.group || 'Paramètres',
        to: setting.to || { path: '/settings', query: { tab: setting.key } },
        icon: setting.icon,
      });
    }
    for (const instance of arrInstances.value.filter((item) => item.id != null && item.enabled !== false)) {
      const kind = String(instance.arr_type);
      if (!['radarr', 'sonarr'].includes(kind)) continue;
      items.push({
        id: `scope-${kind}-${instance.id}`,
        label: instance.name || `Instance ${instance.id}`,
        group: 'Périmètres d’acquisition',
        to: { path: '/downloads', query: { view: kind, instance: String(instance.id) } },
        icon: kind === 'radarr' ? Film : Tv,
      });
    }
    for (const client of downloadClients.value.filter((item) => item.id != null && item.enabled !== false)) {
      items.push({
        id: `scope-client-${client.id}`,
        label: client.name || `Client ${client.id}`,
        group: 'Périmètres d’acquisition',
        to: { path: '/downloads', query: { view: 'clients', sub: 'instances', client: String(client.id) } },
        icon: Server,
      });
    }
  }

  // Le theme se change d'ici sans quitter la page (« theme », « clair », « sombre »).
  for (const option of THEME_OPTIONS) {
    items.push({
      id: `theme-${option.value}`,
      label: `Thème ${option.label.toLowerCase()}`,
      group: 'Apparence',
      to: '',
      icon: THEME_ICONS[option.value],
      run: () => setTheme(option.value),
    });
  }

  // Une meme destination peut venir de la navigation et des reglages (« Plex &
  // Bibliotheque » sous Services) : on ne garde que la premiere occurrence d'un meme
  // libelle dans un meme groupe.
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.group} ${item.label}`;
    return !seen.has(key) && Boolean(seen.add(key));
  });
});

// Les libelles commencant par la saisie passent devant les simples correspondances.
const appResults = computed<Command[]>(() => (query.value.trim() ? rankCommands(commands.value, query.value) : []));
const mediaPreview = computed(() => mediaResults.value.slice(0, MEDIA_PREVIEW));
const appVisible = computed(() => (expanded.value ? appResults.value : appResults.value.slice(0, APP_PREVIEW)));
const results = computed<Command[]>(() => (expanded.value ? appVisible.value : [...mediaPreview.value, ...appVisible.value]));
const hasResults = computed(() => results.value.length > 0);

// Nouvelle saisie : on revient a l'apercu des deux blocs.
watch(query, () => { expanded.value = false; });

// Nouveaux resultats (frappe, onglet, reponse du catalogue) : Entree vise le premier.
watch(results, () => {
  void nextTick(() => listboxRef.value?.highlightFirstItem?.());
});

/* La rangee d'affiches se parcourt aussi avec ← → : elle est horizontale a l'ecran.
   Les affiches se suivant dans la liste, gauche/droite equivalent a haut/bas tant que
   l'option active en est une ; ailleurs, les fleches gardent leur role dans le champ. */
function onArrowAcross(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const active = document.querySelector('.palette-cover[data-highlighted]');
  if (!active) return;
  event.preventDefault();
  event.stopPropagation();
  const key = event.key === 'ArrowRight' ? 'ArrowDown' : 'ArrowUp';
  event.target?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function onPick(id: unknown): void {
  if (id === MORE_APP) {
    expanded.value = true;
    return;
  }
  if (id === MORE_MEDIA) {
    void activate({ id: MORE_MEDIA, label: '', group: '', to: { path: '/discover', query: { q: query.value.trim() } } });
    return;
  }
  void activate(results.value.find((item) => item.id === id));
}

async function activate(item?: Command): Promise<void> {
  if (!item) return;
  if (item.run) {
    item.run();
    close();
    return;
  }
  // Naviguer AVANT de fermer, et attendre que la navigation soit reellement commitee :
  // useBackButtonClose consomme son entree d'historique par un history.back() a la fermeture,
  // qui annulerait la navigation si celle-ci n'etait pas encore inscrite. Une fois la
  // route poussee, l'entree courante ne porte plus le jeton de la modale et ce back()
  // est correctement ignore.
  // Une fiche media passe par ouvrirFiche, comme partout ailleurs : elle se pose en
  // feuille au-dessus de la page d'ou l'on a ouvert la palette.
  if (item.media) await ouvrirFiche(router, item.to, route.fullPath);
  else await router.push(item.to as any);
  close();
}

/** `prefill` reprend la saisie en cours dans la barre : passer du filtre de page a la
 *  recherche globale ne doit pas obliger a retaper ce qu'on vient d'ecrire. */
function open(prefill = ''): void {
  isOpen.value = true;
  expanded.value = false;
  query.value = prefill;
  if (props.isAdmin) void loadSources();
}

function close(): void {
  // Refermer desactive la query du catalogue : aucune lecture ne part palette fermee.
  isOpen.value = false;
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (isOpen.value) close();
    else open();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));

defineExpose({ open, close });
</script>

<style lang="scss">
/* En-tete de ModalShell masque : le champ suffit. Le titre reste lu par les lecteurs
   d'ecran ; Echap et le clic a l'exterieur ferment la palette. */
.command-palette .panel-head {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>

<style scoped lang="scss">
.palette-input {
  width: 100%;
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
}

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

/* Rangee d'affiches : cinq medias, defilable si l'ecran est etroit. */
.palette-covers {
  display: flex;
  gap: var(--space-2);
  padding: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}

.palette-cover {
  display: grid;
  flex: none;
  gap: var(--space-1);
  width: 88px;
  padding: var(--space-1);
  border-radius: var(--radius-sm);
  outline: none;
  cursor: pointer;
}

.palette-cover img,
.palette-cover-fallback {
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-sm);
  object-fit: cover;
  background: var(--surface-2);
}

.palette-cover-fallback { display: grid; place-items: center; color: var(--muted); }
.palette-cover-fallback svg { width: 20px; height: 20px; }
.palette-cover-title {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text);
  font-size: var(--fs-xs);
  line-height: 1.25;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.palette-cover[data-highlighted] { background: color-mix(in srgb, var(--accent) 16%, transparent); }
.palette-cover[data-highlighted] .palette-cover-title { color: var(--accent); }
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
  .palette-cover[data-highlighted] { forced-color-adjust: none; background: Highlight; }
  .palette-cover[data-highlighted] .palette-cover-title { color: HighlightText; }
}
</style>
