<template>
  <SettingsCard
    :title="title"
    :subtitle="subtitle || `${items.length} élément(s)`"
    :icon="icon"
    :status="items.some(i => i.enabled) ? 'active' : 'inactive'"
    :default-open="items.some(i => i.enabled)"
  >
    <template #actions>
      <UiButton @click.stop="$emit('open-modal')">
        <Plus />{{ addLabel }}
      </UiButton>
      <slot name="header-actions" />
    </template>

    <UiDataTable :label="`Tableau ${title}`" :rows="items" :columns="tableColumns" :row-key="(item: any) => item.id">
      <template #empty><p class="empty">{{ emptyLabel }}</p></template>
      <!-- Les slots `col-<cle>` des appelants restent les memes : ils sont relayes aux cellules. -->
      <template v-for="col in columns" :key="col.key" #[`cell-${col.key}`]="{ row: item }">
        <slot :name="`col-${col.key}`" :item="item">
          <template v-if="col.isTitle">
            <strong>{{ item[col.key] }}</strong>
            <small v-if="item.is_default">Par défaut</small>
          </template>
          <span v-else-if="col.isBadge" class="badge">{{ item[col.key] }}</span>
          <span v-else-if="col.isStatus" class="badge" :class="item.enabled ? 'available' : 'failed'">{{ item.enabled ? 'Actif' : 'Inactif' }}</span>
          <template v-else>{{ item[col.key] }}</template>
        </slot>
      </template>
      <template #cell-actions="{ row: item }">
        <UiButton icon-only v-if="hasTest" title="Tester" aria-label="Tester" @click="$emit('test', item)"><PlugZap /></UiButton>
        <UiButton icon-only title="Modifier" aria-label="Modifier" @click="$emit('open-modal', item)"><Pencil /></UiButton>
        <UiButton icon-only :title="item.enabled ? 'Désactiver' : 'Activer'" :aria-label="item.enabled ? 'Désactiver' : 'Activer'" @click="$emit('toggle', item)"><Power /></UiButton>
        <UiButton variant="danger" icon-only title="Supprimer" aria-label="Supprimer" @click="$emit('remove', item)"><Trash2 /></UiButton>
      </template>
    </UiDataTable>
  </SettingsCard>

</template>

<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue';
import { computed, type Component } from 'vue';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
import { Pencil, Plus, PlugZap, Power, Trash2 } from '@lucide/vue';
import SettingsCard from './SettingsCard.vue';

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    icon: Component;
    items?: any[];
    columns: Array<{ key: string; label: string; isTitle?: boolean; isBadge?: boolean; isStatus?: boolean; class?: string }>;
    emptyLabel?: string;
    addLabel?: string;
    hasTest?: boolean;
  }>(),
  {
    subtitle: '',
    items: () => [],
    emptyLabel: 'Aucun élément configuré.',
    addLabel: 'Ajouter',
    hasTest: true,
  }
);

defineEmits<{
  (e: 'open-modal', item?: any): void;
  (e: 'close-modal'): void;
  (e: 'save'): void;
  (e: 'toggle', item: any): void;
  (e: 'remove', item: any): void;
  (e: 'test', item?: any): void;
}>();

const tableColumns = computed<UiColumn[]>(() => [
  ...props.columns.map((col) => ({ key: col.key, label: col.label, className: col.class, card: col.isTitle ? 'title' as const : 'field' as const })),
  { key: 'actions', label: 'Actions', card: 'actions' as const, className: 'actions' },
]);
</script>
