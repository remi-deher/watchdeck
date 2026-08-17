<template>
  <SettingsCard
    :title="title"
    :subtitle="subtitle || `${items.length} élément(s)`"
    :icon="icon"
    :status="items.some(i => i.enabled) ? 'active' : 'inactive'"
    :default-open="items.some(i => i.enabled)"
  >
    <template #actions>
      <button class="secondary" @click.stop="$emit('open-modal')">
        <Plus />{{ addLabel }}
      </button>
      <slot name="header-actions" />
    </template>

    <div v-if="items.length" class="table-wrap table-cards rich">
      <table>
        <thead>
          <tr>
            <th v-for="col in columns" :key="col.key">{{ col.label }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <template v-for="col in columns" :key="col.key">
              <td v-if="col.isTitle" class="card-title">
                <slot :name="`col-${col.key}`" :item="item">
                  <strong>{{ item[col.key] }}</strong>
                  <small v-if="item.is_default">Par défaut</small>
                </slot>
              </td>
              <td v-else-if="col.isBadge" :data-label="col.label">
                <slot :name="`col-${col.key}`" :item="item">
                  <span class="badge">{{ item[col.key] }}</span>
                </slot>
              </td>
              <td v-else-if="col.isStatus" :data-label="col.label">
                <slot :name="`col-${col.key}`" :item="item">
                  <span class="badge" :class="item.enabled ? 'available' : 'failed'">
                    {{ item.enabled ? 'Actif' : 'Inactif' }}
                  </span>
                </slot>
              </td>
              <td v-else :class="col.class" :data-label="col.label">
                <slot :name="`col-${col.key}`" :item="item">
                  {{ item[col.key] }}
                </slot>
              </td>
            </template>

            <td class="actions card-actions">
              <button
                v-if="hasTest"
                class="icon-button"
                title="Tester"
                aria-label="Tester"
                @click="$emit('test', item)"
              >
                <PlugZap />
              </button>
              <button
                class="icon-button"
                title="Modifier"
                aria-label="Modifier"
                @click="$emit('open-modal', item)"
              >
                <Pencil />
              </button>
              <button
                class="icon-button"
                :title="item.enabled ? 'Désactiver' : 'Activer'"
                :aria-label="item.enabled ? 'Désactiver' : 'Activer'"
                @click="$emit('toggle', item)"
              >
                <Power />
              </button>
              <button
                class="icon-button danger"
                title="Supprimer"
                aria-label="Supprimer"
                @click="$emit('remove', item)"
              >
                <Trash2 />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="empty">{{ emptyLabel }}</p>
  </SettingsCard>

  <ModalShell
    v-if="showModal"
    :title="editingId ? updateTitle : createTitle"
    :panel-class="modalClass"
    :busy="busy"
    @close="$emit('close-modal')"
  >
    <div class="compact-form">
      <slot name="form" />
    </div>
    <template #actions>
      <slot name="modal-actions" />
      <button
        class="primary"
        :disabled="busy || !canSave"
        @click="$emit('save')"
      >
        <Save />{{ editingId ? 'Mettre à jour' : 'Ajouter' }}
      </button>
      <button class="secondary" @click="$emit('close-modal')">Annuler</button>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import { Pencil, Plus, PlugZap, Power, Save, Trash2 } from '@lucide/vue';
import SettingsCard from './SettingsCard.vue';

withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    icon: Component;
    items?: any[];
    columns: Array<{ key: string; label: string; isTitle?: boolean; isBadge?: boolean; isStatus?: boolean; class?: string }>;
    emptyLabel?: string;
    addLabel?: string;
    showModal?: boolean;
    editingId?: number | string | null;
    createTitle?: string;
    updateTitle?: string;
    modalClass?: string;
    busy?: boolean;
    canSave?: boolean;
    hasTest?: boolean;
  }>(),
  {
    subtitle: '',
    items: () => [],
    emptyLabel: 'Aucun élément configuré.',
    addLabel: 'Ajouter',
    showModal: false,
    editingId: null,
    createTitle: 'Ajouter un élément',
    updateTitle: 'Modifier l\'élément',
    modalClass: '',
    busy: false,
    canSave: true,
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
</script>
