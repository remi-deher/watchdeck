import type { Ref } from 'vue';
import { api } from '@/api';
import { useAsyncAction } from './useAsyncAction';

export interface UseRequestActionsContext {
  detail: Ref<any>;
  newRequesterId: Ref<string>;
  askConfirm: (options: any) => Promise<boolean>;
  reload: () => Promise<any>;
  busy: Ref<boolean>;
  error: Ref<string>;
  onDeleted?: () => void;
}

export function useRequestActions({
  detail,
  newRequesterId,
  askConfirm,
  reload,
  busy,
  error,
  onDeleted,
}: UseRequestActionsContext) {
  const { run } = useAsyncAction({ askConfirm, onDone: reload, busy, error });

  const post = (path: string, body?: any) =>
    api(path, {
      method: 'POST',
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  const putRequesters = (requestId: number | string, ids: string[]) =>
    api(`/api/requests/${requestId}/requesters`, {
      method: 'PUT',
      body: JSON.stringify({ requester_ids: ids }),
    });

  /** Approuve ou relance une demande (`action` = 'approve' | 'retry'). */
  const requestAction = (id: number | string, action: string) =>
    run(() => post(`/api/requests/${id}/${action}`));

  async function rejectRequest(row: any): Promise<void> {
    const reason = prompt('Motif du refus', 'Demande refusee par un administrateur');
    if (reason === null) return;
    await run(() => post(`/api/requests/${row.id}/reject`, { reason }));
  }

  async function closeRequest(row: any): Promise<void> {
    const notify = await askConfirm({
      title: 'Notifier la disponibilité ?',
      message: 'Un email de disponibilité sera envoyé au demandeur.',
      confirmLabel: 'Notifier',
    });
    let stopVfTracking = false;
    if (row.has_vf !== true) {
      stopVfTracking = await askConfirm({
        title: 'Arrêter la surveillance VO → VF ?',
        message: 'La demande ne sera plus vérifiée pour une amélioration en VF.',
        confirmLabel: 'Arrêter la surveillance',
        danger: true,
      });
    }
    await run(() =>
      post(
        `/api/requests/${row.id}/mark-processed?event=available&notify=${notify}&stop_vf_tracking=${stopVfTracking}`
      )
    );
  }

  const resendMail = (id: number | string, event: string) =>
    run(() => post(`/api/requests/${id}/resend-mail?event=${event}`));

  const notifyUser = (requestId: number | string, plexUserId: string, events: string[]) =>
    run(() => post(`/api/requests/${requestId}/notify-user`, { plex_user_id: plexUserId, events }));

  async function addRequester(): Promise<void> {
    const newUserId = newRequesterId.value;
    const rows: any[] = detail.value?.requests || [];
    const alreadyInProgress = rows.filter((row) => row.request_mail_sent || row.status === 'available');

    const { ok } = await run(async () => {
      for (const row of rows) {
        const ids = [...(row.requester_ids || [row.plex_user_id])];
        if (!ids.includes(newUserId)) ids.push(newUserId);
        await putRequesters(row.id, ids);
      }
    });
    if (!ok) return;
    newRequesterId.value = '';

    if (!alreadyInProgress.length) return;
    const catchUp = await askConfirm({
      title: 'Renvoyer les notifications précédentes ?',
      message: 'Le nouveau co-demandeur recevra également les emails déjà envoyés pour cette demande.',
      confirmLabel: 'Renvoyer les notifications',
    });
    if (!catchUp) return;
    for (const row of alreadyInProgress) {
      const events: string[] = [];
      if (row.request_mail_sent) events.push('request');
      if (row.status === 'available') events.push('available');
      if (events.length) await notifyUser(row.id, newUserId, events);
    }
  }

  const catchUpAll = (row: any) =>
    run(async () => {
      for (const uid of row.requester_ids || []) {
        const notified = row.requester_notifications?.[uid];
        const wanted = row.status === 'available' ? notified?.available : notified?.request;
        if (wanted !== false) continue;
        await post(`/api/requests/${row.id}/notify-user`, {
          plex_user_id: uid,
          events: row.status === 'available' ? ['available'] : ['request'],
        });
      }
    });

  const promoteRequester = (row: any, uid: string) =>
    run(() => putRequesters(row.id, [uid, ...(row.requester_ids || []).filter((id: string) => id !== uid)]));

  const removeRequester = (row: any, uid: string) =>
    run(() => putRequesters(row.id, (row.requester_ids || []).filter((id: string) => id !== uid)), {
      confirm: {
        title: 'Retirer ce demandeur ?',
        message: 'Il ne recevra plus les notifications de cette demande.',
        confirmLabel: 'Retirer',
        danger: true,
      },
    });

  async function deleteRequest(id: number | string): Promise<void> {
    const { ok } = await run(() => api(`/api/requests/${id}`, { method: 'DELETE' }), {
      reload: false,
      confirm: {
        title: 'Supprimer cette demande ?',
        message: 'La demande sera supprimée définitivement.',
        confirmLabel: 'Supprimer',
        danger: true,
      },
    });
    if (ok) onDeleted?.();
  }

  async function withdrawRequest(row: any): Promise<void> {
    const fromPlexWatchlist = ['rss', 'api'].includes(row.source);
    const { ok } = await run(() => post(`/api/requests/${row.id}/withdraw`), {
      reload: false,
      confirm: {
        title: 'Annuler cette demande ?',
        message: fromPlexWatchlist
          ? "Le média sera supprimé de l'application et de Sonarr/Radarr, puis bloqué pour empêcher qu'il ne revienne automatiquement. Pensez aussi à le retirer de votre liste d'envies Plex, sinon il continuera d'y apparaître."
          : "Le média sera supprimé de l'application et de Sonarr/Radarr.",
        confirmLabel: 'Annuler la demande',
        danger: true,
      },
    });
    if (ok) onDeleted?.();
  }

  return {
    requestAction,
    rejectRequest,
    closeRequest,
    resendMail,
    notifyUser,
    addRequester,
    catchUpAll,
    promoteRequester,
    removeRequester,
    deleteRequest,
    withdrawRequest,
  };
}
