<!--
  Palette de commandes (Ctrl/Cmd + K).

  L'application compte une vingtaine de routes, douze sections de reglages et autant
  d'instances *arr / clients nommes : atteindre l'un d'eux demandait de connaitre
  l'arborescence. La palette rend tout cela accessible au clavier depuis n'importe quelle
  page -- ce qui permet en retour d'assumer une navigation visuelle plus sobre, les
  utilisateurs avances ne dependant plus des menus.

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
      placeholder="Rechercher une page, un réglage, une instance…"
      autocomplete="off"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="void activate(results[cursor])"
    />

    <p v-if="!results.length" class="palette-empty">Aucun résultat pour « {{ query }} ».</p>

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
  </ModalShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import ModalShell from '@/components/ui/ModalShell.vue';
import { destinationsFor, sectionsFor } from '@/navigation';
import { useDownloadSources } from '@/composables/useDownloadSources';

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

  return items;
});

const results = computed(() => {
  const needle = fold(query.value.trim());
  if (!needle) return commands.value;
  // Les libelles commencant par la saisie passent devant les simples correspondances.
  return commands.value
    .map((item) => ({ item, at: fold(`${item.label} ${item.group}`).indexOf(needle) }))
    .filter((entry) => entry.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.item);
});

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

function open(): void {
  isOpen.value = true;
  query.value = '';
  cursor.value = 0;
  if (props.isAdmin) void loadSources();
}

function close(): void {
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
