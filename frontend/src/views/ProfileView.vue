<template>
  <!-- Profil (gabarit Fiche) : tout sur mon compte. L'identité et mes chiffres en tête, la
       lacune de sécurité la plus importante en alerte, puis mes dernières demandes, la
       sécurité, les notifications et l'appareil en onglets. -->
  <PageTemplate title="Profil" :state="meQuery.error.value ? 'error' : 'ready'" :error="meQuery.error.value?.message || ''" @retry="meQuery.refetch()">
    <DetailTemplate
      variant="card"
      eyebrow="Mon compte"
      :title="name"
      :icon="UserRound"
      :poster="account?.avatar_url || null"
      :meta="heroMeta"
      :badges="badges"
      :actions="hasAccount ? [{ key: 'requests', label: 'Mes demandes', to: '/discover/requests' }] : []"
      :alert="alert"
      :tabs="tabItems"
      :tab="tab"
      :facts="facts"
      @update:tab="tab = $event as Tab"
    >
      <template #tab-overview>
        <section class="profile-panel" aria-label="Aperçu">
          <div class="profile-section-head">
            <h3>Mes dernières demandes</h3>
            <RouterLink to="/discover/requests">Tout voir</RouterLink>
          </div>
          <UiEmptyState v-if="account && !recent.length" title="Aucune demande pour l’instant" description="Les titres que vous demandez depuis Explorer apparaîtront ici." compact />
          <ul v-else class="profile-requests">
            <li v-for="item in recent" :key="item.id">
              <RouterLink :to="mediaDetailPath({ request_id: item.id }, 'request', { discover: true })" class="profile-request">
                <MediaPoster :poster-url="item.poster_url" :alt="''" sizes="(max-width: 640px) 30vw, 160px" />
                <strong>{{ item.title }}</strong>
                <span class="profile-request__status" :class="statusTone(item.status)">{{ requestStatusLabel(item.status) }}</span>
              </RouterLink>
            </li>
          </ul>
        </section>
      </template>

      <template #tab-security>
        <section class="profile-panel" aria-label="Sécurité">
          <ProfileSecurityTab v-if="account" :account="account" @notify="notify" />
        </section>
      </template>

      <template #tab-notifications>
        <section class="profile-panel" aria-label="Notifications">
          <ProfileNotificationsTab v-if="account" :preferences="account.preferences" :plex-email="account.plex_email" @notify="notify" @error="fail" />
        </section>
      </template>

      <template #tab-account>
        <section class="profile-panel" aria-label="Compte et appareil">
          <ProfileAccountTab :account="account" />
        </section>
      </template>
    </DetailTemplate>
  </PageTemplate>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api';
import { UserRound } from '@lucide/vue';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import DetailTemplate from '@/components/templates/DetailTemplate.vue';
import { useToast } from '@/composables/useToast';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import MediaPoster from '@/components/media/MediaPoster.vue';
import ProfileAccountTab from '@/components/profile/ProfileAccountTab.vue';
import ProfileNotificationsTab from '@/components/profile/ProfileNotificationsTab.vue';
import ProfileSecurityTab from '@/components/profile/ProfileSecurityTab.vue';
import { firstSecurityGap, securityChecks, securityScore, type ProfilePreferences } from '@/components/profile/profileSecurity';
import { useSession } from '@/composables/useSession';
import { mediaDetailPath } from '@/mediaUrl';
import { formatDateLong, formatRelativeDate } from '@/utils/format';
import { requestStatusLabel } from '@/utils/labels';
import { roleLabel } from '@/utils/userLabels';

interface RecentRequest { id: number; title: string; status: string; poster_url?: string | null; media_type?: string }
interface MeAccount {
  id: number;
  plex_user_id: string;
  display_name: string;
  role: string;
  source?: string | null;
  avatar_url?: string | null;
  plex_email?: string | null;
  created_at?: string | null;
  last_login_at?: string | null;
  has_local_password: boolean;
  totp_enabled: boolean;
  passkey_count: number;
  preferences: ProfilePreferences;
  stats: Record<string, number> & { last_requested_at?: string | null };
  recent_requests: RecentRequest[];
}

type Tab = 'overview' | 'security' | 'notifications' | 'account';

const { session } = useSession();
// Le compte de l'assistant d'installation n'a pas d'id : rien a demander a /api/me.
const hasAccount = computed(() => Boolean(session.value?.id));
const meQuery = useQuery({
  queryKey: ['me'],
  queryFn: () => api<MeAccount>('/api/me'),
  enabled: hasAccount,
});
const account = computed(() => meQuery.data.value || null);
const loading = computed(() => meQuery.isPending.value && hasAccount.value);

// La session arrive apres le premier rendu : l'onglet par defaut suit son chargement,
// tant que la personne n'en a pas choisi un elle-meme.
const chosenTab = ref<Tab | null>(null);
const tab = computed<Tab>({
  get: () => chosenTab.value || (hasAccount.value ? 'overview' : 'account'),
  set: (value) => { chosenTab.value = value; },
});

/* Reussites et echecs passent par des notifications, pas par un bandeau. */
const toast = useToast();
function notify(text: string) { toast.success(text); }
function fail(text: string) { toast.error('Action impossible', text); }

const name = computed(() => account.value?.display_name || session.value?.username || 'Compte');
const heroMeta = computed(() => {
  const parts = [roleLabel(account.value?.role || session.value?.role)];
  if (account.value?.created_at) parts.push(`membre depuis ${formatDateLong(account.value.created_at).replace(/^\d+\s/, '')}`);
  if (account.value) parts.push(account.value.source === 'local' ? 'compte local' : 'connecté avec Plex');
  if (account.value?.last_login_at) parts.push(`dernière connexion ${formatRelativeDate(account.value.last_login_at).toLowerCase()}`);
  return parts;
});

const stats = computed(() => {
  const s = account.value?.stats || {};
  const n = (key: string) => Number(s[key] || 0);
  return {
    total: n('total'), available: n('available'), partially_available: n('partially_available'),
    pending: n('pending'), pending_approval: n('pending_approval'), sent: n('sent'),
  };
});
const inProgress = computed(() => stats.value.pending + stats.value.pending_approval + stats.value.sent);
const lastRequestDetail = computed(() => (account.value?.stats.last_requested_at
  ? `dernière ${formatRelativeDate(account.value.stats.last_requested_at).toLowerCase()}`
  : 'aucune pour l’instant'));
const availableDetail = computed(() => (stats.value.total
  ? `${Math.round(((stats.value.available + stats.value.partially_available) / stats.value.total) * 100)} %`
  : ''));
const pendingApprovalDetail = computed(() => (stats.value.pending_approval
  ? `dont ${stats.value.pending_approval} à approuver`
  : 'téléchargement ou recherche'));

const checks = computed(() => securityChecks(account.value));
const score = computed(() => securityScore(checks.value));
const gap = computed(() => firstSecurityGap(checks.value));

const recent = computed(() => (account.value?.recent_requests || []).slice(0, 6));
function statusTone(status: string): string {
  if (status === 'available' || status === 'partially_available') return 'is-ok';
  if (status === 'failed' || status === 'rejected') return 'is-ko';
  return 'is-wait';
}

const badges = computed(() => [
  { key: 'role', label: roleLabel(account.value?.role || session.value?.role), tone: 'info' as const },
  ...(account.value ? [{ key: 'protection', label: `Protection ${score.value.done}/${score.value.total}`, tone: gap.value ? 'warning' as const : 'success' as const }] : []),
]);
const facts = computed(() => (account.value ? [
  { label: 'Mes demandes', value: `${stats.value.total} · ${lastRequestDetail.value}` },
  { label: 'Disponibles', value: `${stats.value.available + stats.value.partially_available}${availableDetail.value ? ` (${availableDetail.value})` : ''}` },
  { label: 'En cours', value: `${inProgress.value} · ${pendingApprovalDetail.value}` },
] : []));
/* La lacune de securite la plus importante : une seule alerte, avec ou la traiter. */
const alert = computed(() => (gap.value
  ? { tone: 'warning' as const, message: `${gap.value.key === 'totp' ? 'Activez la double authentification.' : 'Ajoutez une passkey.'} ${gap.value.detail}`, link: { label: gap.value.key === 'totp' ? 'Activer' : 'Ajouter', tab: 'security' } }
  : null));

const tabItems = computed(() => {
  const todo = checks.value.filter((c) => !c.ok).length;
  const items: { key: Tab; label: string; count?: number }[] = [];
  if (hasAccount.value) {
    items.push(
      { key: 'overview', label: 'Aperçu' },
      { key: 'security', label: 'Sécurité', ...(todo ? { count: todo } : {}) },
      { key: 'notifications', label: 'Notifications' },
    );
  }
  items.push({ key: 'account', label: 'Compte et appareil' });
  return items;
});
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.profile-panel { padding-top: var(--space-4); }

.profile-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
}
.profile-section-head h3 { margin: 0; font-size: var(--fs-md); }
.profile-section-head a { flex: none; color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.profile-section-head a:hover { color: var(--text); }

.profile-requests {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--space-4);
  margin: var(--space-4) 0 0;
  padding: 0;
  list-style: none;
}
.profile-request { display: block; color: inherit; text-decoration: none; }
.profile-request :deep(.poster-shell) { aspect-ratio: 2 / 3; border-radius: var(--radius-sm); }
.profile-request strong { display: block; margin-top: 6px; overflow: hidden; font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.profile-request__status { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.profile-request__status::before { width: 7px; height: 7px; border-radius: 50%; background: currentColor; content: ''; }
.profile-request__status.is-ok { color: var(--green-text, var(--green)); }
.profile-request__status.is-wait { color: var(--accent); }
.profile-request__status.is-ko { color: var(--red-text, var(--red)); }

@include bp.until(tablet) {
  .profile-requests { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .profile-requests li:nth-child(n + 5) { display: none; }
}

@include bp.until(phablet) {
  .profile-requests { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
  .profile-requests li:nth-child(n + 4) { display: none; }
}
</style>
