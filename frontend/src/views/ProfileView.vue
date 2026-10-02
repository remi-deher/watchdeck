<template>
  <AppPage hide-search title="Profil" :error="error" :success="message" @dismiss-success="message = ''">
    <!-- En-tete : qui je suis, puis mes chiffres. Les onglets viennent dessous. -->
    <header class="profile-hero">
      <UiAvatar class="profile-hero__avatar" :src="account?.avatar_url" :name="name" tone="accent" size="lg" />
      <div class="profile-hero__text">
        <h2>Bonjour {{ firstName }}</h2>
        <p>{{ heroLine }}</p>
      </div>
    </header>

    <MetricGrid v-if="account" class="profile-metrics" grid-class="profile-metrics-grid" aria-label="Mes chiffres">
      <MetricCard label="Mes demandes" :value="stats.total" :detail="lastRequestDetail" :loading="loading" to="/discover/requests" />
      <MetricCard label="Disponibles" :value="stats.available + stats.partially_available" :detail="availableDetail" :loading="loading" card-class="profile-metric--ok" />
      <MetricCard label="En cours" :value="inProgress" :detail="pendingApprovalDetail" :loading="loading" />
      <MetricCard label="Protection du compte" :value="`${score.done}/${score.total}`" :detail="gap ? gapShort : 'Tout est en place'" :loading="loading" :card-class="gap ? 'profile-metric--todo' : 'profile-metric--ok'" />
    </MetricGrid>

    <AppSubnav v-model:active="tab" class="profile-tabs" variant="tabs" :items="tabItems" aria-label="Sections du profil" />

    <section v-if="tab === 'overview'" class="profile-panel" aria-label="Aperçu">
      <div v-if="gap" class="profile-todo">
        <span class="profile-todo__mark" aria-hidden="true">!</span>
        <p><strong>{{ gap.key === 'totp' ? 'Activez la double authentification.' : 'Ajoutez une passkey.' }}</strong> {{ gap.detail }}</p>
        <UiButton variant="primary" @click="tab = 'security'">{{ gap.key === 'totp' ? 'Activer' : 'Ajouter' }}</UiButton>
      </div>

      <div class="profile-section-head">
        <h3>Mes dernières demandes</h3>
        <RouterLink to="/discover/requests">Voir toutes mes demandes</RouterLink>
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

    <section v-else-if="tab === 'security'" class="profile-panel" aria-label="Sécurité">
      <ProfileSecurityTab v-if="account" :account="account" @notify="notify" />
    </section>

    <section v-else-if="tab === 'notifications'" class="profile-panel" aria-label="Notifications">
      <ProfileNotificationsTab v-if="account" :preferences="account.preferences" :plex-email="account.plex_email" @notify="notify" @error="actionError = $event" />
    </section>

    <section v-else class="profile-panel" aria-label="Compte et appareil">
      <ProfileAccountTab :account="account" />
    </section>
  </AppPage>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/api';
import AppPage from '@/components/ui/AppPage.vue';
import AppSubnav from '@/components/ui/AppSubnav.vue';
import MetricCard from '@/components/ui/MetricCard.vue';
import MetricGrid from '@/components/ui/MetricGrid.vue';
import UiAvatar from '@/components/ui/UiAvatar.vue';
import UiButton from '@/components/ui/UiButton.vue';
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

const tab = ref<Tab>(hasAccount.value ? 'overview' : 'account');
watch(hasAccount, (value) => { if (!value) tab.value = 'account'; });

const actionError = ref('');
const message = ref('');
const error = computed(() => actionError.value || meQuery.error.value?.message || '');
function notify(text: string) { message.value = text; actionError.value = ''; }

const name = computed(() => account.value?.display_name || session.value?.username || 'Compte');
const firstName = computed(() => name.value.split(/\s+/)[0]);
const heroLine = computed(() => {
  const parts = [roleLabel(account.value?.role || session.value?.role)];
  if (account.value?.created_at) parts.push(`membre depuis ${formatDateLong(account.value.created_at).replace(/^\d+\s/, '')}`);
  if (account.value) parts.push(account.value.source === 'local' ? 'compte local' : 'connecté avec Plex');
  if (account.value?.last_login_at) parts.push(`dernière connexion ${formatRelativeDate(account.value.last_login_at)}`);
  return parts.join(' · ');
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
  ? `dernière ${formatRelativeDate(account.value.stats.last_requested_at)}`
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
const gapShort = computed(() => (gap.value?.key === 'totp' ? '2FA à activer' : 'passkey conseillée'));

const recent = computed(() => (account.value?.recent_requests || []).slice(0, 6));
function statusTone(status: string): string {
  if (status === 'available' || status === 'partially_available') return 'is-ok';
  if (status === 'failed' || status === 'rejected') return 'is-ko';
  return 'is-wait';
}

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

.profile-hero {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  padding: var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--accent) 14%, var(--surface)) 0%, var(--surface) 60%);
}

.profile-hero .profile-hero__avatar {
  width: 72px;
  height: 72px;
  font-family: var(--font-display);
  font-size: var(--fs-2xl);
}

.profile-hero__text { min-width: 0; }
.profile-hero h2 { margin: 0; font-family: var(--font-display); font-size: var(--fs-2xl); }
.profile-hero p { margin: 4px 0 0; color: var(--muted); font-size: var(--fs-sm); }

.profile-metrics { margin-top: var(--space-4); }
.profile-metrics :deep(.profile-metric--ok strong) { color: var(--green-text, var(--green)); }
.profile-metrics :deep(.profile-metric--todo strong) { color: var(--accent); }

.profile-tabs { margin-top: var(--space-5); }
.profile-panel { padding-top: var(--space-4); }

.profile-todo {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  font-size: var(--fs-sm);
}
.profile-todo p { margin: 0; flex: 1; line-height: 1.45; }
.profile-todo__mark {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
  font-weight: 700;
}

.profile-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
}
.profile-section-head h3 { margin: 0; font-size: var(--fs-md); }
.profile-section-head a { color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
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
  .profile-hero { gap: var(--space-3); padding: var(--space-4); }
  .profile-hero .profile-hero__avatar { width: 52px; height: 52px; font-size: var(--fs-lg); }
  .profile-hero h2 { font-size: var(--fs-xl); }
  .profile-todo { flex-wrap: wrap; }
  .profile-todo .ui-button { margin-left: 40px; }
  .profile-requests { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
  .profile-requests li:nth-child(n + 4) { display: none; }
}
</style>
