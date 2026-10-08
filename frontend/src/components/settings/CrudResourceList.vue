<template>
  <SettingsItemList :title="title" :subtitle="subtitle" :count="items.length" :empty="!items.length">
    <template #actions>
      <UiButton @click="$emit('open-modal')"><Plus />{{ addLabel }}</UiButton>
      <slot name="header-actions" />
    </template>
    <template #empty>{{ emptyLabel }}</template>

    <SettingsItem
      v-for="item in items"
      :key="item.id"
      :title="itemTitle(item)"
      :subtitle="itemLive?.(item)?.status === 'error' ? itemLive(item)!.detail : [itemSubtitle(item), itemLive?.(item)?.detail].filter(Boolean).join(' · ')"
      :tag="item.is_default ? 'Par défaut' : itemTag(item)"
      :icon="icon"
      :status="itemLive?.(item)?.text ? itemLive(item)!.status : (item.enabled ? 'active' : 'inactive')"
      :status-text="itemLive?.(item)?.text || ''"
      clickable
      @open="$emit('open-modal', item)"
    >
      <template #actions>
        <UiButton v-if="hasTest" size="sm" icon-only title="Tester" aria-label="Tester" @click="$emit('test', item)"><PlugZap /></UiButton>
        <template v-if="!(lockedKey && item[lockedKey])">
          <UiButton size="sm" icon-only :title="item.enabled ? 'Désactiver' : 'Activer'" :aria-label="item.enabled ? 'Désactiver' : 'Activer'" @click="$emit('toggle', item)"><Power /></UiButton>
          <UiButton size="sm" variant="danger" icon-only title="Supprimer" aria-label="Supprimer" @click="$emit('remove', item)"><Trash2 /></UiButton>
        </template>
      </template>
    </SettingsItem>
  </SettingsItemList>
</template>

<script setup lang="ts">
/**
 * Liste d'objets geres par l'API (instances *arr, clients de telechargement) : une ligne
 * par objet, son etat, et ses actions rapides. La ligne ouvre le formulaire dans la
 * feuille, a sa propre adresse (`open-modal`) ; ajouter fait de meme sans objet.
 */
import type { Component } from 'vue';
import { Plus, PlugZap, Power, Trash2 } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import SettingsItem from './SettingsItem.vue';
import SettingsItemList from './SettingsItemList.vue';

withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    icon: Component;
    items?: any[];
    /** Titre d'une ligne. */
    itemTitle?: (item: any) => string;
    /** Resume d'une ligne : type, adresse... */
    itemSubtitle?: (item: any) => string;
    /** Mention a cote du titre. */
    itemTag?: (item: any) => string;
    emptyLabel?: string;
    addLabel?: string;
    hasTest?: boolean;
    /** Etat reel d'une ligne (connexion verifiee), a la place de « Actif / Inactif ». */
    itemLive?: (item: any) => { status: string; text: string; detail: string } | null;
    /** Champ qui, vrai sur une ligne, masque Activer et Supprimer (ex. serveur Plex principal). */
    lockedKey?: string;
  }>(),
  {
    subtitle: '',
    items: () => [],
    itemTitle: (item: any) => String(item.name ?? ''),
    itemSubtitle: (item: any) => String(item.url ?? ''),
    itemTag: () => '',
    emptyLabel: 'Aucun élément configuré.',
    addLabel: 'Ajouter',
    hasTest: true,
    lockedKey: '',
  }
);

defineEmits<{
  (e: 'open-modal', item?: any): void;
  (e: 'toggle', item: any): void;
  (e: 'remove', item: any): void;
  (e: 'test', item?: any): void;
}>();
</script>
