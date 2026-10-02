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
      <UiMenuItem @select="emit('action', 'pause')"><Pause /> Mettre en pause</UiMenuItem>
      <UiMenuItem @select="emit('action', 'resume')"><Play /> Reprendre</UiMenuItem>
      <UiMenuItem @select="emit('action', 'recheck')"><RotateCcw /> Revérifier les fichiers</UiMenuItem>
      <UiMenuItem @select="emit('action', 'reannounce')"><Radio /> Réannoncer aux trackers</UiMenuItem>
      <UiMenuSeparator />
      <UiMenuItem @select="emit('action', 'meta')"><Tag /> Catégorie & Tags...</UiMenuItem>
      <UiMenuItem v-if="selection.length === 1" @select="emit('action', 'details')"><Info /> Inspecter le torrent</UiMenuItem>
      <UiMenuSeparator />
      <UiMenuItem variant="danger" @select="emit('action', 'remove-torrent')"><Trash2 /> Retirer du client</UiMenuItem>
      <UiMenuItem variant="danger" @select="emit('action', 'remove-files')"><FileX2 /> Supprimer avec les fichiers</UiMenuItem>
    </template>
  </UiContextMenu>
</template>

<script setup lang="ts">
import { FileX2, Info, Pause, Play, Radio, RotateCcw, Tag, Trash2 } from '@lucide/vue';
import UiContextMenu from '@/components/ui/UiContextMenu.vue';
import UiMenuItem from '@/components/ui/UiMenuItem.vue';
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue';

export type TorrentAction = 'pause' | 'resume' | 'recheck' | 'reannounce' | 'meta' | 'details' | 'remove-torrent' | 'remove-files';

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
