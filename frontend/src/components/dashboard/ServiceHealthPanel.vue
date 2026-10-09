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
      <li v-for="row in rows" :key="row.key" class="service-row" :class="[`is-${row.tone}`, { 'is-open': openKey === row.key }]">
        <span class="service-row-icon"><component :is="row.icon" aria-hidden="true" /></span>
        <span class="service-row-main">
          <span class="service-row-title">
            <strong>{{ row.label }}</strong>
            <small v-if="row.instanceName">{{ row.instanceName }}</small>
            <span v-if="row.update" class="service-row-flag">Mise à jour disponible</span>
          </span>
          <span class="service-row-facts" :title="row.detail">{{ row.facts }}</span>
        </span>
        <span class="service-row-side">
          <button
            v-if="row.issues.length"
            type="button"
            class="service-row-issues-toggle"
            :aria-expanded="openKey === row.key"
            :aria-controls="`service-issues-${row.key}`"
            @click="toggle(row.key)"
          >{{ row.issueLabel }}<ChevronDown aria-hidden="true" /></button>
          <RouterLink v-if="row.action" :to="row.action.to" class="service-row-action">{{ row.action.label }}</RouterLink>
          <span v-else-if="row.latency" class="service-row-latency" :class="`is-${row.latency.tone}`">{{ row.latency.label }}</span>
        </span>
        <ul v-if="row.issues.length && openKey === row.key" :id="`service-issues-${row.key}`" class="service-row-issues">
          <li v-for="(issue, index) in row.issues" :key="index" :class="`is-${issue.level}`">
            <component :is="issue.level === 'error' ? XCircle : AlertTriangle" aria-hidden="true" />{{ issue.message }}
          </li>
          <li v-if="row.hiddenIssues" class="is-more">et {{ row.hiddenIssues }} autre{{ row.hiddenIssues > 1 ? 's' : '' }} dans {{ row.label }}</li>
        </ul>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { formatUptime, formatCheckedAgo } from '@/utils/format';
import { computed, ref, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useIntervalFn } from '@vueuse/core';
import { AlertTriangle, CheckCircle2, ChevronDown, CircleHelp, Compass, Mail, RefreshCw, Rss, Search, Server, Tv, Video, XCircle } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import { formatRelativeDate, parseApiDate } from '@/utils/format';

type Tone = 'ok' | 'warn' | 'error' | 'off' | 'loading';
interface ServiceIssue { level: 'warning' | 'error'; message: string }
interface ServiceInfo {
  ok?: boolean | null; state?: string; message?: string; response_ms?: number | null; action_url?: string; action_label?: string;
  /* Details facultatifs, lus sur le service lui-meme (voir service_health_details.py). */
  version?: string; instance_name?: string; started_at?: string; platform?: string; instances?: number;
  sessions?: number; update_available?: boolean; providers?: string[]; last_activity_at?: string; items?: number;
  issues?: ServiceIssue[]; issue_count?: number;
}
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
const ORDER: Record<Tone, number> = { error: 0, warn: 1, loading: 2, ok: 3, off: 4 };

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
const now = ref(new Date());
useIntervalFn(() => { now.value = new Date(); }, 30_000);

function toneOf(info: ServiceInfo | undefined): Tone {
  if (!info?.state) return 'loading';
  if (info.state === 'ok') return info.issues?.length ? 'warn' : 'ok';
  if (info.state === 'error') return 'error';
  return 'off';
}
function statusOf(info: ServiceInfo | undefined, tone: Tone): string {
  if (tone === 'loading') return 'Vérification…';
  if (tone === 'error') return info?.message && info.message !== 'OK' ? info.message : 'Injoignable';
  if (tone === 'off') return info?.state === 'disabled' ? 'Désactivé' : 'Non configuré';
  return info?.response_ms != null ? 'Opérationnel' : 'Configuré';
}
/* « depuis 3 j » : depuis quand le service tourne sans redemarrage. */
/* « 4.0.9.2244 » devient « 4.0.9 » : le numero de build n'aide pas a lire la carte. */
function shortVersion(version: string): string {
  return version.split('.').slice(0, 3).join('.');
}
function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}
/* Une ligne de faits par service : ce qu'il est et ce qu'il fait, sans repeter son etat
   (la pastille et la barre le disent deja). Un service en panne ou non branche garde
   son message d'etat. */
function factsOf(key: string, info: ServiceInfo | undefined, tone: Tone, now: Date): string {
  if (tone !== 'ok' && tone !== 'warn') return statusOf(info, tone);
  const facts: string[] = [];
  if (key === 'smtp') {
    const providers = info?.providers || [];
    if (providers.length) facts.push(providers.length > 2 ? `${providers[0]} + ${providers.length - 1} autres` : providers.join(', '));
    if (info?.last_activity_at) facts.push(`dernier envoi ${lowerFirst(formatRelativeDate(info.last_activity_at))}`);
  } else if (key === 'rss') {
    if (info?.last_activity_at) facts.push(`relevée ${lowerFirst(formatRelativeDate(info.last_activity_at))}`);
    if (info?.items != null) facts.push(`${info.items} élément${info.items > 1 ? 's' : ''}`);
  } else {
    if (info?.version) facts.push(`v${shortVersion(info.version)}`);
    if (info?.instances && info.instances > 1) facts.push(`${info.instances} instances`);
    if (key === 'plex' && info?.sessions != null) {
      facts.push(info.sessions ? `${info.sessions} lecture${info.sessions > 1 ? 's' : ''} en cours` : 'aucune lecture');
    }
    const uptime = formatUptime(info?.started_at, now);
    if (uptime) facts.push(uptime);
  }
  return facts.length ? facts.join(' · ') : statusOf(info, tone);
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
      const issues = tone === 'warn' ? info?.issues || [] : [];
      const issueCount = Math.max(issues.length, info?.issue_count || 0);
      /* Le nom de l'instance n'apparait que s'il apprend quelque chose (« Sonarr 4K »). */
      const instanceName = info?.instance_name && info.instance_name.toLowerCase() !== label.toLowerCase() ? info.instance_name : '';
      return {
        key,
        label,
        icon,
        tone,
        instanceName: tone === 'ok' || tone === 'warn' ? instanceName : '',
        update: Boolean(info?.update_available),
        facts: factsOf(key, info, tone, now.value),
        detail: info?.message || '',
        issues,
        hiddenIssues: Math.max(0, issueCount - issues.length),
        issueLabel: `${issueCount} alerte${issueCount > 1 ? 's' : ''}`,
        latency: tone === 'ok' || tone === 'warn' ? latencyOf(info?.response_ms) : null,
        action: actionable ? { to: info!.action_url!, label: tone === 'error' ? 'Corriger' : (info?.action_label || 'Configurer') } : null,
      };
    })
    .sort((a, b) => ORDER[a.tone] - ORDER[b.tone])
);

const openKey = ref<string | null>(null);
function toggle(key: string) {
  openKey.value = openKey.value === key ? null : key;
}

const counts = computed(() => ({
  ok: rows.value.filter((r) => r.tone === 'ok' || r.tone === 'warn').length,
  warn: rows.value.filter((r) => r.tone === 'warn').length,
  error: rows.value.filter((r) => r.tone === 'error').length,
  off: rows.value.filter((r) => r.tone === 'off').length,
}));

const verdict = computed(() => {
  if (!health.value?.services) return { tone: 'loading', label: 'Vérification…', icon: CircleHelp };
  const { error, warn } = counts.value;
  if (!error && warn) return { tone: 'warn', label: `${warn} service${warn > 1 ? 's' : ''} à surveiller`, icon: AlertTriangle };
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

const updatedLabel = computed(() => {
  const checkedAt = health.value?.checked_at ? parseApiDate(health.value.checked_at) : null;
  if (!checkedAt) return 'Première vérification en cours';
  return formatCheckedAgo(checkedAt, now.value);
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
.service-health { container: health / inline-size; display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.service-health-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); min-width: 0; }
.service-health-heading { display: grid; gap: 2px; flex: 1 1 auto; min-width: min(190px, 100%); }
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
.service-health-meter i.is-warn { background: var(--amber); }
.service-health-meter i.is-error { background: var(--red); }

/* Les lignes se partagent la place laissee par la pile voisine (pas de trou sous la
   derniere), chacune a partir de sa propre hauteur : une ligne depliee ne grandit
   pas les autres. */
.service-health-list { display: flex; flex-direction: column; flex: 1; gap: 2px; margin: 0; padding: 0; list-style: none; }
.service-health-list > .service-row { flex: 1 0 auto; }
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
.service-row.is-warn .service-row-icon::after { background: var(--amber); }
.service-row-main { display: grid; gap: 1px; min-width: 0; }
.service-row-title { display: flex; align-items: baseline; gap: var(--space-2); min-width: 0; }
.service-row-title strong { flex: none; font-size: var(--fs-sm); }
.service-row-title small { overflow: hidden; color: var(--muted); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.service-row-flag { flex: none; padding: 1px 7px; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); font-size: 11px; font-weight: 700; }
.service-row-facts { color: var(--muted); font-size: var(--fs-xs); line-height: 1.4; font-variant-numeric: tabular-nums; }
.service-row.is-error .service-row-facts { color: var(--red-text); }
.service-row-side { display: flex; align-items: center; gap: var(--space-2); }
.service-row-latency { font-size: var(--fs-xs); font-weight: 650; font-variant-numeric: tabular-nums; color: var(--muted); }
.service-row-latency.is-slow { color: var(--amber-text); }
.service-row-action { padding: 3px 10px; border: 1px solid var(--border); border-radius: var(--radius-pill); color: var(--text); font-size: var(--fs-xs); font-weight: 650; text-decoration: none; }
.service-row-action:hover { border-color: var(--accent); color: var(--accent); }
.service-row.is-error .service-row-action { border-color: color-mix(in srgb, var(--red) 50%, var(--border)); color: var(--red-text); }
.service-row-issues-toggle { display: inline-flex; align-items: center; gap: 4px; padding: 3px 6px 3px 10px; border: 0; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--amber) 14%, transparent); color: var(--amber-text); font: inherit; font-size: var(--fs-xs); font-weight: 700; cursor: pointer; }
.service-row-issues-toggle svg { width: 14px; height: 14px; transition: transform var(--motion-duration-fast) var(--motion-ease-standard); }
.service-row-issues-toggle[aria-expanded="true"] svg { transform: rotate(180deg); }
.service-row-issues { display: grid; grid-column: 2 / -1; gap: 4px; margin: 2px 0 0; padding: 0; list-style: none; }
.service-row-issues li { display: flex; align-items: flex-start; gap: 6px; color: var(--text); font-size: var(--fs-xs); line-height: 1.4; }
.service-row-issues svg { flex: none; width: 14px; height: 14px; margin-top: 1px; color: var(--amber-text); }
.service-row-issues li.is-error svg { color: var(--red-text); }
.service-row-issues li.is-more { color: var(--muted); padding-left: 20px; }

/* Sur une carte etroite, le verdict passe sous le titre et la latence sous le bouton
   des alertes : les faits du service gardent la largeur. */
@container health (max-width: 440px) {
  .service-health-heading { flex-basis: 100%; }
  .service-health-verdict { order: 1; }
  .service-health-head > :last-child { order: 2; margin-left: auto; }
  .service-row-side { flex-direction: column; align-items: flex-end; gap: 4px; }
}
</style>
