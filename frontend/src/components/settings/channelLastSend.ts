/* Ce qu'une ligne de canal affiche : si le canal fonctionne, d'après son dernier envoi
 * (`GET /api/notifications/channels/last`), et plus seulement s'il est activé. */
import { formatRelativeDate } from '@/utils/format';

export interface LastSend {
  sent_at: string | null;
  success: boolean;
  error?: string | null;
  media_title?: string | null;
  recipient?: string | null;
}

export interface ChannelState {
  status: 'active' | 'error' | 'inactive';
  text: string;
  /** Une ligne sur le dernier envoi, ou rien. */
  detail: string;
}

export function channelState(enabled: boolean, last: LastSend | null | undefined): ChannelState {
  if (!enabled) return { status: 'inactive', text: 'Désactivé', detail: '' };
  if (!last) return { status: 'active', text: 'Activé', detail: 'Aucun envoi pour l’instant' };
  const when = last.sent_at ? formatRelativeDate(last.sent_at).toLowerCase() : '';
  if (!last.success) {
    return { status: 'error', text: 'Dernier envoi en échec', detail: [`Échec ${when}`.trim(), last.error].filter(Boolean).join(' · ') };
  }
  const what = [last.media_title, last.recipient && `→ ${last.recipient}`].filter(Boolean).join(' ');
  return { status: 'active', text: 'Fonctionne', detail: [`Dernier envoi ${when}`.trim(), what].filter(Boolean).join(' · ') };
}
