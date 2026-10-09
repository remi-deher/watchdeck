<template>
  <!-- Gabarit « Traiter » : repond a « que dois-je faire maintenant ? ». Ce que Suivre
       montre avance seul ; ce que Traiter montre n'avancera pas sans decision.
         1. les types de probleme, qui servent de filtre et distinguent le corrigeable du
            « a decider » ;
         2. l'action groupee sur le type choisi (« Corriger les 12 ») ou sur la selection ;
         3. la liste par urgence : probleme en clair, correction proposee, action
            principale d'abord ; l'affiche selon le contexte (un media en a une) ;
         4. le retour immediat : l'element traite quitte la liste. La page l'annonce par
            `useToast().undoable` (annulation de quelques secondes) et le retire de `items`.
       « Ignorer » est une decision durable, portee par la page : l'element ne revient pas
       tant que son etat ne change pas. -->
  <div class="handle">
    <HandleIssues v-if="issues.length" :issues="issues" :active="issue" @select="issue = $event" />

    <div v-if="activeIssue?.bulk && activeIssue.fixable && !selected.size" class="handle__bulk">
      <span>{{ activeIssue.label }} · {{ activeIssue.count }} {{ text.items }}, dont {{ activeIssue.fixable }} {{ activeIssue.fixable > 1 ? 'corrigeables' : 'corrigeable' }}</span>
      <UiButton size="sm" variant="primary" :disabled="activeIssue.bulk.disabled" @click="emit('bulk', activeIssue.bulk.key, activeIssue.key)">
        <template v-if="activeIssue.bulk.icon" #icon><component :is="activeIssue.bulk.icon" /></template>{{ activeIssue.bulk.label }}
      </UiButton>
    </div>
    <BulkActionBar :count="selected.size" @clear="selected = new Set()">
      <UiButton
        v-for="action in selectionActions"
        :key="action.key"
        size="sm"
        :variant="action.tone === 'danger' ? 'danger' : action.tone === 'primary' ? 'primary' : 'secondary'"
        :disabled="action.disabled"
        @click="emitSelection(action.key)"
      >{{ action.label }}</UiButton>
    </BulkActionBar>

    <p v-if="loading && !items.length" class="handle__loading">Chargement des {{ text.items }}…</p>
    <ul v-else-if="visible.length" class="handle__list" :aria-label="`${text.items} à traiter`">
      <HandleRow
        v-for="item in visible"
        :key="item.key"
        :item="item"
        :selectable="selectionActions.length > 0"
        :selected="selected.has(item.key)"
        @toggle="toggle"
        @action="(target, key) => emit('action', target, key)"
      />
      <li v-if="hidden > 0" class="handle__more"><button type="button" @click="limit += pageSize">+ {{ hidden }} {{ hidden > 1 ? 'autres' : 'autre' }}</button></li>
    </ul>
    <UiEmptyState v-else :icon="CheckCircle2" :title="text.empty" :message="text.emptyDetail" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CheckCircle2 } from '@lucide/vue';
import BulkActionBar from '@/components/ui/BulkActionBar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import HandleIssues from './handle/HandleIssues.vue';
import HandleRow from './handle/HandleRow.vue';
import type { HandleAction, HandleIssue, HandleItem, HandleLabels, HandleUrgency } from './handle/types';

export type { HandleAction, HandleIssue, HandleItem, HandleLabels, HandleUrgency } from './handle/types';

const props = withDefaults(
  defineProps<{
    items: HandleItem[];
    issues?: HandleIssue[];
    /** Actions proposees sur une selection d'elements (cases a cocher). */
    selectionActions?: HandleAction[];
    loading?: boolean;
    labels?: HandleLabels;
    /** Lignes montrees, puis par paquets de cette taille. */
    pageSize?: number;
  }>(),
  { issues: () => [], selectionActions: () => [], loading: false, labels: () => ({}), pageSize: 25 },
);
const emit = defineEmits<{
  action: [item: HandleItem, key: string];
  /** Action groupee d'un type de probleme. */
  bulk: [actionKey: string, issueKey: string];
  /** Action sur la selection. */
  selection: [actionKey: string, itemKeys: string[]];
}>();

const text = computed(() => ({
  items: props.labels.items || 'éléments',
  empty: props.labels.empty || 'Rien à traiter',
  emptyDetail: props.labels.emptyDetail || 'Tout ce qui demandait une décision a été traité.',
}));

const issue = ref('');
const activeIssue = computed(() => props.issues.find((entry) => entry.key === issue.value) || null);

const URGENCY: Record<HandleUrgency, number> = { high: 0, medium: 1, low: 2 };
const sorted = computed(() =>
  props.items
    .filter((item) => !issue.value || item.issue === issue.value)
    .slice()
    .sort((a, b) => URGENCY[a.urgency] - URGENCY[b.urgency]),
);
const limit = ref(props.pageSize);
watch(issue, () => { limit.value = props.pageSize; });
const visible = computed(() => sorted.value.slice(0, limit.value));
const hidden = computed(() => sorted.value.length - visible.value.length);

/* La selection ne garde que des elements encore presents : un element traite la quitte. */
const selected = ref(new Set<string>());
watch(() => props.items, (items) => {
  const present = new Set(items.map((item) => item.key));
  selected.value = new Set([...selected.value].filter((key) => present.has(key)));
});
function toggle(key: string): void {
  const next = new Set(selected.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  selected.value = next;
}
function emitSelection(actionKey: string): void {
  emit('selection', actionKey, [...selected.value]);
}
</script>

<style scoped lang="scss">
.handle { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-4); min-width: 0; }
.handle__bulk { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--accent) 10%, var(--surface)); font-size: var(--fs-sm); }
.handle__bulk > span { flex: 1 1 14rem; }
.handle__loading { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.handle__list { display: grid; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface); list-style: none; min-width: 0; }
.handle__list > :deep(li + li) { border-top: 1px solid var(--border); }
.handle__more button { width: 100%; padding: var(--space-2) var(--space-3); border: 0; background: transparent; color: var(--accent); font: inherit; font-size: var(--fs-sm); text-align: left; cursor: pointer; }
</style>
