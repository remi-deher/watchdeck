<template>
  <!-- Catégories et tags d'un client torrent : ce qu'il connaît, et de quoi le tenir à jour
       (créer, renommer, supprimer). Un tableau de contrôle ; les saisies passent par le
       gabarit Créer, les suppressions par la confirmation du tableau. -->
  <ModalShell :open="open" title="Catégories et tags" subtitle="Ce que le client connaît pour ranger ses torrents." panel-class="torrent-metadata-modal" @close="emit('close')">
    <UiField v-if="clients.length > 1" v-slot="{ id }" label="Client">
      <UiSelect :id="id" :model-value="clientId" :options="clients.map((client) => ({ value: String(client.id), label: client.name }))" aria-label="Client" @update:model-value="clientId = String($event)" />
    </UiField>
    <UiFeedback v-if="!known.mutable" type="info" message="Ce client ne permet pas de créer, renommer ou supprimer : seules les valeurs existantes sont listées." />
    <ControlTable
      label="Catégories et tags"
      :rows="rows"
      :columns="COLUMNS"
      :row-key="(row: MetadataRow) => `${row.kind}:${row.name}`"
      :row-label="(row: MetadataRow) => row.name"
      :labels="{ empty: 'Aucune catégorie ni tag', global: 'Actions sur les catégories et tags' }"
      :global-actions="known.mutable ? GLOBAL_ACTIONS : []"
      :row-actions="known.mutable ? rowActions : null"
      :inline-actions="2"
      @action="onAction"
    >
      <template #cell-kind="{ row }"><UiBadge>{{ row.kind === 'category' ? 'Catégorie' : 'Tag' }}</UiBadge></template>
    </ControlTable>
    <CreateTemplate :open="Boolean(editing)" :definition="editing || idle" :mode="editing?.editTitle ? 'edit' : 'create'" @close="editing = null" />
  </ModalShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Pencil, Plus, Trash2 } from '@lucide/vue';
import CreateTemplate from '@/components/templates/CreateTemplate.vue';
import ControlTable, { type ControlAction } from '@/components/ui/ControlTable.vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiField from '@/components/ui/UiField.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import type { UiColumn } from '@/components/ui/UiDataTable.vue';
import { metadataAdd, metadataRename, type MetadataKind } from '@/creations/torrentMetadata';
import type { CreateDefinition } from '@/components/templates/create/types';
import { useToast } from '@/composables/useToast';
import { humanizeError } from '@/utils/apiError';
import type { useTorrentMetadata } from '@/composables/useTorrentMetadata';

interface MetadataRow { kind: MetadataKind; name: string }

const props = defineProps<{ open: boolean; clients: Array<{ id?: string | number; name: string }>; metadata: ReturnType<typeof useTorrentMetadata> }>();
const emit = defineEmits<{ close: [] }>();
const { addToast } = useToast();

const clientId = ref('');
watch(() => [props.open, props.clients], () => {
  if (!props.open) return;
  if (!props.clients.some((client) => String(client.id) === clientId.value)) clientId.value = String(props.clients[0]?.id ?? '');
  if (clientId.value) void props.metadata.load(clientId.value);
}, { immediate: true });
watch(clientId, (id) => { if (props.open && id) void props.metadata.load(id); });

const known = computed(() => props.metadata.of(clientId.value));
const rows = computed<MetadataRow[]>(() => [
  ...known.value.categories.map((name) => ({ kind: 'category' as const, name })),
  ...known.value.tags.map((name) => ({ kind: 'tag' as const, name })),
]);

const COLUMNS: UiColumn[] = [
  { key: 'kind', label: 'Type', width: 110, sortable: true, card: 'field' },
  { key: 'name', label: 'Nom', sortable: true, card: 'title' },
];
const GLOBAL_ACTIONS: ControlAction[] = [
  { key: 'add:category', label: 'Nouvelle catégorie', icon: Plus, tone: 'primary' },
  { key: 'add:tag', label: 'Nouveau tag', icon: Plus },
];
const rowActions = (): ControlAction<MetadataRow>[] => [
  { key: 'rename', label: 'Renommer', icon: Pencil },
  { key: 'delete', label: 'Supprimer', icon: Trash2, tone: 'danger', confirm: ([row]) => ({
    title: `Supprimer ${row.kind === 'category' ? 'la catégorie' : 'le tag'} « ${row.name} » ?`,
    message: 'Les torrents qui le portent gardent leur fichier ; seul le classement disparaît du client.',
    confirmLabel: 'Supprimer',
    danger: true,
  }) },
];

const idle: CreateDefinition = { noun: '', another: '', initial: () => ({}), steps: [], submit: async () => ({ message: '' }) };
const editing = ref<CreateDefinition | null>(null);

/* Une écriture rend la parole par un toast, pas par un écran de plus. */
async function perform(task: () => Promise<void>, success: string): Promise<void> {
  try { await task(); addToast({ type: 'success', message: success }); } catch (failure) { addToast({ type: 'error', message: humanizeError(failure) }); throw failure; }
}
function onAction(key: string, targets: MetadataRow[]): void {
  const [action, kind] = key.split(':');
  const id = clientId.value;
  if (action === 'add') editing.value = metadataAdd(kind as MetadataKind, (name) => perform(() => props.metadata.mutate(id, kind as MetadataKind, 'create', name), `« ${name} » créé.`));
  else if (action === 'rename') editing.value = metadataRename(targets[0].kind, targets[0].name, (newName) => perform(() => props.metadata.mutate(id, targets[0].kind, 'rename', targets[0].name, newName), `Renommé en « ${newName} ».`));
  else if (action === 'delete') void perform(() => props.metadata.mutate(id, targets[0].kind, 'delete', targets[0].name), `« ${targets[0].name} » supprimé.`).catch(() => {});
}
</script>
