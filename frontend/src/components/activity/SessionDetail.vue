<template>
  <div class="session-detail">
    <TerminatePlaybackModal
      v-if="canTerminate"
      :open="terminateOpen"
      :session-id="session.id"
      :subtitle="`${session.user_name || 'Utilisateur Plex'} · ${displayTitle(session)}`"
      @close="terminateOpen = false"
      @terminated="onTerminated"
    />

    <!-- Fiche (gabarit Fiche) : l'oeuvre et l'etat de la lecture en en-tete, les actions avec, puis
         trois parties -- la lecture, ses pistes, ses details. -->
    <DetailTemplate
      :variant="enSurface ? 'sheet' : 'card'"
      :eyebrow="headingEyebrow"
      :title="session.title || 'Lecture Plex'"
      :icon="MonitorPlay"
      :poster="session.media?.poster_url || session.thumb_url || null"
      :backdrop="artUrl || null"
      :meta="meta"
      :badges="badges"
      :summary="summary"
      :actions="actions"
      :alert="alert"
      :tabs="TABS"
      :tab="tab"
      @update:tab="tab = $event"
      @action="onAction"
    >
      <template #tab-playback>
        <div class="session-part">
      <ConsecutivePlaybacks v-if="run.length > 1" :run="run" :current-id="session.id" @open="emitParent('open-run', $event)"/>

      <div class="session-progress">
        <div><span>Progression</span><strong>{{ Math.round(percentPlayed) }} %</strong></div>
        <!-- La position avance d'elle-meme entre deux releves de Plex (voir playbackClock).
             En conversion, la barre montre aussi le tampon : la zone deja preparee par le
             transcodeur devant la tete de lecture. Le curseur marque la position. -->
        <div class="progress-track" :class="{ buffered: buffer }" role="progressbar" :aria-valuenow="Math.round(percentPlayed)" aria-valuemin="0" aria-valuemax="100" :aria-valuetext="`${timecode(positionMs)} sur ${timecode(session.duration_ms)}`">
          <b v-if="buffer" class="buffer-zone" :style="{ left: `${percentPlayed}%`, width: `${Math.max(0, buffer.buffered - percentPlayed)}%` }"></b>
          <i :style="{width:`${percentPlayed}%`}"></i>
          <span v-if="session.duration_ms" class="progress-cursor" :class="{ paused: !advancing && !session.ended_at }" :style="{ left: `${percentPlayed}%` }"></span>
        </div>
        <!-- Comme un lecteur : ecoule a gauche, restant a droite ; au milieu, la fin du tampon. -->
        <div class="progress-times">
          <time>{{ timecode(positionMs) }}</time>
          <span v-if="buffer && bufferEndMs != null" class="buffer-end">prêt jusqu’à {{ timecode(bufferEndMs) }}</span>
          <span v-if="!session.ended_at && !advancing" class="paused-label">En pause</span>
          <time v-else-if="session.duration_ms">-{{ timecode(remainingMs) }}</time>
        </div>
        <!-- Reperes de temps : quand la lecture finira, ce qu'elle dure, depuis quand elle tourne. -->
        <dl class="progress-markers">
          <div v-if="!session.ended_at"><dt><Flag/>Fin prévue</dt><dd>{{ etaLabel }}</dd></div>
          <div v-else><dt><Flag/>Terminée</dt><dd>{{ formatTime(session.ended_at) }}</dd></div>
          <div v-if="session.duration_ms"><dt><Clock3/>Durée</dt><dd>{{ timecode(session.duration_ms) }}</dd></div>
          <div v-if="session.started_at"><dt><Play/>Commencée</dt><dd>{{ formatTime(session.started_at) }}</dd></div>
        </dl>
        <p v-if="buffer" class="buffer-legend" :class="transcoder.tone">
          <span><Timer/>Avance du transcodeur <strong>{{ formatBuffer(session.transcode_buffer_ms) }}</strong></span>
          <span class="transcoder-state"><Cpu/>{{ transcoder.label }}</span>
        </p>
        <SessionTimelineBar :session="session"/>
      </div>

      <div v-balanced-grid="{ min: 170 }" class="session-kpis">
        <article><Clock3/><span>Temps restant</span><strong>{{ session.duration_ms ? formatDuration(remainingMs) : 'Inconnu' }}</strong><small>{{ session.ended_at ? 'Lecture terminée' : advancing ? `Fin vers ${etaLabel}` : 'En pause : fin suspendue' }}</small></article>
        <!-- Un tiret se lit comme un zero : quand Plex ne communique pas le debit, on le
             dit plutot que d'afficher une valeur vide qui passerait pour une mesure. -->
        <article><Gauge/><span>Débit envoyé</span><strong>{{ session.bandwidth_kbps ? formatBandwidth(session.bandwidth_kbps) : 'Non mesuré' }}</strong><small>{{ bitrateHint }}</small></article>
        <article :class="['network-kpi', isRemoteConnection(session) ? 'remote' : 'local']"><Network/><span>Connexion</span><strong>{{ connectionLabel(session) }}</strong><small>{{ stream.relayed ? 'via le relais Plex, débit bridé' : connectionHint(session) }}</small></article>
      </div>

      <SessionLocationMap :session="session"/>

      <section v-if="!details" class="stream-route">
        <span class="eyebrow">Chemin du flux</span>
        <div>
          <article><Server/><span><small>Source</small><strong>{{ session.quality || 'Auto' }}<template v-if="session.video_codec"> · {{ session.video_codec.toUpperCase() }}</template></strong></span></article>
          <i :class="{warning:session.playback_method==='transcode'}"></i>
          <article><Workflow/><span><small>Traitement</small><strong>{{ methodLabel(session.playback_method) }}</strong></span></article>
          <i></i>
          <article><MonitorPlay/><span><small>Destination</small><strong>{{ session.player || session.platform || 'Plex' }}</strong></span></article>
        </div>
      </section>

        </div>
      </template>

      <template #tab-streams>
        <div class="session-part">
          <StreamTracksPanel :session="session"/>
          <ConversionPanel :session="session"/>
        </div>
      </template>

      <template #tab-details>
        <SessionFacts :session="session"/>
      </template>
    </DetailTemplate>
  </div>
</template>

<script setup lang="ts">
import DetailTemplate from '@/components/templates/DetailTemplate.vue';
import ConversionPanel from './ConversionPanel.vue';
import ConsecutivePlaybacks from './ConsecutivePlaybacks.vue';
import type { LectureDeSerie } from '@/composables/useMediaOverlay';
import StreamTracksPanel from './StreamTracksPanel.vue';
import SessionFacts from './SessionFacts.vue';
import TerminatePlaybackModal from './TerminatePlaybackModal.vue';
import { episodeLabel } from '@/utils/episode';
import { bufferSpan, formatBuffer, hasTranscodeBuffer, transcoderState } from '@/utils/transcodeBuffer';
import { formatDurationExact as formatDuration, formatBandwidth, formatDateTime, formatTime } from '@/utils/format';
import { computed, ref } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import { ArrowRight, CircleStop, ClipboardCopy, Clock3, Cpu, Flag, Gauge, MonitorPlay, Network, Play, Server, Timer, Workflow } from '@lucide/vue';
import { timecode } from '@/utils/format';
import { estimateProgressMs, estimatedEnd, isAdvancing } from '@/utils/playbackClock';
import { useToast } from '@/composables/useToast';
import { mediaDetailPath } from '@/mediaUrl';
import { useMediaOverlay, useOuvrirFiche } from '@/composables/useMediaOverlay';
import SessionLocationMap from './SessionLocationMap.vue';
import SessionTimelineBar from './SessionTimelineBar.vue';

const props = withDefaults(
  defineProps<{
    session: Record<string, any>;
    /** Lectures consecutives de la ligne d'historique ouverte, dans l'ordre chronologique. */
    run?: LectureDeSerie[];
  }>(),
  { run: () => [] }
);


const { addToast } = useToast();

/* Le rebond vers la fiche n'a de sens que si l'on sait quoi ouvrir : une session Plex ne
   porte pas toujours de demande associee. */
const mediaPath = computed(() => {
  const session = props.session;
  if (session.media_request_id) return mediaDetailPath({ request_id: session.media_request_id }, 'request');
  const libraryId = session.library_item_id || session.media?.library_item_id;
  if (libraryId) return mediaDetailPath({ library_id: libraryId }, 'library');
  return '';
});
/* Dans la feuille, la fiche du media la remplace sur la meme page de fond : retour
   ramene a la session, puis a la page. En pleine page, simple navigation. */
const { actif: enSurface } = useMediaOverlay();
const { ouvrir } = useOuvrirFiche();
function openMedia(): void {
  if (!mediaPath.value) return;
  ouvrir(mediaPath.value);
}

/* Ce que l'on colle dans un message quand on aide quelqu'un a distance : l'essentiel du
   diagnostic en clair, sans capture d'ecran. */
async function copyDiagnostic(): Promise<void> {
  const session = props.session;
  const lines = [
    displayTitle(session),
    `Utilisateur : ${session.user_name || 'inconnu'}`,
    `Appareil : ${session.player || session.product || session.platform || 'inconnu'}`,
    `Lecture : ${methodLabel(session.playback_method)} (video ${decisionLabel(session.video_decision)}, audio ${decisionLabel(session.audio_decision)})`,
    `Qualité : ${session.quality || 'auto'}${session.video_codec ? ` / ${session.video_codec.toUpperCase()}` : ''}${session.audio_codec ? ` / ${session.audio_codec.toUpperCase()}` : ''}`,
    `Debit : ${session.bandwidth_kbps ? formatBandwidth(session.bandwidth_kbps) : 'non communique'}`,
    `Connexion : ${connectionLabel(session)} - ${networkLabel(session)}`,
    `Progression : ${Math.round(session.progress || 0)} % (${formatDuration(session.progress_ms || session.watched_ms)} / ${formatDuration(session.duration_ms)})`,
    `Début : ${formatDate(session.started_at)}`,
  ];
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    addToast({ type: 'success', message: 'Diagnostic copié dans le presse-papier.' });
  } catch {
    addToast({ type: 'error', message: 'Copie impossible : le presse-papier est refusé par le navigateur.' });
  }
}

const TABS = [
  { key: 'playback', label: 'Lecture' },
  { key: 'streams', label: 'Pistes' },
  { key: 'details', label: 'Détails' },
];
const tab = ref('playback');
const meta = computed(() => [props.session.user_name || 'Utilisateur Plex', props.session.player || props.session.platform || props.session.product].filter(Boolean) as string[]);
/* L'etat de la lecture en badges : comment elle est servie, puis ce qui la distingue. */
const badges = computed(() => {
  const list: Array<{ key: string; label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = [
    { key: 'method', label: methodLabel(props.session.playback_method), tone: props.session.playback_method === 'transcode' ? 'warning' : 'success' },
  ];
  if (props.session.is_download) list.push({ key: 'download', label: 'Téléchargement', tone: 'info' });
  if (stream.value.relayed) list.push({ key: 'relay', label: 'Relais Plex', tone: 'warning' });
  if (dynamicRange.value) list.push({ key: 'hdr', label: dynamicRange.value, tone: toneMapping.value ? 'warning' : 'info' });
  if (stream.value.secure != null) list.push({ key: 'secure', label: stream.value.secure ? 'Chiffrée' : 'Non chiffrée', tone: stream.value.secure ? 'neutral' : 'warning' });
  return list;
});
const alert = computed(() => (stream.value.relayed
  ? { tone: 'warning' as const, message: 'Cette lecture passe par le relais Plex, plafonné à environ 2 Mb/s.' }
  : toneMapping.value ? { tone: 'info' as const, message: 'HDR converti en SDR : le transcodage le plus coûteux.' } : null));
const actions = computed(() => [
  ...(mediaPath.value ? [{ key: 'open-media', label: 'Ouvrir dans la bibliothèque', icon: ArrowRight }] : []),
  { key: 'copy', label: 'Copier le diagnostic', icon: ClipboardCopy },
  ...(canTerminate.value ? [{ key: 'terminate', label: 'Arrêter', icon: CircleStop, danger: true }] : []),
]);
function onAction(key: string): void {
  if (key === 'open-media') openMedia();
  else if (key === 'copy') void copyDiagnostic();
  else if (key === 'terminate') terminateOpen.value = true;
}

const artUrl = computed(() => props.session.media?.art_url || '');
const summary = computed(() => String(props.session.media?.summary || '').trim());
const headingEyebrow = computed(() => {
  const s = props.session;
  const media = s.media || {};
  const episode = episodeLabel(s, { season: media.season, episode: media.episode });
  return [s.grandparent_title || mediaTypeLabel(s.media_type), episode, s.year].filter(Boolean).join(' · ');
});

const details = computed<Record<string, any> | null>(() => props.session.transcode_details || null);
const stream = computed<Record<string, any>>(() => props.session.stream_details || {});

/* Arreter une lecture : seulement tant qu'elle est en cours, et pas un telechargement. */
const emitParent = defineEmits<{ (e: 'open-run', id: string): void; (e: 'terminated'): void }>();
const terminateOpen = ref(false);
const canTerminate = computed(() => !props.session.ended_at && props.session.source !== 'tautulli' && Boolean(props.session.id));
function onTerminated(): void {
  addToast({ type: 'success', message: 'Lecture arrêtée : Plex a affiché votre message sur le lecteur.' });
  emitParent('terminated');
}

const dynamicRange = computed(() => {
  const range = stream.value.dynamic_range || {};
  if (!range.source || range.source === 'SDR') return '';
  return range.output && range.output !== range.source ? `${range.source} → ${range.output}` : range.source;
});
const toneMapping = computed(() => {
  const range = stream.value.dynamic_range || {};
  return Boolean(range.source && range.source !== 'SDR' && range.output === 'SDR');
});
const bitrateHint = computed(() => {
  const source = stream.value.bitrate?.source_kbps;
  const flow = props.session.bandwidth_kbps;
  // Le debit d'origine montre de combien la qualite a ete reduite pour ce lecteur.
  // Seule une video reencodee perd en qualite : en lecture directe ou quand seul l'audio
  // est converti, l'ecart de debit n'est qu'une estimation de Plex.
  const videoConverted = String(details.value?.video?.decision || props.session.video_decision || '').toLowerCase() === 'transcode';
  if (source && flow && videoConverted && source > flow * 1.2) {
    return `source ${formatBandwidth(source)} : qualité réduite`;
  }
  if (source) return `source ${formatBandwidth(source)}`;
  return bandwidthHint(flow);
});
const buffer = computed(() => (hasTranscodeBuffer(props.session as any) ? bufferSpan(props.session as any) : null));
const transcoder = computed(() => transcoderState(props.session as any));
const bufferEndMs = computed(() => {
  const s = props.session;
  if (s.transcode_details?.transcoder?.complete) return s.duration_ms ?? null;
  if (s.transcode_buffer_ms == null) return null;
  return Math.min(s.duration_ms || Infinity, (s.progress_ms || 0) + s.transcode_buffer_ms);
});
/* Horloge : une seconde de pas tant que la lecture avance, rien sinon. */
const now = ref(new Date());
useIntervalFn(() => { now.value = new Date(); }, 1000);
const advancing = computed(() => isAdvancing(props.session));
const positionMs = computed(() => estimateProgressMs(props.session, now.value.getTime()));
const remainingMs = computed(() => Math.max(0, (props.session.duration_ms || 0) - positionMs.value));
const percentPlayed = computed(() => {
  const duration = props.session.duration_ms;
  return duration ? Math.min(100, (positionMs.value / duration) * 100) : Number(props.session.progress || 0);
});
const etaLabel = computed(() => {
  const end = estimatedEnd(props.session, now.value.getTime());
  return end ? formatTime(end.getTime()) : advancing.value ? '—' : 'suspendue';
});









function displayTitle(item: any): string {
  return item.grandparent_title ? `${item.grandparent_title} · ${item.title}` : (item.title || 'Session Plex');
}
const formatDate = (value: any) => formatDateTime(value, '—');
function bandwidthHint(value: any): string {
  if (!value) return 'Plex ne l’a pas communiqué';
  return value >= 20000 ? 'bande passante élevée' : value >= 8000 ? 'bande passante modérée' : 'flux léger';
}
function mediaTypeLabel(value: any): string {
  const map: Record<string, string> = { movie: 'Film', episode: 'Épisode', track: 'Musique' };
  return map[value] || 'Média';
}
function decisionLabel(value: any): string {
  const map: Record<string, string> = { transcode: 'Transcodage', copy: 'Copie directe', directplay: 'Lecture directe' };
  return map[String(value || '').toLowerCase()] || '—';
}
function methodLabel(value: any): string {
  const map: Record<string, string> = { transcode: 'Transcodage', direct_stream: 'Conversion légère', direct_play: 'Aucune conversion' };
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
@use '@/styles/foundations/breakpoints' as bp;

.progress-track{position:relative}
.progress-track .buffer-zone{position:absolute;top:0;bottom:0;border-radius:inherit;background:color-mix(in srgb,var(--accent) 35%,transparent)}
.progress-track i{position:relative}
.progress-times{display:flex;justify-content:space-between;gap:8px;color:var(--text);font-size:var(--fs-xs);font-variant-numeric:tabular-nums}
.progress-times .buffer-end{color:var(--blue-text)}
.progress-times .paused-label{color:var(--amber-text);font-weight:600}
.session-progress .progress-track{overflow:visible}
.progress-cursor {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  border: 2px solid var(--surface-2);
  border-radius: 50%;
  background: var(--accent);
  transform: translate(-50%,-50%);
  box-shadow: 0 0 0 1px rgb(var(--ink) / .12);
}
.progress-cursor.paused{background:var(--amber)}
.progress-markers{display:flex;flex-wrap:wrap;gap:6px 18px;margin:2px 0 0;font-size:var(--fs-xs)}
.progress-markers div{display:flex;align-items:center;gap:6px}
.progress-markers dt{display:inline-flex;align-items:center;gap:5px;color:color-mix(in srgb,var(--text) 62%,transparent)}
.progress-markers dt svg{width:13px;height:13px}
.progress-markers dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums}
.buffer-legend{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 14px;margin:0;font-size:var(--fs-xs);color:color-mix(in srgb,var(--text) 75%,transparent)}
.buffer-legend span{display:inline-flex;align-items:center;gap:6px}
.buffer-legend svg{width:14px;height:14px}
.buffer-legend.done .transcoder-state,.buffer-legend.paused .transcoder-state{color:var(--green-text)}
.buffer-legend.running .transcoder-state{color:var(--blue-text)}
.buffer-legend.low,.buffer-legend.low strong{color:var(--amber-text)}
.conversion-table{display:grid;margin-top:12px;overflow:hidden;border:1px solid var(--border);border-radius:var(--radius-lg);font-size:var(--fs-sm)}
.conversion-head,.conversion-row{display:grid;grid-template-columns:minmax(80px,.8fr) minmax(0,1.2fr) minmax(0,1.2fr) minmax(80px,.8fr);gap:10px;align-items:center;padding:9px 12px}
.conversion-head{color:color-mix(in srgb,var(--text) 60%,transparent);font-size:var(--fs-xs)}
.conversion-row{border-top:1px solid var(--border-subtle)}
.conversion-label{color:color-mix(in srgb,var(--text) 70%,transparent)}
.conversion-row span{min-width:0;overflow-wrap:anywhere}
.conversion-arrow{display:none;width:13px;height:13px;margin-right:4px;vertical-align:-2px;color:var(--muted)}
.conversion-treatment{font-weight:600}
.conversion-treatment.copied{color:var(--green-text)}
.conversion-treatment.remuxed{color:var(--blue-text)}
.conversion-treatment.converted{color:var(--amber-text)}
@container sheet (max-width: 520px){
  .conversion-head{display:none}
  .conversion-row{grid-template-columns:minmax(0,1fr) auto;gap:2px 10px}
  .conversion-label{grid-column:1;font-weight:600;color:var(--text)}
  .conversion-treatment{grid-column:2;grid-row:1;text-align:right}
  .conversion-row span:nth-child(2),.conversion-row span:nth-child(3){grid-column:1/-1;display:inline;color:color-mix(in srgb,var(--text) 78%,transparent);font-size:var(--fs-xs)}
  .conversion-row span:nth-child(2){grid-row:2}
  .conversion-row span:nth-child(3){grid-row:3}
  .conversion-arrow{display:inline-block}
}
.session-part{display:grid;gap:var(--space-4);min-width:0}
.session-progress {
  display: grid;
  gap: var(--space-2);
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
}
.session-progress>div:first-child {
  display: flex;
  justify-content: space-between;
}
.session-progress span,
.session-progress small {
  color: color-mix(in srgb,var(--text) 70%,transparent);
  font-size: var(--fs-xs);
}
.progress-track {
  height: 6px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: rgb(var(--ink) / .1);
}
.progress-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
}
.session-kpis {
  display: grid;
  grid-template-columns: repeat(3,1fr);
  gap: 1px;
  margin-top: 10px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--border-subtle);
}
.session-kpis article {
  display: grid;
  gap: var(--space-1);
  padding: 12px 14px;
  background: var(--surface-2);
}
.session-kpis span,
.session-kpis small {
  color: color-mix(in srgb,var(--text) 68%,transparent);
  font-size: var(--fs-xs);
}
.session-kpis strong {
  font-size: var(--fs-md);
}
.stream-route {
  margin-top: 22px;
}
.stream-route>div {
  display: grid;
  grid-template-columns: minmax(0,1fr) 28px minmax(0,1fr) 28px minmax(0,1fr);
  align-items: center;
  margin-top: 8px;
}
.stream-route article {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
}
.stream-route article>svg {
  width: 17px;
  color: var(--muted);
}
.stream-route article span {
  display: grid;
  min-width: 0
}
.stream-route small {
  color: color-mix(in srgb,var(--text) 64%,transparent);
  font-size: var(--fs-xs);
}
.stream-route strong {
  overflow: hidden;
  font-size: var(--fs-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stream-route i {
  height: 2px;
  background: var(--border);
}
.stream-route i.warning {
  background: var(--amber);
}
.session-detail-columns {
  display: grid;
  gap: 0
}
@container sheet (min-width: 862px) {
  .session-detail-columns {
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
    align-items: start;
  }
  .session-detail-columns>.session-detail-section {
    margin-top: 22px;
  }
}
.session-detail-section {
  margin-top: 22px;
}
.session-detail-section dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: 8px 0 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
.session-detail-section dl>div {
  display: grid;
  gap: var(--space-1);
  padding: 13px;
  border-bottom: 1px solid var(--border-subtle);
}
.session-detail-section dl>div:nth-child(odd) {
  border-right: 1px solid var(--border-subtle);
}
.session-detail-section dl>div:nth-last-child(-n+2) {
  border-bottom: 0
}
.session-detail-section dt {
  color: color-mix(in srgb,var(--text) 66%,transparent);
  font-size: var(--fs-xs);
}
.session-detail-section dd {
  margin: 0;
  font-size: var(--fs-sm);
  line-height: 1.4;
}
.session-id {
  overflow: hidden;
  color: var(--muted);
  font-family: var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-address {
  font-variant-numeric: tabular-nums;
}
.session-id-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0
}
.session-id-row .session-id {
  min-width: 0
}
.copy-id {
  flex: none;
  margin: -6px 0;
}
@include bp.until(phablet) {
  .session-kpis {
    grid-template-columns: 1fr;
  }
  .stream-route>div {
    grid-template-columns: 1fr;
  }
  .stream-route i {
    width: 2px;
    height: 14px;
    margin: auto;
  }
  .stream-route article {
    width: 100%;
  }
}
@container sheet (max-width: 482px) {
  .session-detail-section dl {
    grid-template-columns: 1fr;
  }
  .session-detail-section dl>div,
  .session-detail-section dl>div:nth-child(odd) {
    border-right: 0;
    border-bottom: 1px solid var(--border-subtle);
  }
  .session-detail-section dl>div:last-child {
    border-bottom: 0
  }
}
.session-kpis article {
  grid-template-columns: 20px minmax(0,1fr);
  gap: 3px 9px;
}
.session-kpis article>svg {
  grid-row: 1/4;
  width: 18px;
  height: 18px;
  color: var(--accent);
}
.session-kpis article>*:not(svg) {
  grid-column: 2
}
.session-kpis .network-kpi.remote>svg {
  color: var(--amber-text);
}
.session-kpis .network-kpi.local>svg {
  color: var(--green-text);
}
.session-detail-section dl>div {
  position: relative;
  padding-left: 16px;
}
.session-detail-section dl>div::before {
  position: absolute;
  top: 15px;
  bottom: 15px;
  left: 0;
  width: 3px;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb,var(--accent) 70%,transparent);
  content: "";
}
.session-detail-section dd {
  color: var(--text);
  font-weight: 600;
}
</style>
