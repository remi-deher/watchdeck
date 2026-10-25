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

    <!-- Fiche (gabarit Fiche) : l'œuvre et l'état de la lecture en en-tête, les actions avec, puis
         trois parties -- la lecture, ses pistes, ses détails. -->
    <DetailTemplate
      :variant="enSurface ? 'sheet' : 'card'"
      :eyebrow="headingEyebrow"
      :title="session.title || 'Lecture Plex'"
      :icon="MonitorPlay"
      :media="session.media || null"
      :poster="session.media?.poster_url ? null : (session.thumb_url || null)"
      :backdrop="artUrl || null"
      :meta="meta"
      :badges="badges"
      :dates="heroDates"
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
          <ConsecutivePlaybacks v-if="run.length > 1" :run="run" :current-id="session.id" @open="emitParent('open-run', $event)" />

          <div class="session-progress">
            <div>
              <span>Progression</span>
              <strong>{{ Math.round(percentPlayed) }} %</strong>
            </div>
            <!-- La position avance d'elle-meme entre deux relevés de Plex (voir playbackClock).
                 En conversion, la barre montre aussi le tampon : la zone déjà préparée par le
                 transcodeur devant la tête de lecture. Le curseur marque la position. -->
            <div
              class="progress-track"
              :class="{ buffered: buffer }"
              role="progressbar"
              :aria-valuenow="Math.round(percentPlayed)"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuetext="`${timecode(positionMs)} sur ${timecode(session.duration_ms)}`"
            >
              <b v-if="buffer" class="buffer-zone" :style="{ left: `${percentPlayed}%`, width: `${Math.max(0, buffer.buffered - percentPlayed)}%` }"></b>
              <i :style="{ width: `${percentPlayed}%` }"></i>
              <span v-if="session.duration_ms" class="progress-cursor" :class="{ paused: !advancing && !session.ended_at }" :style="{ left: `${percentPlayed}%` }"></span>
            </div>
            <!-- Comme un lecteur : écoulé à gauche, restant à droite ; au milieu, la fin du tampon. -->
            <div class="progress-times">
              <time>{{ timecode(positionMs) }}</time>
              <span v-if="buffer && bufferEndMs != null" class="buffer-end">prêt jusqu’à {{ timecode(bufferEndMs) }}</span>
              <span v-if="!session.ended_at && !advancing" class="paused-label">En pause</span>
              <time v-else-if="session.duration_ms">-{{ timecode(remainingMs) }}</time>
            </div>
            <!-- Repères de temps : quand la lecture finira, ce qu'elle dure, depuis quand elle tourne. -->
            <dl class="progress-markers">
              <div v-if="!session.ended_at"><dt><Flag />Fin prévue</dt><dd>{{ etaLabel }}</dd></div>
              <div v-else><dt><Flag />Terminée</dt><dd>{{ formatTime(session.ended_at) }}</dd></div>
              <div v-if="session.duration_ms"><dt><Clock3 />Durée</dt><dd>{{ timecode(session.duration_ms) }}</dd></div>
              <div v-if="session.started_at"><dt><Play />Commencée</dt><dd>{{ formatTime(session.started_at) }}</dd></div>
            </dl>
            <p v-if="buffer" class="buffer-legend" :class="transcoder.tone">
              <span><Timer />Avance du transcodeur <strong>{{ formatBuffer(session.transcode_buffer_ms) }}</strong></span>
              <span class="transcoder-state"><Cpu />{{ transcoder.label }}</span>
            </p>
            <SessionTimelineBar :session="session" />
          </div>

          <div v-balanced-grid="{ min: 170 }" class="session-kpis">
            <article>
              <Clock3 />
              <span>Temps restant</span>
              <strong>{{ session.duration_ms ? formatDuration(remainingMs) : 'Inconnu' }}</strong>
              <small>{{ session.ended_at ? 'Lecture terminée' : advancing ? `Fin vers ${etaLabel}` : 'En pause : fin suspendue' }}</small>
            </article>
            <!-- Un tiret se lit comme un zero : quand Plex ne communique pas le débit, on le
                 dit plutôt que d'afficher une valeur vide qui passerait pour une mesure. -->
            <article>
              <Gauge />
              <span>Débit envoyé</span>
              <strong>{{ session.bandwidth_kbps ? formatBandwidth(session.bandwidth_kbps) : 'Non mesuré' }}</strong>
              <small>{{ bitrateHint }}</small>
            </article>
            <article :class="['network-kpi', isRemoteConnection(session) ? 'remote' : 'local']">
              <Network />
              <span>Connexion</span>
              <strong>{{ connectionLabel(session) }}</strong>
              <small>{{ stream.relayed ? 'via le relais Plex, débit bridé' : connectionHint(session) }}</small>
            </article>
          </div>

          <SessionLocationMap :session="session" />

          <section v-if="!details" class="stream-route">
            <span class="eyebrow">Chemin du flux</span>
            <div>
              <article>
                <Server />
                <span>
                  <small>Source</small>
                  <strong>{{ session.quality || 'Auto' }}<template v-if="session.video_codec"> · {{ session.video_codec.toUpperCase() }}</template></strong>
                </span>
              </article>
              <i :class="{ warning: session.playback_method === 'transcode' }"></i>
              <article>
                <Workflow />
                <span>
                  <small>Traitement</small>
                  <strong>{{ methodLabel(session.playback_method) }}</strong>
                </span>
              </article>
              <i></i>
              <article>
                <MonitorPlay />
                <span>
                  <small>Destination</small>
                  <strong>{{ session.player || session.platform || 'Plex' }}</strong>
                </span>
              </article>
            </div>
          </section>
        </div>
      </template>

      <template #tab-streams>
        <div class="session-part">
          <StreamTracksPanel :session="session" />
          <ConversionPanel :session="session" />
        </div>
      </template>

      <template #tab-details>
        <SessionFacts :session="session" />
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
    /** Lectures consécutives de la ligne d'historique ouverte, dans l'ordre chronologique. */
    run?: LectureDeSerie[];
  }>(),
  { run: () => [] }
);

const { addToast } = useToast();

/* Le rebond vers la fiche n'a de sens que si l'on sait quoi ouvrir : une session Plex ne
   porte pas toujours de demande associée. */
const mediaPath = computed(() => {
  const session = props.session;
  if (session.media_request_id) return mediaDetailPath({ request_id: session.media_request_id }, 'request');
  const libraryId = session.library_item_id || session.media?.library_item_id;
  if (libraryId) return mediaDetailPath({ library_id: libraryId }, 'library');
  return '';
});

/* Dans la feuille, la fiche du média la remplace sur la même page de fond : retour
   ramène à la session, puis à la page. En pleine page, simple navigation. */
const { actif: enSurface } = useMediaOverlay();
const { ouvrir } = useOuvrirFiche();
function openMedia(): void {
  if (!mediaPath.value) return;
  ouvrir(mediaPath.value);
}

/* Ce que l'on colle dans un message quand on aide quelqu'un à distance : l'essentiel du
   diagnostic en clair, sans capture d'écran. */
async function copyDiagnostic(): Promise<void> {
  const session = props.session;
  const lines = [
    displayTitle(session),
    `Utilisateur : ${session.user_name || 'inconnu'}`,
    `Appareil : ${session.player || session.product || session.platform || 'inconnu'}`,
    `Lecture : ${methodLabel(session.playback_method)} (vidéo ${decisionLabel(session.video_decision)}, audio ${decisionLabel(session.audio_decision)})`,
    `Qualité : ${session.quality || 'auto'}${session.video_codec ? ` / ${session.video_codec.toUpperCase()}` : ''}${session.audio_codec ? ` / ${session.audio_codec.toUpperCase()}` : ''}`,
    `Débit : ${session.bandwidth_kbps ? formatBandwidth(session.bandwidth_kbps) : 'non communiqué'}`,
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

const meta = computed(() => {
  const s = props.session;
  const user = s.user_name || 'Utilisateur Plex';
  const device = s.player || s.platform || s.product;
  const userDevice = device ? `${user} sur ${device}` : user;
  return [userDevice, s.quality, methodLabel(s.playback_method)].filter(Boolean) as string[];
});

/* Dates clés dans l'en-tête (SheetHero dock), en miroir de la fiche média. */
const heroDates = computed(() => {
  const s = props.session;
  const list: Array<{ label: string; value: string }> = [];
  if (s.started_at) list.push({ label: 'Commencée', value: formatTime(s.started_at) });
  if (s.ended_at) list.push({ label: 'Terminée', value: formatTime(s.ended_at) });
  else if (etaLabel.value && etaLabel.value !== '—' && etaLabel.value !== 'suspendue') {
    list.push({ label: 'Fin prévue', value: etaLabel.value });
  }
  return list;
});

/* L'état de la lecture en badges : comment elle est servie, puis ce qui la distingue. */
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

const artUrl = computed(() => props.session.art_url || props.session.media?.art_url || props.session.media?.backdrop_url || '');
const summary = computed(() => String(props.session.media?.summary || props.session.summary || '').trim());
const headingEyebrow = computed(() => {
  const s = props.session;
  const media = s.media || {};
  const episode = episodeLabel(s, { season: media.season, episode: media.episode });
  return [s.grandparent_title || mediaTypeLabel(s.media_type), episode, s.year].filter(Boolean).join(' · ');
});

const details = computed<Record<string, any> | null>(() => props.session.transcode_details || null);
const stream = computed<Record<string, any>>(() => props.session.stream_details || {});

/* Arrêter une lecture : seulement tant qu'elle est en cours, et pas un téléchargement. */
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
  // Le débit d'origine montre de combien la qualité a été réduite pour ce lecteur.
  // Seule une vidéo réencodée perd en qualité : en lecture directe ou quand seul l'audio
  // est converti, l'écart de débit n'est qu'une estimation de Plex.
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
const advancing = computed(() => isAdvancing(props.session));
useIntervalFn(() => { if (!document.hidden && advancing.value) now.value = new Date(); }, 1000);
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

.session-detail {
  min-width: 0;
}

.session-part {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}

.session-progress {
  display: grid;
  gap: var(--space-2);
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
}

.session-progress > div:first-child {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.session-progress span,
.session-progress small {
  color: var(--muted);
  font-size: var(--fs-xs);
}

.progress-track {
  position: relative;
  height: 6px;
  border-radius: var(--radius-pill);
  background: rgb(var(--ink) / .1);
}

.progress-track .buffer-zone {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: inherit;
  background: color-mix(in srgb, var(--accent) 35%, transparent);
}

.progress-track i {
  position: relative;
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
}

.session-progress .progress-track {
  overflow: visible;
}

.progress-cursor {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  border: 2px solid var(--surface-2);
  border-radius: 50%;
  background: var(--accent);
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 1px rgb(var(--ink) / .12);
}

.progress-cursor.paused {
  background: var(--amber);
}

.progress-times {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--text);
  font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
}

.progress-times .buffer-end {
  color: var(--blue-text);
}

.progress-times .paused-label {
  color: var(--amber-text);
  font-weight: 600;
}

.progress-markers {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 2px 0 0;
  font-size: var(--fs-xs);
}

.progress-markers div {
  display: flex;
  align-items: center;
  gap: 6px;
}

.progress-markers dt {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
}

.progress-markers dt svg {
  width: 13px;
  height: 13px;
}

.progress-markers dd {
  margin: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.buffer-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px 14px;
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--muted);
}

.buffer-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.buffer-legend svg {
  width: 14px;
  height: 14px;
}

.buffer-legend.done .transcoder-state,
.buffer-legend.paused .transcoder-state {
  color: var(--green-text);
}

.buffer-legend.running .transcoder-state {
  color: var(--blue-text);
}

.buffer-legend.low,
.buffer-legend.low strong {
  color: var(--amber-text);
}

.session-kpis {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
  margin-top: 10px;
}

.session-kpis article {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 3px 9px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

.session-kpis article > svg {
  grid-row: 1 / 4;
  width: 18px;
  height: 18px;
  color: var(--accent);
}

.session-kpis article > *:not(svg) {
  grid-column: 2;
}

.session-kpis .network-kpi.remote > svg {
  color: var(--amber-text);
}

.session-kpis .network-kpi.local > svg {
  color: var(--green-text);
}

.session-kpis span,
.session-kpis small {
  color: var(--muted);
  font-size: var(--fs-xs);
}

.session-kpis strong {
  font-size: var(--fs-md);
}

.stream-route {
  margin-top: var(--space-4);
}

.stream-route > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr) 28px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-2);
  margin-top: 8px;
}

.stream-route article {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

.stream-route article > svg {
  flex: none;
  width: 17px;
  height: 17px;
  color: var(--muted);
}

.stream-route article span {
  display: grid;
  min-width: 0;
}

.stream-route small {
  color: var(--muted);
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

@include bp.until(phablet) {
  .session-kpis {
    grid-template-columns: 1fr;
  }
  .stream-route > div {
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
</style>
