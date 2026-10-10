<template>
  <!-- Menu contextuel UiContextMenu (Reka UI) : clic droit ou appui long sur la zone du
       slot, placement au pointeur, fleches, Echap. -->
  <UiContextMenu
    :label="selection.length > 1 ? `${selection.length} torrents sélectionnés` : (selection[0]?.title || 'Actions')"
    content-class="torrent-context-menu"
  >
    <slot />
    <template #items>
      <UiMenuSeparator />
      <TorrentActionItems :inspectable="selection.length === 1" @action="emit('action', $event)" />
    </template>
  </UiContextMenu>
</template>

<script setup lang="ts">
import UiContextMenu from '@/components/ui/UiContextMenu.vue';
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue';
import TorrentActionItems, { type TorrentAction } from './TorrentActionItems.vue';

export type { TorrentAction };

export interface TorrentItem {
  title?: string;
  [key: string]: any;
}

withDefaults(defineProps<{ selection?: TorrentItem[] }>(), { selection: () => [] });

const emit = defineEmits<{ (e: 'action', action: TorrentAction): void }>();
</script>

<style lang="scss">
/* Panneau teleporte dans <body> : l'apparence vient de .ui-menu, seul le format change. */
.ui-menu.torrent-context-menu { min-width: 210px; max-width: 280px; }
.torrent-context-menu .ui-menu-item { min-height: 30px; font-size: var(--fs-xs); }
@media (pointer: coarse) { .torrent-context-menu .ui-menu-item { min-height: 44px; } }
</style>
