import type { UserSession } from '@/composables/useSession';
const KEY = 'watchdeck:last-session';
export function rememberSession(session: UserSession | null): void {
  try {
    if (!session) { localStorage.removeItem(KEY); return; }
    const { id, plex_user_id, username, role, is_owner } = session;
    localStorage.setItem(KEY, JSON.stringify({ id, plex_user_id, username, role, is_owner }));
  } catch { /* Storage can be unavailable. */ }
}
export function offlineSession(): UserSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    const owner = value ? String(value.id ?? value.plex_user_id ?? value.username ?? 'compte') : '';
    return owner && owner === localStorage.getItem('watchdeck:stockage-proprietaire') ? value : null;
  } catch { return null; }
}
