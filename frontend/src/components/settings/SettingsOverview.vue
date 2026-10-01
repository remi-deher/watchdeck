<template>
  <div class="admin-overview">
    <!-- Quatre chiffres pour situer l'instance ; le détail vient dessous, dans la liste. -->
    <section class="admin-overview__kpis" aria-label="État de l’instance">
      <RouterLink v-for="kpi in kpis" :key="kpi.key" class="admin-kpi" :to="kpi.to">
        <span class="admin-kpi__label">{{ kpi.label }}</span>
        <strong class="admin-kpi__value">{{ kpi.value }}<small v-if="kpi.unit">{{ kpi.unit }}</small></strong>
        <span class="admin-pill" :class="`is-${kpi.tone}`">{{ kpi.status }}</span>
      </RouterLink>
    </section>

    <section class="admin-overview__block is-todo" aria-labelledby="admin-todo-title">
      <header class="admin-overview__head">
        <h2 id="admin-todo-title">À traiter</h2>
        <span v-if="attention.items.value.length" class="admin-overview__meta">par gravité</span>
        <span class="admin-overview__spacer"></span>
        <UiButton variant="ghost" size="sm" :loading="refreshing" @click="refresh">
          <template #icon><RefreshCw /></template>{{ checkedLabel }}
        </UiButton>
      </header>
      <ul v-if="attention.items.value.length" class="admin-todo">
        <li v-for="item in attention.items.value" :key="item.key" class="admin-todo__item" :class="`is-${item.severity}`">
          <span class="admin-todo__icon"><component :is="AREA_ICONS[item.area]" aria-hidden="true" /></span>
          <span class="sr-only">{{ SEVERITY_LABELS[item.severity] }} :</span>
          <div class="admin-todo__text">
            <strong>{{ item.title }}</strong>
            <span>{{ item.detail }}</span>
          </div>
          <RouterLink class="admin-todo__action" :class="{ 'is-primary': item.severity === 'error' }" :to="item.action.to">
            {{ item.action.label }}
          </RouterLink>
        </li>
      </ul>
      <UiEmptyState
        v-else-if="!attention.loading.value"
        :icon="CheckCircle2"
        title="Rien à traiter"
        message="Les services répondent, les tâches planifiées passent et la configuration est complète."
      />
      <p v-else class="admin-overview__loading">Vérification des services…</p>
    </section>

    <section v-if="serviceRows.length" class="admin-overview__block is-services" aria-labelledby="admin-services-title">
      <header class="admin-overview__head">
        <h2 id="admin-services-title">Connexions</h2>
        <span class="admin-overview__spacer"></span>
        <RouterLink class="admin-overview__more" to="/settings/services/integrations">Tout voir</RouterLink>
      </header>
      <ul class="admin-services">
        <li v-for="row in serviceRows" :key="row.key">
          <RouterLink class="admin-service" :to="row.to" :class="`is-${row.tone}`">
            <span class="admin-dot" :class="`is-${row.tone}`" aria-hidden="true"></span>
            <span class="admin-service__name">{{ row.label }}</span>
            <span class="admin-service__state">{{ row.state }}</span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <!-- Sur téléphone il n'y a pas de barre latérale : l'accueil sert aussi de sommaire,
         comme l'écran Réglages d'un téléphone. -->
    <section class="admin-overview__areas" aria-label="Groupes de l’administration">
      <template v-for="group in areaGroups" :key="group.label">
        <p v-if="group.label" class="admin-overview__areas-label">{{ group.label }}</p>
        <ul class="admin-areas">
          <li v-for="area in group.items" :key="area.key">
            <RouterLink class="admin-area" :to="area.to">
              <span class="admin-area__icon"><component :is="area.icon" aria-hidden="true" /></span>
              <span class="admin-area__text"><strong>{{ area.label }}</strong><small>{{ area.summary }}</small></span>
              <span v-if="area.severity" class="admin-dot" :class="`is-${area.severity}`" aria-hidden="true"></span>
              <ChevronRight class="admin-area__chevron" aria-hidden="true" />
            </RouterLink>
          </li>
        </ul>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useQueryClient } from '@tanstack/vue-query';
import { useIntervalFn } from '@vueuse/core';
import { Bell, CheckCircle2, ChevronRight, DatabaseZap, Plug, RefreshCw, Zap } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import { form, secretsPresent } from '@/settingsForm';
import { adminAreasFor } from '@/navigation';
import { HEALTH_SERVICES, type AttentionArea, type AttentionSeverity } from '@/adminAttention';
import { useAdminAttention } from '@/composables/useAdminAttention';
import { useSession } from '@/composables/useSession';
import { parseApiDate } from '@/utils/format';

const AREA_ICONS: Record<AttentionArea, any> = {
  'admin-connections': markRaw(Plug),
  'admin-automation': markRaw(Zap),
  'admin-notifications': markRaw(Bell),
  'admin-system': markRaw(DatabaseZap),
};
const SEVERITY_LABELS: Record<AttentionSeverity, string> = { error: 'Erreur', warn: 'À surveiller', info: 'Information' };

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

type Tone = 'ok' | 'warn' | 'error' | 'off';

const serviceRows = computed(() =>
  Object.entries(HEALTH_SERVICES)
    .map(([key, meta]) => {
      const info = attention.services.value[key];
      if (!info?.state) return null;
      const tone: Tone = info.state === 'error' ? 'error' : info.state === 'ok' ? (Array.isArray(info.issues) && info.issues.length ? 'warn' : 'ok') : 'off';
      const instance = info.instance_name && info.instance_name.toLowerCase() !== meta.label.toLowerCase() ? info.instance_name : '';
      const state = tone === 'error' ? 'En erreur' : tone === 'warn' ? 'À surveiller' : tone === 'ok' ? 'Opérationnel' : info.state === 'disabled' ? 'Désactivé' : 'Non configuré';
      return { key, label: instance || meta.label, to: meta.to, tone, state };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => ['error', 'warn', 'ok', 'off'].indexOf(a.tone) - ['error', 'warn', 'ok', 'off'].indexOf(b.tone))
);

const kpis = computed(() => {
  const rows = serviceRows.value;
  const used = rows.filter((row) => row.tone !== 'off');
  const errors = rows.filter((row) => row.tone === 'error').length;
  const warns = rows.filter((row) => row.tone === 'warn').length;
  const tasks = attention.tasks.value;
  const failed = tasks.filter((task) => task.state?.status === 'failed').length;
  const version = attention.version.value;
  const channels = activeChannels.value;
  return [
    {
      key: 'connections',
      label: 'Connexions',
      to: '/settings/services/integrations',
      value: rows.length ? `${used.length - errors}` : '–',
      unit: rows.length ? `/ ${used.length} en ligne` : '',
      tone: errors ? 'error' : warns ? 'warn' : rows.length ? 'ok' : 'off',
      status: errors ? `${errors} en erreur` : warns ? `${warns} à surveiller` : rows.length ? 'Tout répond' : 'Vérification…',
    },
    {
      key: 'tasks',
      label: 'Tâches planifiées',
      to: '/settings/automation/scheduled-tasks',
      value: tasks.length ? String(tasks.length) : '–',
      unit: tasks.length ? 'tâches' : '',
      tone: failed ? 'warn' : tasks.length ? 'ok' : 'off',
      status: failed ? `${failed} en échec` : tasks.length ? 'Toutes passent' : 'Chargement…',
    },
    {
      key: 'notifications',
      label: 'Notifications',
      to: '/settings/notifications/channels',
      value: settingsLoaded.value ? String(channels.length) : '–',
      unit: settingsLoaded.value ? (channels.length > 1 ? 'canaux actifs' : 'canal actif') : '',
      tone: !settingsLoaded.value ? 'off' : channels.length ? 'ok' : 'info',
      status: !settingsLoaded.value ? 'Chargement…' : channels.length ? channels.join(', ') : 'Aucun canal',
    },
    {
      key: 'version',
      label: 'Version',
      to: '/settings/system/version',
      value: version?.version ? version.version.replace(/^v/, '') : '–',
      unit: '',
      tone: !version ? 'off' : version.is_latest === false ? 'info' : 'ok',
      status: !version ? 'Chargement…' : version.is_latest === false ? 'Mise à jour disponible' : 'À jour',
    },
  ];
});

const areaGroups = computed(() => {
  const groups: Array<{ label: string; items: Array<{ key: string; label: string; to: any; icon: any; summary: string; severity: AttentionSeverity | null }> }> = [];
  for (const area of adminAreasFor(isAdmin.value)) {
    if (area.key === 'admin-overview') continue;
    const item = { key: area.key, label: area.label, to: area.to, icon: area.icon, summary: areaSummary(area.key), severity: attention.severityOf(area.key) };
    const existing = groups.find((group) => group.label === area.group);
    if (existing) existing.items.push(item);
    else groups.push({ label: area.group, items: [item] });
  }
  return groups;
});

function areaSummary(key: string): string {
  if (key === 'admin-connections') return 'Plex, Sonarr, Radarr, clients, TMDB, webhooks';
  if (key === 'admin-automation') return 'Téléchargements, améliorations VF, tâches planifiées';
  if (key === 'admin-notifications') return 'Canaux, règles, modèles d’emails, historique';
  if (key === 'admin-users') return 'Comptes, rôles, synchronisation';
  if (key === 'admin-system') return 'Données, journaux, version';
  return '';
}

const queryClient = useQueryClient();
const refreshing = ref(false);
async function refresh(): Promise<void> {
  refreshing.value = true;
  try {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['health'] }),
      queryClient.invalidateQueries({ queryKey: ['settings', 'scheduled-tasks'] }),
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

.admin-overview { display: grid; gap: var(--space-6); min-width: 0; }

.admin-overview__kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); }
.admin-kpi {
  display: grid;
  gap: var(--space-1);
  align-content: start;
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  min-width: 0;
}
.admin-kpi:hover { border-color: var(--border-hover); }
.admin-kpi:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.admin-kpi__label { color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.admin-kpi__value { font-family: var(--font-display); font-size: var(--fs-xl); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.admin-kpi__value small { margin-left: .35em; color: var(--muted); font-family: var(--font-sans); font-size: var(--fs-sm); font-weight: 500; }

.admin-pill {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 6px;
  max-width: 100%;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.admin-pill::before { content: ''; flex: none; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.admin-pill.is-ok { color: var(--green-text); background: color-mix(in srgb, var(--green) 12%, transparent); }
.admin-pill.is-warn { color: var(--amber-text); background: color-mix(in srgb, var(--amber) 14%, transparent); }
.admin-pill.is-error { color: var(--red-text); background: color-mix(in srgb, var(--red) 14%, transparent); }
.admin-pill.is-info { color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }

.admin-overview__block { display: grid; gap: var(--space-3); min-width: 0; }
.admin-overview__head { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.admin-overview__head h2 { margin: 0; font-family: var(--font-display); font-size: var(--fs-lg); }
.admin-overview__meta { color: var(--muted); font-size: var(--fs-sm); }
.admin-overview__spacer { flex: 1; }
.admin-overview__more { color: var(--muted); font-size: var(--fs-sm); text-decoration: none; }
.admin-overview__more:hover { color: var(--accent); }
.admin-overview__loading { margin: 0; color: var(--muted); font-size: var(--fs-sm); }

.admin-todo {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
  overflow: hidden;
}
.admin-todo__item {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4) var(--space-3) calc(var(--space-4) + 4px);
}
.admin-todo__item + .admin-todo__item { border-top: 1px solid var(--divider); }
/* La gravité se lit dans la marge : un trait de couleur, doublé d'un libellé pour les
   lecteurs d'écran. */
.admin-todo__item::before { content: ''; position: absolute; left: 8px; top: 12px; bottom: 12px; width: 3px; border-radius: 3px; background: var(--muted); }
.admin-todo__item.is-error::before { background: var(--red); }
.admin-todo__item.is-warn::before { background: var(--amber); }
.admin-todo__icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: var(--radius-sm); background: var(--surface-2); color: var(--muted); }
.admin-todo__icon svg { width: 17px; height: 17px; }
.admin-todo__text { display: grid; gap: 2px; min-width: 0; }
.admin-todo__text strong { font-size: var(--fs-md); }
.admin-todo__text span { color: var(--muted); font-size: var(--fs-sm); overflow-wrap: anywhere; }
.admin-todo__action {
  padding: 6px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--btn-radius);
  color: var(--text);
  font-size: var(--fs-sm);
  font-weight: 650;
  text-decoration: none;
  white-space: nowrap;
}
.admin-todo__action:hover { border-color: var(--accent); color: var(--accent); }
.admin-todo__action.is-primary { border-color: transparent; background: var(--accent); color: var(--on-accent); }
.admin-todo__action.is-primary:hover { background: var(--accent-hover); color: var(--on-accent); }

.admin-services { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.admin-service {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--touch-target);
  padding: 0 var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  min-width: 0;
}
.admin-service:hover { border-color: var(--border-hover); }
.admin-service__name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.admin-service__state { margin-left: auto; color: var(--muted); font-size: var(--fs-xs); white-space: nowrap; }
.admin-service.is-off .admin-service__name { color: var(--muted); font-weight: 500; }

.admin-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.admin-dot.is-ok { background: var(--green); }
.admin-dot.is-warn { background: var(--amber); }
.admin-dot.is-error { background: var(--red); }
.admin-dot.is-info { background: var(--accent); }

.admin-overview__areas { display: none; gap: var(--space-2); }
.admin-overview__areas-label { margin: var(--space-2) var(--space-1) 0; color: var(--muted); font-size: var(--fs-xs); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.admin-areas { margin: 0; padding: 0; list-style: none; border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface); overflow: hidden; }
.admin-areas li + li { border-top: 1px solid var(--divider); }
.admin-area { display: flex; align-items: center; gap: var(--space-3); min-height: 56px; padding: var(--space-2) var(--space-3); color: var(--text); text-decoration: none; }
.admin-area__icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: var(--radius-sm); background: var(--surface-2); color: var(--muted); }
.admin-area__icon svg { width: 17px; height: 17px; }
.admin-area__text { display: grid; flex: 1; min-width: 0; }
.admin-area__text small { color: var(--muted); font-size: var(--fs-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.admin-area__chevron { flex: none; width: 18px; height: 18px; color: var(--muted); }

@include bp.until(desktop) {
  .admin-overview__kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@include bp.until(shell-medium) {
  .admin-overview { gap: var(--space-5); }
  /* Ce qui est cassé d'abord, puis le sommaire ; les chiffres et la grille des
     connexions passent après. */
  .admin-overview__block.is-todo { order: 1; }
  .admin-overview__areas { display: grid; order: 2; }
  .admin-overview__kpis { order: 3; }
  .admin-overview__block.is-services { order: 4; }
  .admin-todo__item { grid-template-columns: minmax(0, 1fr) auto; }
  .admin-todo__icon { display: none; }
}
</style>
