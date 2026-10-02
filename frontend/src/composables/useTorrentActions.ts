import { computed, ref } from 'vue';
import { api } from '@/api';

/** Cle stable d'un torrent : son client et son empreinte. */
export const torrentKey = (row: any): string => `${row.client_id}:${row.hash}`;

type AskConfirm = (options: { title: string; message: string; confirmLabel: string; danger?: boolean }) => Promise<boolean>;

/**
 * Actions sur les torrents, partagees par le tableau et la fiche d'un torrent.
 *
 * Chaque cible est suivie pendant son action (`isBusy`) ; les echecs sont comptes et
 * signales en une fois, les reussites declenchent `onDone` pour relire le client.
 */
export function useTorrentActions(options: {
  onDone: () => void;
  onError: (message: string) => void;
  askConfirm: AskConfirm;
}) {
  const busyKeys = ref<Set<string>>(new Set());
  const busy = computed(() => busyKeys.value.size > 0);
  const isBusy = (row: any): boolean => Boolean(row) && busyKeys.value.has(torrentKey(row));

  /** Renvoie les cles des torrents traites avec succes. */
  async function runAction(action: string, rows: any[], deleteFiles = false, extraParam = ''): Promise<Set<string>> {
    const targets = rows.filter(Boolean);
    if (!targets.length) return new Set();
    busyKeys.value = new Set([...busyKeys.value, ...targets.map(torrentKey)]);

    const results = await Promise.allSettled(
      targets.map((row) => {
        const payload: Record<string, any> = { action, delete_files: deleteFiles };
        if (action === 'set_category') payload.category = extraParam;
        if (action === 'set_tags') payload.tags = extraParam;
        return api(`/api/downloads/clients/${row.client_id}/${row.hash}/control`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      })
    );

    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) options.onError(`${failures.length} action(s) sur ${targets.length} ont échoué.`);
    busyKeys.value = new Set();
    options.onDone();
    return new Set(targets.filter((_, index) => results[index].status === 'fulfilled').map(torrentKey));
  }

  async function saveMetadata(targets: any[], category: string, tags: string): Promise<void> {
    if (!targets.length) return;
    await runAction('set_category', targets, false, category);
    await runAction('set_tags', targets, false, tags);
  }

  /** Demande confirmation, puis retire (ou supprime avec les fichiers). Renvoie les cles retirees. */
  async function confirmRemoval(rows: any[], deleteFiles: boolean): Promise<Set<string>> {
    const targets = rows.filter(Boolean);
    if (!targets.length) return new Set();
    const confirmed = await options.askConfirm(deleteFiles
      ? {
        title: `Supprimer ${targets.length} torrent(s) et leurs fichiers ?`,
        message: 'Les fichiers téléchargés seront supprimés définitivement. Cette action ne peut pas être annulée.',
        confirmLabel: 'Supprimer définitivement',
        danger: true,
      }
      : {
        title: `Retirer ${targets.length} torrent(s) ?`,
        message: 'Les torrents seront retirés du client, mais leurs fichiers seront conservés.',
        confirmLabel: 'Retirer',
        danger: true,
      });
    if (!confirmed) return new Set();
    return runAction('delete', targets, deleteFiles);
  }

  return { busy, isBusy, runAction, saveMetadata, confirmRemoval };
}
