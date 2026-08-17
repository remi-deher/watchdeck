<template>
  <DrawerShell wide eyebrow="Session Plex" :title="displayTitle(session)" @close="$emit('close')">
    <div class="session-hero">
      <MediaArtwork :src="session.thumb_url" :alt="displayTitle(session)" :type="session.media_type" size="large"/>
      <div>
        <span>{{ session.parent_title || mediaTypeLabel(session.media_type) }}<template v-if="session.year"> · {{ session.year }}</template></span>
        <h3>{{ session.user_name || 'Utilisateur Plex' }}</h3>
        <p>{{ session.player || session.product || session.platform || 'Lecteur Plex' }}</p>
        <PlaybackMethodBadge :method="session.playback_method"/>
      </div>
    </div>

    <div class="session-progress">
      <div><span>Progression</span><strong>{{ Math.round(session.progress || 0) }} %</strong></div>
      <div class="progress-track"><i :style="{width:`${session.progress || 0}%`}"></i></div>
      <small>{{ formatDuration(session.progress_ms || session.watched_ms) }} / {{ formatDuration(session.duration_ms) }}</small>
    </div>

    <div class="session-kpis">
      <article><Clock3/><span>Temps restant</span><strong>{{ remainingLabel(session) }}</strong><small>{{ estimatedEnd(session) }}</small></article>
      <article><Gauge/><span>Débit du flux</span><strong>{{ formatBandwidth(session.bandwidth_kbps) }}</strong><small>{{ bandwidthHint(session.bandwidth_kbps) }}</small></article>
      <article :class="['network-kpi', isRemoteConnection(session) ? 'remote' : 'local']"><Network/><span>Connexion</span><strong>{{ connectionLabel(session) }}</strong><small>{{ connectionHint(session) }}</small></article>
    </div>

    <SessionLocationMap :session="session"/>

    <section class="stream-route">
      <span class="eyebrow">Chemin du flux</span>
      <div>
        <article><Server/><span><small>Source</small><strong>{{ session.quality || 'Auto' }}<template v-if="session.video_codec"> · {{ session.video_codec.toUpperCase() }}</template></strong></span></article>
        <i :class="{warning:session.playback_method==='transcode'}"></i>
        <article><Workflow/><span><small>Traitement</small><strong>{{ methodLabel(session.playback_method) }}</strong></span></article>
        <i></i>
        <article><MonitorPlay/><span><small>Destination</small><strong>{{ session.player || session.platform || 'Plex' }}</strong></span></article>
      </div>
    </section>

    <section class="session-detail-section">
      <span class="eyebrow">Lecture</span>
      <dl>
        <div><dt>État</dt><dd>{{ stateLabel(session.state) }}</dd></div>
        <div><dt>Qualité</dt><dd>{{ session.quality || 'Automatique' }}</dd></div>
        <div><dt>Vidéo</dt><dd>{{ decisionLabel(session.video_decision) }}<template v-if="session.video_codec"> · {{ session.video_codec.toUpperCase() }}</template></dd></div>
        <div><dt>Audio</dt><dd>{{ decisionLabel(session.audio_decision) }}<template v-if="session.audio_codec"> · {{ session.audio_codec.toUpperCase() }}</template></dd></div>
        <div><dt>Débit</dt><dd>{{ formatBandwidth(session.bandwidth_kbps) }}</dd></div>
        <div><dt>Réseau</dt><dd>{{ networkLabel(session) }}</dd></div>
        <div><dt>Durée totale</dt><dd>{{ formatDuration(session.duration_ms) }}</dd></div>
        <div><dt>Temps visionné</dt><dd>{{ formatDuration(session.progress_ms || session.watched_ms) }}</dd></div>
      </dl>
    </section>

    <section class="session-detail-section">
      <span class="eyebrow">Contexte</span>
      <dl>
        <div><dt>Bibliothèque</dt><dd>{{ session.library || '—' }}</dd></div>
        <div><dt>Plateforme</dt><dd>{{ session.platform || '—' }}</dd></div>
        <div><dt>Appareil</dt><dd>{{ session.player || session.product || session.platform || '—' }}</dd></div>
        <div><dt>Adresse IP</dt><dd class="session-address">{{ session.address || 'Indisponible' }}</dd></div>
        <div><dt>Début</dt><dd>{{ formatDate(session.started_at) }}</dd></div>
        <div><dt>Dernière activité</dt><dd>{{ formatDate(session.last_seen_at || session.ended_at) }}</dd></div>
        <div><dt>Source</dt><dd>{{ session.source === 'tautulli' ? 'Tautulli' : 'Plex' }}</dd></div>
        <div><dt>Identifiant</dt><dd class="session-id">{{ session.session_id || '—' }}</dd></div>
      </dl>
    </section>
  </DrawerShell>
</template>

<script setup lang="ts">
import { formatDurationExact as formatDuration, formatBandwidth, formatDateTime, formatTime } from '@/utils/format';
import { Clock3, Gauge, MonitorPlay, Network, Server, Workflow } from '@lucide/vue';
import DrawerShell from '@/components/DrawerShell.vue';
import MediaArtwork from './MediaArtwork.vue';
import PlaybackMethodBadge from './PlaybackMethodBadge.vue';
import SessionLocationMap from './SessionLocationMap.vue';

defineProps<{
  session: Record<string, any>;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

function displayTitle(item: any): string {
  return item.grandparent_title ? `${item.grandparent_title} · ${item.title}` : (item.title || 'Session Plex');
}
const formatDate = (value: any) => formatDateTime(value, '—');
function remainingLabel(item: any): string {
  const remaining = Math.max(0, (item.duration_ms || 0) - (item.progress_ms || item.watched_ms || 0));
  return item.duration_ms ? formatDuration(remaining) : 'Inconnu';
}
function estimatedEnd(item: any): string {
  const remaining = Math.max(0, (item.duration_ms || 0) - (item.progress_ms || item.watched_ms || 0));
  if (!remaining || item.state === 'paused') return item.state === 'paused' ? 'Estimation suspendue' : 'Fin non estimée';
  return `Fin vers ${formatTime(Date.now() + remaining)}`;
}
function bandwidthHint(value: any): string {
  if (!value) return 'débit non communiqué';
  return value >= 20000 ? 'bande passante élevée' : value >= 8000 ? 'bande passante modérée' : 'flux léger';
}
function mediaTypeLabel(value: any): string {
  const map: Record<string, string> = { movie: 'Film', episode: 'Épisode', track: 'Musique' };
  return map[value] || 'Média';
}
function stateLabel(value: any): string {
  const map: Record<string, string> = { playing: 'Lecture', paused: 'En pause', buffering: 'Mise en mémoire' };
  return map[value] || value || 'Terminée';
}
function decisionLabel(value: any): string {
  const map: Record<string, string> = { transcode: 'Transcodage', copy: 'Copie directe', directplay: 'Lecture directe' };
  return map[String(value || '').toLowerCase()] || '—';
}
function methodLabel(value: any): string {
  const map: Record<string, string> = { transcode: 'Transcodage', direct_stream: 'Remux direct', direct_play: 'Aucune conversion' };
  return map[value] || 'Lecture Plex';
}
function isPublicAddress(address: any): boolean {
  if (!address) return false;
  const value = String(address).replace('::ffff:', '');
  if (value.includes(':')) return true;
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 169 && b === 254) return false;
  return true;
}
function isLocalConnection(item: any): boolean {
  return item.geo_status === 'local' || item.stream_location === 'lan' || item.location === 'lan';
}
function isRemoteConnection(item: any): boolean {
  if (isLocalConnection(item)) return false;
  if (item.stream_location === 'wan' || item.location === 'wan') return true;
  return item.geo_status === 'resolved' || isPublicAddress(item.address);
}
function connectionLabel(item: any): string {
  if (isLocalConnection(item)) return 'Locale';
  if (isRemoteConnection(item)) return 'Distante';
  return 'Non déterminée';
}
function connectionHint(item: any): string {
  if (isLocalConnection(item)) return 'sur le réseau du serveur';
  if (isRemoteConnection(item)) return item.geo_isp || item.geo_organization || 'via une adresse publique';
  return 'connexion indéterminée';
}
function networkLabel(item: any): string {
  if (item.geo_status === 'local') return 'local';
  const scope = isLocalConnection(item) ? 'Local' : isRemoteConnection(item) ? 'Distant' : null;
  const place = [item.geo_city, item.geo_country_code || item.geo_country].filter(Boolean).join(', ');
  return [scope, place, item.address].filter(Boolean).join(' · ') || 'Adresse masquée';
}
</script>

<style scoped lang="scss">
.session-hero{display:flex;gap: var(--space-4);align-items:center;margin:8px 0 20px}.session-hero>div:last-child{display:grid;gap: var(--space-1);min-width:0}.session-hero h3{margin:4px 0 0;font-size:var(--fs-lg)}.session-hero p,.session-hero span{margin:0;color:color-mix(in srgb,var(--text) 72%,transparent);font-size:var(--fs-sm)}.session-progress{display:grid;gap: var(--space-2);padding:14px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2)}.session-progress>div:first-child{display:flex;justify-content:space-between}.session-progress span,.session-progress small{color:color-mix(in srgb,var(--text) 70%,transparent);font-size:var(--fs-xs)}.progress-track{height:6px;overflow:hidden;border-radius:var(--radius-pill);background:rgba(255,255,255,.1)}.progress-track i{display:block;height:100%;border-radius:inherit;background:var(--accent)}.session-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap: var(--space-2);margin-top:10px}.session-kpis article{display:grid;gap: var(--space-1);padding:12px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2)}.session-kpis span,.session-kpis small{color:color-mix(in srgb,var(--text) 68%,transparent);font-size:var(--fs-xs)}.session-kpis strong{font-size:var(--fs-md)}.stream-route{margin-top:22px}.stream-route>div{display:grid;grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr) 28px minmax(0,1fr);align-items:center;margin-top:8px}.stream-route article{display:flex;align-items:center;gap: var(--space-2);min-width:0;padding:10px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2)}.stream-route article>svg{width:17px;color:var(--muted)}.stream-route article span{display:grid;min-width:0}.stream-route small{color:color-mix(in srgb,var(--text) 64%,transparent);font-size:var(--fs-xs);}.stream-route strong{overflow:hidden;font-size:var(--fs-xs);text-overflow:ellipsis;white-space:nowrap}.stream-route i{height:2px;background:var(--border)}.stream-route i.warning{background:#fb923c}.session-detail-section{margin-top:22px}.session-detail-section dl{display:grid;grid-template-columns:1fr 1fr;margin:8px 0 0;border:1px solid var(--border);border-radius:var(--radius-md)}.session-detail-section dl>div{display:grid;gap: var(--space-1);padding:13px;border-bottom:1px solid var(--border)}.session-detail-section dl>div:nth-child(odd){border-right:1px solid var(--border)}.session-detail-section dl>div:nth-last-child(-n+2){border-bottom:0}.session-detail-section dt{color:color-mix(in srgb,var(--text) 66%,transparent);font-size:var(--fs-xs);}.session-detail-section dd{margin:0;font-size:var(--fs-sm);line-height:1.4}.session-id{overflow:hidden;color:var(--muted);font-family:monospace;text-overflow:ellipsis;white-space:nowrap}.session-address{font-variant-numeric:tabular-nums}@media(max-width:620px){.session-kpis{grid-template-columns:1fr}.stream-route>div{grid-template-columns:1fr}.stream-route i{width:2px;height:14px;margin:auto}.stream-route article{width:100%}}@media(max-width:520px){.session-hero{align-items:flex-start}.session-detail-section dl{grid-template-columns:1fr}.session-detail-section dl>div,.session-detail-section dl>div:nth-child(odd){border-right:0;border-bottom:1px solid var(--border)}.session-detail-section dl>div:last-child{border-bottom:0}}
.session-kpis article{grid-template-columns:20px minmax(0,1fr);gap:3px 9px}.session-kpis article>svg{grid-row:1/4;width:18px;height:18px;color:var(--accent)}.session-kpis article>*:not(svg){grid-column:2}.session-kpis .network-kpi.remote>svg{color:#fb923c}.session-kpis .network-kpi.local>svg{color:var(--success,#22c55e)}
.session-detail-section dl>div{position:relative;padding-left:16px}.session-detail-section dl>div::before{position:absolute;top:15px;bottom:15px;left:0;width:3px;border-radius:3px;background:color-mix(in srgb,var(--accent) 70%,transparent);content:""}.session-detail-section dd{color:color-mix(in srgb,var(--text) 92%,transparent);font-weight:600}
</style>
