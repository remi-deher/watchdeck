<template>
  <!-- Les actions d'un torrent, une seule liste pour le menu contextuel et le menu de
       ligne. `paused` choisit entre Pause et Reprendre pour un torrent seul ; sans lui
       (sélection multiple), les deux sont proposés. -->
  <template v-if="paused == null">
    <UiMenuItem @select="emit('action', 'pause')"><Pause /> Mettre en pause</UiMenuItem>
    <UiMenuItem @select="emit('action', 'resume')"><Play /> Reprendre</UiMenuItem>
  </template>
  <UiMenuItem v-else-if="paused" @select="emit('action', 'resume')"><Play /> Reprendre</UiMenuItem>
  <UiMenuItem v-else @select="emit('action', 'pause')"><Pause /> Mettre en pause</UiMenuItem>
  <UiMenuItem @select="emit('action', 'recheck')"><RotateCcw /> Revérifier les fichiers</UiMenuItem>
  <UiMenuItem @select="emit('action', 'reannounce')"><Radio /> Réannoncer aux trackers</UiMenuItem>
  <UiMenuSeparator />
  <UiMenuItem @select="emit('action', 'meta')"><Tag /> Catégorie & Tags...</UiMenuItem>
  <UiMenuItem v-if="inspectable" @select="emit('action', 'details')"><Info /> Inspecter le torrent</UiMenuItem>
  <UiMenuSeparator />
  <UiMenuItem variant="danger" @select="emit('action', 'remove-torrent')"><Trash2 /> Retirer du client</UiMenuItem>
  <UiMenuItem variant="danger" @select="emit('action', 'remove-files')"><FileX2 /> Supprimer avec les fichiers</UiMenuItem>
</template>

<script setup lang="ts">
import { FileX2, Info, Pause, Play, Radio, RotateCcw, Tag, Trash2 } from '@lucide/vue';
import UiMenuItem from '@/components/ui/UiMenuItem.vue';
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue';

export type TorrentAction = 'pause' | 'resume' | 'recheck' | 'reannounce' | 'meta' | 'details' | 'remove-torrent' | 'remove-files';

withDefaults(defineProps<{ paused?: boolean | null; inspectable?: boolean }>(), { paused: null, inspectable: false });

const emit = defineEmits<{ (e: 'action', action: TorrentAction): void }>();
</script>
