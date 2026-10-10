/* Ce que la section Clients confie au gabarit « Gérer » : les colonnes des torrents et leurs
 * actions, décrites en données. Les clés d'action (`pause`, `remove-files`…) sont décodées
 * par `useTorrentClients`. */
import { FileX2, Info, Pause, Play, Radio, RotateCcw, Tag, Trash2 } from '@lucide/vue';
import type { ControlAction } from '@/components/ui/ControlTable.vue';
import type { UiColumn } from '@/components/ui/UiDataTable.vue';
import { removalConfirmation } from '@/composables/useTorrentActions';
import { isPaused } from '@/downloads/torrentFormat';

/* Dans la carte de téléphone : le titre en tête, l'état et la progression lisibles, le reste
   réservé au tableau. */
const CARD_FIELDS = new Set(['status', 'progress']);
const col = (key: string, label: string, width: number, extra: Partial<UiColumn> = {}): UiColumn => ({
  key, label, width, sortable: true,
  card: key === 'title' ? 'title' : CARD_FIELDS.has(key) ? 'field' : 'hidden',
  ...extra,
});
export const TORRENT_COLUMNS: UiColumn[] = [
  col('title', 'Torrent', 300, { className: 'torrent-name', required: true }),
  col('status', 'État', 110, { required: true }),
  col('progress', 'Progression', 140),
  col('size', 'Taille', 90),
  col('download_speed', 'Réception', 100),
  col('upload_speed', 'Envoi', 90),
  col('ratio', 'Ratio', 75),
  col('eta', 'Temps restant', 100),
  col('category', 'Catégorie', 110),
  col('trackers', 'Tracker', 130),
  col('added_on', 'Ajouté le', 130),
  col('completed_on', 'Terminé le', 130),
];
export const TORRENT_DEFAULT_COLUMNS = ['title', 'status', 'progress', 'size', 'download_speed', 'upload_speed', 'eta', 'category'];

const pause: ControlAction = { key: 'pause', label: 'Mettre en pause', icon: Pause };
const resume: ControlAction = { key: 'resume', label: 'Reprendre', icon: Play };
const recheck: ControlAction = { key: 'recheck', label: 'Revérifier les fichiers', icon: RotateCcw };
const reannounce: ControlAction = { key: 'reannounce', label: 'Réannoncer aux trackers', icon: Radio };
const meta: ControlAction = { key: 'meta', label: 'Catégorie & Tags…', icon: Tag };
const remove: ControlAction = { key: 'remove', label: 'Retirer du client', icon: Trash2, tone: 'danger', confirm: (rows) => removalConfirmation(rows.length, false) };
const removeFiles: ControlAction = { key: 'remove-files', label: 'Supprimer avec les fichiers', icon: FileX2, tone: 'danger', confirm: (rows) => removalConfirmation(rows.length, true) };

/** Actions de la sélection : l'état, la maintenance, le classement, puis le retrait. */
export const TORRENT_BULK_ACTIONS: ControlAction[] = [
  { ...pause, label: 'Mettre en pause' },
  resume,
  { key: 'maintenance', label: 'Maintenance', icon: RotateCcw, items: [recheck, reannounce] },
  { ...meta, label: 'Catégorie & Tags' },
  { key: 'removal', label: 'Retirer', icon: Trash2, tone: 'danger', items: [remove, removeFiles] },
];

/** Actions d'un torrent : Pause ou Reprendre selon son état, tout dans un seul menu. */
export const torrentRowActions = (row: any): ControlAction[] => [
  isPaused(row) ? resume : pause,
  recheck,
  reannounce,
  { ...meta, separated: true },
  { key: 'details', label: 'Inspecter le torrent', icon: Info },
  { ...remove, separated: true },
  removeFiles,
];
