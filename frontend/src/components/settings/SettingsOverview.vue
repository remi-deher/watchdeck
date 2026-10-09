<template>
  <!-- Le poste de pilotage de l'instance : un verdict, ce qui demande une action, l'activité,
       l'état des services et des tâches, puis la carte des zones. Sur téléphone, la carte
       passe devant et sert de menu (voir l'ordre des zones plus bas). -->
  <div class="admin-overview">
    <OverviewVerdict
      class="ov-verdict"
      :urgent="attention.urgent.value"
      :errors="severityCount('error')"
      :warnings="severityCount('warn')"
      :loading="attention.loading.value"
      :refreshing="refreshing"
      :checked-label="checkedLabel"
      @refresh="refresh"
    />
    <OverviewKpis class="ov-kpis" :kpis="kpis" />
    <OverviewTodo class="ov-todo" :items="attention.items.value" :loading="attention.loading.value" :icons="AREA_ICONS" />
    <OverviewQuickActions class="ov-actions" :maintenance="attention.overview.value?.maintenance" @started="refresh" />
    <OverviewServices v-if="serviceRows.length" class="ov-services" :rows="serviceRows" />
    <OverviewTasks v-if="attention.tasks.value.length" class="ov-tasks" :tasks="attention.tasks.value" />
    <OverviewZoneMap class="ov-zones" :groups="zoneGroups" />
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw, ref } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';
import { useIntervalFn } from '@vueuse/core';
import { form, secretsPresent } from '@/settingsForm';
import { adminAreasFor } from '@/navigation';
import { HEALTH_SERVICES, type AttentionSeverity } from '@/adminAttention';
import { zoneStates } from '@/adminZoneStates';
import { queryKeys } from '@/queryKeys';
import { useAdminAttention } from '@/composables/useAdminAttention';
import { useSession } from '@/composables/useSession';
import { formatFileSize, formatRelativeDate, parseApiDate } from '@/utils/format';
import OverviewKpis from '@/components/templates/monitor/MonitorKpis.vue';
import OverviewQuickActions from './overview/OverviewQuickActions.vue';
import OverviewServices, { type ServiceRow } from './overview/OverviewServices.vue';
import OverviewTasks from './overview/OverviewTasks.vue';
import OverviewTodo from '@/components/templates/monitor/MonitorAttention.vue';
import OverviewVerdict from '@/components/templates/monitor/MonitorVerdict.vue';
import OverviewZoneMap from '@/components/templates/monitor/MonitorZones.vue';
import type { MonitorKpi as OverviewKpi, MonitorZone as ZoneCard } from '@/components/templates/monitor/types';

// Les icônes des zones viennent du modèle de navigation : une seule source, qui suit
// les zones qu'on y ajoute.
const AREA_ICONS: Record<string, any> = Object.fromEntries(
  adminAreasFor(true).map((area) => [area.key, markRaw(area.icon)]),
);

const { isAdmin } = useSession();

const activeChannels = computed(() =>
  [
    ['Email', form.email_enabled],
    ['Discord', form.discord_enabled],
    ['Telegram', form.telegram_enabled],
    ['ntfy', form.ntfy_enabled],
    ['Gotify', form.gotify_enabled],
  ].filter(([, enabled]) => Boolean(enabled)).map(([name]) => String(name))
);
/* Les réglages arrivent après le premier rendu : tant que l'URL Plex et le jeton sont
   tous deux vides, on ne sait pas encore et on ne signale rien. */
const settingsLoaded = computed(() => Boolean(form.plex_url || secretsPresent.plex_token || form.public_base_url || form.poll_interval_seconds));
const attention = useAdminAttention({
  enabled: isAdmin,
  full: true,
  settings: () =>
    settingsLoaded.value
      ? { plex_url: form.plex_url, public_base_url: form.public_base_url, channels: activeChannels.value.length > 0 }
      : null,
});

const severityCount = (severity: AttentionSeverity) => attention.items.value.filter((item) => item.severity === severity).length;

type Tone = 'ok' | 'warn' | 'error' | 'off';

const serviceRows = computed<ServiceRow[]>(() =>
  Object.entries(HEALTH_SERVICES)
    .map(([key, meta]) => {
      const info = attention.services.value[key];
      if (!info?.state) return null;
      const tone: Tone = info.state === 'error' ? 'error' : info.state === 'ok' ? (Array.isArray(info.issues) && info.issues.length ? 'warn' : 'ok') : 'off';
      const instance = info.instance_name && info.instance_name.toLowerCase() !== meta.label.toLowerCase() ? info.instance_name : '';
      const state = tone === 'error' ? 'En erreur' : tone === 'warn' ? 'À surveiller' : tone === 'ok' ? 'Opérationnel' : info.state === 'disabled' ? 'Désactivé' : 'Non configuré';
      return { key, label: instance || meta.label, to: meta.to, tone, state };
    })
    .filter((row): row is ServiceRow => row !== null)
    .sort((a, b) => ['error', 'warn', 'ok', 'off'].indexOf(a.tone) - ['error', 'warn', 'ok', 'off'].indexOf(b.tone))
);

const plural = (count: number, one: string, other: string) => `${count} ${count > 1 ? other : one}`;

/* Quatre chiffres d'activité. Un bloc que le serveur n'a pas pu calculer s'affiche « – » :
   un zéro dirait « rien à signaler », ce qu'on ignore. */
const kpis = computed<OverviewKpi[]>(() => {
  const data = attention.overview.value;
  const pending = data?.requests?.pending_approval;
  const notifications = data?.notifications;
  const images = data?.images;
  const warm = data?.maintenance?.['warm-images'];
  const known = (value: number | undefined | null): value is number => typeof value === 'number';
  return [
    {
      key: 'approval',
      label: 'À approuver',
      to: '/discover/requests',
      value: known(pending) ? String(pending) : '–',
      unit: '',
      tone: !known(pending) ? 'off' : pending ? 'warn' : 'ok',
      status: !known(pending) ? 'Chargement…' : pending ? plural(pending, 'demande', 'demandes') : 'Aucune en attente',
    },
    {
      key: 'notifications',
      label: 'Notifications · 7 j',
      to: '/notifications',
      value: notifications ? String(notifications.sent_7d) : '–',
      unit: notifications ? 'envoyées' : '',
      spark: notifications?.by_day,
      tone: !notifications ? 'off' : notifications.hold || notifications.failed_7d ? 'warn' : 'ok',
      status: !notifications
        ? 'Chargement…'
        : notifications.hold
          ? 'Envoi suspendu'
          : notifications.failed_7d
            ? plural(notifications.failed_7d, 'échec', 'échecs')
            : notifications.queue
              ? `${notifications.queue} en attente`
              : 'Aucun échec',
    },
    {
      key: 'images',
      label: 'Images en cache',
      to: '/settings/maintenance',
      value: images ? formatFileSize(images.bytes) : '–',
      unit: '',
      tone: !images ? 'off' : 'ok',
      status: !images ? 'Chargement…' : warm ? `Préchargé ${formatRelativeDate(warm.finished_at).toLowerCase()}` : 'Jamais préchargé',
    },
  ];
});

const states = computed(() =>
  zoneStates({
    items: attention.items.value,
    services: attention.services.value,
    tasks: attention.tasks.value,
    version: attention.version.value,
    overview: attention.overview.value,
    settings: settingsLoaded.value
      ? {
          require_approval: form.require_approval,
          quota_movie_limit: form.quota_movie_limit,
          quota_show_limit: form.quota_show_limit,
          quota_period_days: form.quota_period_days,
          vf_upgrade_enabled: form.vf_upgrade_enabled,
          public_base_url: form.public_base_url,
          trusted_proxies: form.trusted_proxies,
          default_locale: form.default_locale,
          channels: activeChannels.value,
        }
      : null,
  })
);

const zoneGroups = computed(() => {
  const groups: Array<{ label: string; items: ZoneCard[] }> = [];
  for (const area of adminAreasFor(isAdmin.value)) {
    if (area.key === 'admin-overview') continue;
    const state = states.value[area.key];
    const card: ZoneCard = { key: area.key, label: area.label, to: area.to, icon: area.icon, line: state?.line || '', severity: state?.severity || null };
    const existing = groups.find((group) => group.label === area.group);
    if (existing) existing.items.push(card);
    else groups.push({ label: area.group, items: [card] });
  }
  return groups;
});

const queryClient = useQueryClient();
const refreshing = ref(false);
async function refresh(): Promise<void> {
  refreshing.value = true;
  try {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['health'] }),
      queryClient.invalidateQueries({ queryKey: ['settings', 'scheduled-tasks'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.overview }),
    ]);
  } finally {
    refreshing.value = false;
  }
}

const now = ref(new Date());
useIntervalFn(() => { now.value = new Date(); }, 30_000);
const checkedLabel = computed(() => {
  const raw = attention.checkedAt.value;
  if (!raw) return 'Vérifier';
  const seconds = Math.max(0, Math.floor((now.value.getTime() - parseApiDate(raw).getTime()) / 1000));
  if (seconds < 60) return 'Vérifié à l’instant';
  if (seconds < 3600) return `Vérifié il y a ${Math.floor(seconds / 60)} min`;
  return `Vérifié il y a ${Math.floor(seconds / 3600)} h`;
});
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

/* Bureau : le verdict et les chiffres en tête, ce qui demande une action à côté des actions
   rapides, l'état des services et des tâches, puis la carte des zones. */
.admin-overview {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  grid-template-areas:
    'verdict verdict'
    'kpis kpis'
    'todo actions'
    'services tasks'
    'zones zones';
  gap: var(--space-5) var(--space-4);
  min-width: 0;
}
.ov-verdict { grid-area: verdict; }
.ov-kpis { grid-area: kpis; }
.ov-todo { grid-area: todo; }
.ov-actions { grid-area: actions; }
.ov-services { grid-area: services; }
.ov-tasks { grid-area: tasks; }
.ov-zones { grid-area: zones; }

@include bp.until(desktop) {
  .admin-overview {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'verdict'
      'kpis'
      'todo'
      'actions'
      'services'
      'tasks'
      'zones';
  }
}

/* Téléphone : pas de barre latérale, la carte des zones est le menu. Le verdict et ce qui
   demande une action passent d'abord ; les chiffres et le détail viennent après. */
@include bp.until(shell-medium) {
  .admin-overview {
    grid-template-areas:
      'verdict'
      'todo'
      'zones'
      'kpis'
      'actions'
      'services'
      'tasks';
    gap: var(--space-4);
  }
}
</style>
