<template>
  <!-- Sante des services : un verdict d'ensemble d'abord, puis une ligne par service,
       les pannes en tete. Un service a corriger ou a configurer porte son lien vers le
       bon onglet des reglages, a la place de sa latence. -->
  <section class="panel service-health" :aria-busy="!health || undefined">
    <header class="service-health-head">
      <div class="service-health-heading">
        <h2>Santé des services</h2>
        <p>{{ updatedLabel }}</p>
      </div>
      <span class="service-health-verdict" :class="`is-${verdict.tone}`">
        <component :is="verdict.icon" aria-hidden="true" />{{ verdict.label }}
      </span>
      <UiButton
        variant="ghost"
        size="sm"
        icon-only
        aria-label="Vérifier à nouveau"
        :loading="healthQuery.isFetching.value"
        @click="refresh"
      ><RefreshCw :size="16" /></UiButton>
    </header>

    <div class="service-health-meter" role="img" :aria-label="meterLabel">
      <i v-for="row in rows" :key="row.key" :class="`is-${row.tone}`"></i>
    </div>

    <ul class="service-health-list">
      <li v-for="row in rows" :key="row.key" class="service-row" :class="`is-${row.tone}`">
        <span class="service-row-icon"><component :is="row.icon" aria-hidden="true" /></span>
        <span class="service-row-main">
          <strong>{{ row.label }}</strong>
          <span :title="row.detail">{{ row.status }}</span>
        </span>
        <RouterLink v-if="row.action" :to="row.action.to" class="service-row-action">{{ row.action.label }}</RouterLink>
        <span v-else-if="row.latency" class="service-row-latency" :class="`is-${row.latency.tone}`">{{ row.latency.label }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useIntervalFn } from '@vueuse/core';
import { AlertTriangle, CheckCircle2, CircleHelp, Compass, Mail, RefreshCw, Rss, Search, Server, Tv, Video, XCircle } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import { parseApiDate } from '@/utils/format';

type Tone = 'ok' | 'error' | 'off' | 'loading';
interface ServiceInfo { ok?: boolean | null; state?: string; message?: string; response_ms?: number | null; action_url?: string; action_label?: string }
interface HealthPayload { status?: 'healthy' | 'degraded' | 'down'; checked_at?: string; services?: Record<string, ServiceInfo> }

const CACHE_KEY = 'watchdeck.vue.health';
const SERVICES: Record<string, [string, any]> = {
  plex: ['Plex', Server],
  sonarr: ['Sonarr', Tv],
  radarr: ['Radarr', Video],
  prowlarr: ['Prowlarr', Search],
  seer: ['Seer', Compass],
  rss: ['Watchlist Plex', Rss],
  smtp: ['E-mail', Mail],
};
/* Les pannes d'abord, puis ce qui tourne, puis ce qui n'est pas branche. */
const ORDER: Record<Tone, number> = { error: 0, loading: 1, ok: 2, off: 3 };

function displayCache(): HealthPayload | undefined {
  // Cache d'affichage uniquement : TanStack Query reste la source de verite et le TTL.
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')?.data || undefined; }
  catch { return undefined; }
}

const queryClient = useQueryClient();
const healthQuery = useQuery({
  queryKey: ['health'],
  queryFn: () => api<HealthPayload>('/api/health'),
  staleTime: 30_000,
  placeholderData: displayCache(),
});
const health = computed(() => healthQuery.data.value || null);

function toneOf(info: ServiceInfo | undefined): Tone {
  if (!info?.state) return 'loading';
  if (info.state === 'ok') return 'ok';
  if (info.state === 'error') return 'error';
  return 'off';
}
function statusOf(info: ServiceInfo | undefined, tone: Tone): string {
  if (tone === 'loading') return 'Vérification…';
  if (tone === 'error') return info?.message && info.message !== 'OK' ? info.message : 'Injoignable';
  if (tone === 'off') return info?.state === 'disabled' ? 'Désactivé' : 'Non configuré';
  return info?.response_ms != null ? 'Opérationnel' : 'Configuré';
}
/* Au-dela d'une seconde, la reponse est lente : le chiffre passe a l'ambre. */
function latencyOf(ms: number | null | undefined) {
  if (ms == null) return null;
  const rounded = Math.round(ms);
  return { label: rounded >= 1000 ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : `${rounded} ms`, tone: ms >= 1000 ? 'slow' : 'fast' };
}

const rows = computed(() =>
  Object.entries(SERVICES)
    .map(([key, [label, icon]]) => {
      const info = health.value?.services?.[key];
      const tone = toneOf(info);
      const actionable = (tone === 'error' || tone === 'off') && info?.action_url;
      return {
        key,
        label,
        icon,
        tone,
        status: statusOf(info, tone),
        detail: info?.message || '',
        latency: tone === 'ok' ? latencyOf(info?.response_ms) : null,
        action: actionable ? { to: info!.action_url!, label: tone === 'error' ? 'Corriger' : (info?.action_label || 'Configurer') } : null,
      };
    })
    .sort((a, b) => ORDER[a.tone] - ORDER[b.tone])
);

const counts = computed(() => ({
  ok: rows.value.filter((r) => r.tone === 'ok').length,
  error: rows.value.filter((r) => r.tone === 'error').length,
  off: rows.value.filter((r) => r.tone === 'off').length,
}));

const verdict = computed(() => {
  if (!health.value?.services) return { tone: 'loading', label: 'Vérification…', icon: CircleHelp };
  const { error } = counts.value;
  if (!error) return { tone: 'ok', label: 'Tout fonctionne', icon: CheckCircle2 };
  const label = `${error} service${error > 1 ? 's' : ''} en panne`;
  return health.value.status === 'down'
    ? { tone: 'error', label, icon: XCircle }
    : { tone: 'warn', label, icon: AlertTriangle };
});

const meterLabel = computed(() => {
  const { ok, error, off } = counts.value;
  return `${ok} opérationnel${ok > 1 ? 's' : ''}, ${error} en panne, ${off} non utilisé${off > 1 ? 's' : ''}`;
});

const now = ref(new Date());
useIntervalFn(() => { now.value = new Date(); }, 30_000);
const updatedLabel = computed(() => {
  const checkedAt = health.value?.checked_at ? parseApiDate(health.value.checked_at) : null;
  if (!checkedAt) return 'Première vérification en cours';
  const seconds = Math.max(0, Math.floor((now.value.getTime() - checkedAt.getTime()) / 1000));
  if (seconds < 60) return 'Vérifié à l’instant';
  if (seconds < 3600) return `Vérifié il y a ${Math.floor(seconds / 60)} min`;
  return `Vérifié il y a ${Math.floor(seconds / 3600)} h`;
});

function refresh() {
  void queryClient.invalidateQueries({ queryKey: ['health'] });
}

watch(() => healthQuery.data.value, (data) => {
  if (!data) return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* stockage indisponible */ }
});

useRealtime(['health.updated'], (_type, detail: any) => {
  if (detail && detail.services) queryClient.setQueryData(['health'], detail);
  else void queryClient.invalidateQueries({ queryKey: ['health'] });
});
</script>

<style scoped lang="scss">
.service-health { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.service-health-head { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.service-health-heading { display: grid; gap: 2px; flex: 1; min-width: 0; }
.service-health-heading h2 { margin: 0; font-size: var(--fs-lg); }
.service-health-heading p { margin: 0; color: var(--muted); font-size: var(--fs-xs); }
.service-health-verdict { display: inline-flex; align-items: center; gap: 6px; flex: none; padding: 4px 10px; border-radius: var(--radius-pill); font-size: var(--fs-xs); font-weight: 700; background: var(--surface-2); color: var(--muted); }
.service-health-verdict svg { width: 14px; height: 14px; }
.service-health-verdict.is-ok { background: color-mix(in srgb, var(--green) 12%, transparent); color: var(--green-text); }
.service-health-verdict.is-warn { background: color-mix(in srgb, var(--amber) 14%, transparent); color: var(--amber-text); }
.service-health-verdict.is-error { background: color-mix(in srgb, var(--red) 12%, transparent); color: var(--red-text); }

/* Une barre segmentee, un segment par service : l'etat d'ensemble se lit d'un coup d'oeil. */
.service-health-meter { display: flex; gap: 3px; height: 6px; }
.service-health-meter i { flex: 1; border-radius: var(--radius-pill); background: rgb(var(--ink) / .1); }
.service-health-meter i.is-ok { background: var(--green); }
.service-health-meter i.is-error { background: var(--red); }

/* Les lignes se partagent la hauteur du panneau, cale sur la pile voisine : pas de trou sous la derniere. */
.service-health-list { display: grid; grid-auto-rows: minmax(min-content, 1fr); flex: 1; gap: 2px; margin: 0; padding: 0; list-style: none; }
.service-row { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: var(--space-3); align-items: center; padding: 8px 10px; border-radius: var(--inset-radius); }
.service-row:nth-child(odd) { background: var(--surface-2); }
.service-row-icon { position: relative; display: grid; place-items: center; width: 34px; height: 34px; border-radius: var(--radius-sm); background: var(--surface); color: var(--muted); }
.service-row-icon svg { width: 18px; height: 18px; }
/* Pastille d'etat sur l'icone ; le libelle a cote dit la meme chose en toutes lettres. */
.service-row-icon::after { content: ''; position: absolute; right: -2px; bottom: -2px; width: 10px; height: 10px; border: 2px solid var(--surface); border-radius: 50%; background: var(--muted); }
.service-row.is-ok .service-row-icon::after { background: var(--green); }
.service-row.is-error .service-row-icon::after { background: var(--red); }
.service-row.is-error .service-row-icon { color: var(--red-text); }
.service-row.is-off { opacity: .72; }
.service-row.is-off .service-row-icon::after { background: transparent; border-color: var(--muted); }
.service-row-main { display: grid; gap: 1px; min-width: 0; }
.service-row-main strong { font-size: var(--fs-sm); }
.service-row-main span { overflow: hidden; color: var(--muted); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.service-row.is-error .service-row-main span { color: var(--red-text); }
.service-row-latency { font-size: var(--fs-xs); font-weight: 650; font-variant-numeric: tabular-nums; color: var(--muted); }
.service-row-latency.is-slow { color: var(--amber-text); }
.service-row-action { padding: 3px 10px; border: 1px solid var(--border); border-radius: var(--radius-pill); color: var(--text); font-size: var(--fs-xs); font-weight: 650; text-decoration: none; }
.service-row-action:hover { border-color: var(--accent); color: var(--accent); }
.service-row.is-error .service-row-action { border-color: color-mix(in srgb, var(--red) 50%, var(--border)); color: var(--red-text); }
</style>
