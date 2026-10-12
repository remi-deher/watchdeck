<template>
  <!-- Vue d'ensemble de l'administration (gabarit Surveiller) : un verdict, les chiffres d'activité, ce qui
       demande une action, puis la carte des zones. Les actions rapides, l'état des services et celui des
       tâches sont les panneaux complémentaires du gabarit. -->
  <MonitorTemplate
    :items="attention.items.value"
    :kpis="kpis"
    :zones="zoneGroups"
    :icons="AREA_ICONS"
    :loading="attention.loading.value"
  >
    <template #details>
      <div class="overview-details">
        <OverviewQuickActions :maintenance="attention.overview.value?.maintenance" @started="refresh" />
        <OverviewServices v-if="serviceRows.length" :rows="serviceRows" />
        <OverviewTasks v-if="attention.tasks.value.length" :tasks="attention.tasks.value" />
      </div>
    </template>
  </MonitorTemplate>
</template>

<script setup lang="ts">
import { computed, markRaw, ref } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';
import { useIntervalFn } from '@vueuse/core';
import { form, secretsPresent } from '@/settingsForm';
import { adminAreasFor } from '@/navigation';
import { HEALTH_SERVICES } from '@/adminAttention';
import { zoneStates } from '@/adminZoneStates';
import { queryKeys } from '@/queryKeys';
import { useAdminAttention } from '@/composables/useAdminAttention';
import { useSession } from '@/composables/useSession';
import { formatFileSize, formatRelativeDate, parseApiDate } from '@/utils/format';
import MonitorTemplate from '@/components/templates/MonitorTemplate.vue';
import OverviewQuickActions from './overview/OverviewQuickActions.vue';
import OverviewServices, { type ServiceRow } from './overview/OverviewServices.vue';
import OverviewTasks from './overview/OverviewTasks.vue';
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



const serviceRows = computed<ServiceRow[]>(() =>
  Object.entries(HEALTH_SERVICES)
    .map<ServiceRow | null>(([key, meta]) => {
      const info = attention.services.value[key];
      if (!info?.state && !info?.health) return null;
      return { key, label: meta.label, to: meta.to, service: info };
    })
    .filter((row): row is ServiceRow => row !== null)
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
</script>

<style scoped lang="scss">
.overview-details { display: grid; gap: var(--space-4); min-width: 0; }
</style>
