<template>
  <!-- Menu contextuel Reka UI : il s'ouvre au clic droit (ou a l'appui long au doigt) sur
       la zone qu'il enveloppe, se place au pointeur sans deborder de l'ecran, se parcourt
       aux fleches et se ferme a Echap ou au clic a cote. Plus de voile ni de coordonnees
       calculees a la main. -->
  <ContextMenuRoot :modal="false">
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuPortal>
      <ContextMenuContent class="torrent-context-menu" :collision-padding="8">
        <ContextMenuLabel class="menu-header">
          {{ selection.length > 1 ? `${selection.length} torrents sélectionnés` : (selection[0]?.title || 'Actions') }}
        </ContextMenuLabel>
        <ContextMenuSeparator class="menu-divider" />
        <ContextMenuItem class="menu-item" @select="emit('action', 'pause')"><Pause /> Mettre en pause</ContextMenuItem>
        <ContextMenuItem class="menu-item" @select="emit('action', 'resume')"><Play /> Reprendre</ContextMenuItem>
        <ContextMenuItem class="menu-item" @select="emit('action', 'recheck')"><RotateCcw /> Revérifier les fichiers</ContextMenuItem>
        <ContextMenuItem class="menu-item" @select="emit('action', 'reannounce')"><Radio /> Réannoncer aux trackers</ContextMenuItem>
        <ContextMenuSeparator class="menu-divider" />
        <ContextMenuItem class="menu-item" @select="emit('action', 'meta')"><Tag /> Catégorie & Tags...</ContextMenuItem>
        <ContextMenuItem v-if="selection.length === 1" class="menu-item" @select="emit('action', 'details')"><Info /> Inspecter le torrent</ContextMenuItem>
        <ContextMenuSeparator class="menu-divider" />
        <ContextMenuItem class="menu-item danger" @select="emit('action', 'remove-torrent')"><Trash2 /> Retirer du client</ContextMenuItem>
        <ContextMenuItem class="menu-item danger" @select="emit('action', 'remove-files')"><FileX2 /> Supprimer avec les fichiers</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<script setup lang="ts">
import { FileX2, Info, Pause, Play, Radio, RotateCcw, Tag, Trash2 } from '@lucide/vue';
import {
  ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuPortal, ContextMenuRoot,
  ContextMenuSeparator, ContextMenuTrigger,
} from 'reka-ui';

export type TorrentAction = 'pause' | 'resume' | 'recheck' | 'reannounce' | 'meta' | 'details' | 'remove-torrent' | 'remove-files';

export interface TorrentItem {
  title?: string;
  [key: string]: any;
}

withDefaults(defineProps<{ selection?: TorrentItem[] }>(), { selection: () => [] });

const emit = defineEmits<{ (e: 'action', action: TorrentAction): void }>();
</script>

<style scoped lang="scss">
.torrent-context-menu {
  z-index: 80;
  min-width: 210px;
  padding: 6px 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  outline: none;
}
.torrent-context-menu[data-state="open"] { animation: menu-in var(--motion-duration-fast) var(--motion-ease-emphasized); }
@keyframes menu-in { from { opacity: 0; transform: scale(0.97); } }
.menu-header {
  max-width: 260px;
  overflow: hidden;
  padding: 6px 12px;
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.menu-divider { height: 1px; margin: 4px 0; background: var(--border); }
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  color: var(--text);
  font-size: var(--fs-xs);
  cursor: pointer;
  outline: none;
  user-select: none;
}
/* Survol et clavier, meme apparence : Reka pose `data-highlighted` dans les deux cas. */
.menu-item[data-highlighted] { background: var(--surface-2); color: var(--accent); }
.menu-item.danger[data-highlighted] { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
.menu-item svg { flex-shrink: 0; width: 14px; height: 14px; }
@media (prefers-reduced-motion: reduce) { .torrent-context-menu { animation: none !important; } }
</style>
