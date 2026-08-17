<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="torrent-context-menu-backdrop"
      @click="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <div
        class="torrent-context-menu"
        :style="{ top: `${position.y}px`, left: `${position.x}px` }"
        @click.stop
      >
        <div class="menu-header">
          <strong>{{ selection.length > 1 ? `${selection.length} torrents sélectionnés` : (selection[0]?.title || 'Actions') }}</strong>
        </div>
        <div class="menu-divider"></div>
        <button class="menu-item" @click="trigger('pause')">
          <Pause /> Mettre en pause
        </button>
        <button class="menu-item" @click="trigger('resume')">
          <Play /> Reprendre
        </button>
        <button class="menu-item" @click="trigger('recheck')">
          <RotateCcw /> Revérifier les fichiers
        </button>
        <button class="menu-item" @click="trigger('reannounce')">
          <Radio /> Réannoncer aux trackers
        </button>
        <div class="menu-divider"></div>
        <button class="menu-item" @click="trigger('meta')">
          <Tag /> Catégorie & Tags...
        </button>
        <button v-if="selection.length === 1" class="menu-item" @click="trigger('details')">
          <Info /> Inspecter le torrent
        </button>
        <div class="menu-divider"></div>
        <button class="menu-item danger" @click="trigger('remove-torrent')">
          <Trash2 /> Retirer du client
        </button>
        <button class="menu-item danger" @click="trigger('remove-files')">
          <FileX2 /> Supprimer avec les fichiers
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { FileX2, Info, Pause, Play, Radio, RotateCcw, Tag, Trash2 } from '@lucide/vue';

export type TorrentAction = 'pause' | 'resume' | 'recheck' | 'reannounce' | 'meta' | 'details' | 'remove-torrent' | 'remove-files';

export interface TorrentItem {
  title?: string;
  [key: string]: any;
}

withDefaults(
  defineProps<{
    open?: boolean;
    position?: { x: number; y: number };
    selection?: TorrentItem[];
  }>(),
  { open: false, position: () => ({ x: 0, y: 0 }), selection: () => [] }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'action', action: TorrentAction): void;
}>();

function trigger(actionType: TorrentAction): void {
  emit('action', actionType);
  emit('close');
}
</script>

<style scoped lang="scss">
.torrent-context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
}
.torrent-context-menu {
  position: fixed;
  min-width: 210px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 6px 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
}
.menu-header {
  padding: 6px 12px;
  font-size: 11px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}
.menu-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 12px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: var(--fs-xs);
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;
}
.menu-item:hover {
  background: var(--surface-2);
  color: var(--accent);
}
.menu-item.danger:hover {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}
.menu-item svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
</style>
