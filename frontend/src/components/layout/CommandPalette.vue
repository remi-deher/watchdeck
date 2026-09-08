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
  l'arriere-plan et de la fermeture au bouton « retour ».
-->
<template>
  <ModalShell
    v-if="isOpen"
    :open="isOpen"
    title="Aller à…"
    subtitle="Tapez pour filtrer, ↑ ↓ pour choisir, Entrée pour ouvrir."
    panel-class="command-palette"
    initial-focus=".palette-input"
    @close="close"
  >
    <input
      ref="inputRef"
      v-model="query"
      type="search"
      class="palette-input"
      role="combobox"
      aria-expanded="true"
      aria-controls="command-palette-list"
      :aria-activedescendant="activeId"
      aria-label="Rechercher une destination"
      placeholder="Rechercher une page, un réglage, un film ou une série…"
      autocomplete="off"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="void activate(results[cursor])"
    />

    <!-- Deux perimetres, deux onglets. L'onglet ouvert suit la page d'ou l'on vient :
         depuis Explorer on cherche un media, depuis Administration un reglage. -->
    <AppSubnav
      v-if="query.trim()"
      class="palette-scopes"
      variant="tabs"
      :items="scopeTabs"
      :active="scope"
      aria-label="Périmètre de recherche"
      @update:active="scope = ($event as Scope)"
    />

    <p v-if="!results.length && !searching" class="palette-empty">
      Aucun résultat pour « {{ query }} » dans {{ scope === 'media' ? 'les médias' : 'la navigation et les réglages' }}.
    </p>

    <ul v-else id="command-palette-list" class="palette-list" role="listbox" aria-label="Destinations">
      <li
        v-for="(item, index) in results"
        :id="`palette-option-${index}`"
        :key="item.id"
        role="option"
        :aria-selected="index === cursor"
        :class="{ active: index === cursor }"
        @mousemove="cursor = index"
        @click="void activate(item)"
      >
        <component :is="item.icon" v-if="item.icon" aria-hidden="true" />
        <span class="palette-label">{{ item.label }}</span>
        <span class="palette-group">{{ item.group }}</span>
      </li>
    </ul>

    <p v-if="searching" class="palette-empty" role="status">Recherche dans le catalogue…</p>
  </ModalShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Film, Server, Tv } from '@lucide/vue';
import { api } from '@/api';
import { mediaDetailPath } from '@/mediaUrl';
import AppSubnav from '@/components/ui/AppSubnav.vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import { usePageSections } from '@/composables/usePageSections';
import { destinationsFor, sectionsFor } from '@/navigation';
import { useDownloadSources } from '@/composables/useDownloadSources';
import { settingsSections } from '@/settingsSections';

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
}

const router = useRouter();
const { arrInstances, downloadClients, load: loadSources } = useDownloadSources();
const isOpen = ref(false);
const query = ref('');
const cursor = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);
const mediaResults = ref<Command[]>([]);
type Scope = 'media' | 'app';
const scope = ref<Scope>('media');

/* Destinations dont on cherche d'abord un media ; ailleurs, on cherche d'abord une
   page ou un reglage. C'est l'intention la plus probable, pas une regle stricte :
   l'autre onglet reste a une touche. */
const MEDIA_FIRST = new Set(['discover', 'requests', 'library']);
const { destinationLabel } = usePageSections();
const searching = ref(false);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchToken = 0;

/**
 * Recherche differee dans le catalogue.
 *
 * Trois garde-fous : un delai, pour ne pas lancer une requete par frappe ; un jeton,
 * parce qu'une reponse lente arrivee apres une plus recente afficherait des resultats
 * qui ne correspondent plus a la saisie ; et un echec silencieux, la palette devant
 * rester utilisable pour naviguer meme si TMDB est injoignable.
 */
function scheduleMediaSearch(term: string): void {
  if (searchTimer) clearTimeout(searchTimer);
  const needle = term.trim();
  if (needle.length < 2) {
    mediaResults.value = [];
    searching.value = false;
    return;
  }
  searching.value = true;
  searchTimer = setTimeout(async () => {
    const token = ++searchToken;
    try {
      const payload = await api<any>(`/api/discover/search?query=${encodeURIComponent(needle)}&media_type=all`);
      if (token !== searchToken) return;
      const items = Array.isArray(payload) ? payload : (payload?.items ?? []);
      mediaResults.value = items.slice(0, 8).map((item: any) => ({
        id: `media-${item.media_type}-${item.tmdb_id || item.id}`,
        label: item.year ? `${item.title || item.name} (${item.year})` : (item.title || item.name),
        group: item.media_type === 'movie' ? 'Films' : 'Séries',
        to: mediaDetailPath(item, undefined, { discover: true }),
        icon: item.media_type === 'movie' ? Film : Tv,
      }));
    } catch {
      if (token === searchToken) mediaResults.value = [];
    } finally {
      if (token === searchToken) searching.value = false;
    }
  }, 250);
}

watch(query, (value) => scheduleMediaSearch(value));

/** Insensible a la casse et aux accents : « parametres » doit trouver « Paramètres ». */
function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr');
}

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

  return items;
});

const scopeTabs = computed(() => [
  { key: 'media', label: 'Médias', count: mediaResults.value.length || null },
  { key: 'app', label: 'Navigation & réglages', count: appResults.value.length || null },
]);

const appResults = computed<Command[]>(() => {
  const needle = fold(query.value.trim());
  if (!needle) return commands.value;
  // Les libelles commencant par la saisie passent devant les simples correspondances.
  return commands.value
    .map((item) => ({ item, at: fold(`${item.label} ${item.group}`).indexOf(needle) }))
    .filter((entry) => entry.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.item);
});

const results = computed<Command[]>(() =>
  query.value.trim() && scope.value === 'media' ? mediaResults.value : appResults.value
);

const activeId = computed(() => (results.value.length ? `palette-option-${cursor.value}` : undefined));

watch(results, () => {
  cursor.value = 0;
});

function move(delta: number): void {
  if (!results.value.length) return;
  cursor.value = (cursor.value + delta + results.value.length) % results.value.length;
}

async function activate(item?: Command): Promise<void> {
  if (!item) return;
  // Naviguer AVANT de fermer, et attendre que la navigation soit reellement commitee :
  // useModalA11y consomme son entree d'historique par un history.back() a la fermeture,
  // qui annulerait la navigation si celle-ci n'etait pas encore inscrite. Une fois la
  // route poussee, l'entree courante ne porte plus le jeton de la modale et ce back()
  // est correctement ignore.
  await router.push(item.to as any);
  close();
}

/** `prefill` reprend la saisie en cours dans la barre : passer du filtre de page a la
 *  recherche globale ne doit pas obliger a retaper ce qu'on vient d'ecrire. */
function open(prefill = ''): void {
  isOpen.value = true;
  scope.value = MEDIA_FIRST.has(currentDestinationKey()) ? 'media' : 'app';
  query.value = prefill;
  cursor.value = 0;
  mediaResults.value = [];
  searching.value = false;
  if (prefill.trim()) scheduleMediaSearch(prefill);
  if (props.isAdmin) void loadSources();
}

/** Cle de la destination courante, deduite de son libelle affiche. */
function currentDestinationKey(): string {
  const label = destinationLabel.value;
  return destinationsFor(props.isAdmin, props.canModerate).find((item) => item.label === label)?.key || '';
}

function close(): void {
  isOpen.value = false;
  if (searchTimer) clearTimeout(searchTimer);
  searching.value = false;
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

.palette-scopes { margin-bottom: var(--space-3); }
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

.palette-list li {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  min-height: 42px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--muted);
  cursor: pointer;
}

.palette-list li svg { flex: none; width: 16px; height: 16px; }
.palette-label { flex: 1; min-width: 0; color: var(--text); font-size: var(--fs-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.palette-group { flex: none; color: var(--muted); font-size: var(--fs-xs); }

.palette-list li.active {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}

.palette-list li.active .palette-label { color: var(--accent); }

@media (forced-colors: active) {
  .palette-list li.active { forced-color-adjust: none; color: HighlightText; background: Highlight; }
  .palette-list li.active .palette-label { color: HighlightText; }
}
</style>
