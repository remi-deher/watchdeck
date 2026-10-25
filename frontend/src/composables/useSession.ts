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
let currentSession: UserSession | null = null;
let isSessionReady = false;

/** Charge la session (mémoïsée). Renvoie `null` si l'utilisateur n'est pas authentifié. */
export function loadSession(): Promise<UserSession | null> {
  pending ||= api<UserSession>('/api/session')
    .then((data) => {
      currentSession = data;
      isSessionReady = true;
      return data;
    })
    .catch(() => {
      currentSession = null;
      isSessionReady = true;
      return null;
    });
  return pending;
}

/** Oublie la session mémoïsée — à appeler après une action qui change les droits. */
export function invalidateSession(): void {
  pending = null;
  currentSession = null;
  isSessionReady = false;
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
  const session = ref<UserSession | null>(currentSession);
  const ready = ref(isSessionReady);
  const isAdmin = computed(() => isAdminSession(session.value));
  const canModerate = computed(() => canModerateSession(session.value));

  if (!isSessionReady) {
    onMounted(async () => {
      session.value = await loadSession();
      ready.value = true;
    });
  }

  return { session, isAdmin, canModerate, ready };
}
