import { computed, onMounted, ref, type ComputedRef, type Ref } from 'vue';
import { api } from '@/api';

export interface UserSession {
  id?: number | string;
  plex_user_id?: string;
  username?: string;
  email?: string;
  role?: string;
  is_owner?: boolean;
  [key: string]: any;
}

let pending: Promise<UserSession | null> | null = null;

/** Charge la session (mémoïsée). Renvoie `null` si l'utilisateur n'est pas authentifié. */
export function loadSession(): Promise<UserSession | null> {
  pending ||= api<UserSession>('/api/session').catch(() => null);
  return pending;
}

/** Oublie la session mémoïsée — à appeler après une action qui change les droits. */
export function invalidateSession(): void {
  pending = null;
}

export function isAdminSession(session?: UserSession | null): boolean {
  return Boolean(session?.is_owner || session?.role === 'admin');
}

export function isModeratorSession(session?: UserSession | null): boolean {
  return session?.role === 'moderator';
}

export function canModerateSession(session?: UserSession | null): boolean {
  return isAdminSession(session) || isModeratorSession(session);
}

export function useSession(): {
  session: Ref<UserSession | null>;
  isAdmin: ComputedRef<boolean>;
  canModerate: ComputedRef<boolean>;
  ready: Ref<boolean>;
} {
  const session = ref<UserSession | null>(null);
  const ready = ref(false);
  const isAdmin = computed(() => isAdminSession(session.value));
  const canModerate = computed(() => canModerateSession(session.value));

  onMounted(async () => {
    session.value = await loadSession();
    ready.value = true;
  });

  return { session, isAdmin, canModerate, ready };
}
