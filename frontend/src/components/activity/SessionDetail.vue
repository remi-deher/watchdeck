<template>
  <div class="session-detail">
    <TerminatePlaybackModal
      :open="terminateOpen"
      :session-id="session.id"
      :subtitle="`${session.user_name || 'Utilisateur Plex'} · ${displayTitle(session)}`"
      @close="terminateOpen = false"
      @terminated="onTerminated"
    />

    <!-- L'oeuvre d'abord, comme la fiche d'un media dans Decouvrir ou la Bibliotheque :
         meme en-tete (UiHeroBackdrop), bord a bord dans la feuille, en carte en pleine
         page. L'affiche mene a la fiche de la bibliotheque. Sans fiche Plex (media
         supprime, serveur injoignable), l'en-tete garde l'affiche sur un fond uni. -->
    <UiHeroBackdrop
      class="session-banner"
      :class="{ 'in-sheet': enSurface }"
      :image-url="artUrl || null"
      :variant="enSurface ? 'sheet' : 'card'"
      position="center 18%"
      min-height="clamp(220px, 32vw, 320px)"
    >
      <div class="session-banner__content">
      <component
        :is="mediaPath ? 'button' : 'div'"
        class="session-poster"
        :type="mediaPath ? 'button' : undefined"
        :title="mediaPath ? 'Ouvrir la fiche dans la bibliothèque' : undefined"
        :aria-label="mediaPath ? `Ouvrir ${session.grandparent_title || session.title} dans la bibliothèque` : undefined"
        @click="openMedia"
      >
        <MediaArtwork :src="session.thumb_url" :alt="displayTitle(session)" :type="session.media_type" size="large"/>
      </component>
      <div class="session-heading">
        <span>{{ headingEyebrow }}</span>
        <h2>{{ session.title || 'Lecture Plex' }}</h2>
      </div>
      </div>
    </UiHeroBackdrop>

    <section v-if="summary" class="session-summary">
      <p ref="summaryRef" :class="{ open: summaryOpen }">{{ summary }}</p>
      <!-- Le bouton n'apparait que si le resume deborde reellement ses trois lignes : un
           compte de caracteres se trompait selon la largeur de l'ecran. -->
      <button v-if="summaryOpen || summaryClamped" type="button" class="summary-toggle" @click="summaryOpen = !summaryOpen">{{ summaryOpen ? 'Réduire' : 'Lire la suite' }}</button>
    </section>

    <div class="session-who">
      <PlaybackMethodBadge :method="session.playback_method"/>
      <!-- Un telechargement (synchro hors ligne) reste dans l'historique, mais ne se
           confond pas avec une lecture. -->
      <span v-if="session.is_download" class="session-flag download"><Download/>Téléchargement</span>
      <span v-if="stream.relayed" class="session-flag relay" title="Débit limité par le relais Plex (~2 Mb/s) : souvent la cause d'une qualité réduite"><RadioTower/>Relais Plex</span>
      <span v-if="dynamicRange" class="session-flag hdr" :class="{ tonemap: toneMapping }" :title="toneMapping ? 'HDR converti en SDR : le transcodage le plus coûteux' : undefined">{{ dynamicRange }}</span>
      <span><User/>{{ session.user_name || 'Utilisateur Plex' }}</span>
      <span><MonitorPlay/>{{ session.player || session.product || session.platform || 'Lecteur Plex' }}</span>
      <!-- Comparer deux lectures est le geste dominant : sans ces fleches il fallait
           fermer, retrouver la ligne voisine et rouvrir. `j` / `k` font de meme. -->
      <div class="session-toolbar" role="toolbar" aria-label="Actions sur la session">
        <UiButton v-if="hasSiblings" variant="ghost" icon-only title="Session precedente (k)" aria-label="Session precedente" :disabled="!hasPrevious" @click="emitParent('navigate', -1)"><ChevronLeft /></UiButton>
        <UiButton v-if="hasSiblings" variant="ghost" icon-only title="Session suivante (j)" aria-label="Session suivante" :disabled="!hasNext" @click="emitParent('navigate', 1)"><ChevronRight /></UiButton>
        <UiButton variant="ghost" icon-only title="Copier le diagnostic" aria-label="Copier le diagnostic" @click="copyDiagnostic"><ClipboardCopy /></UiButton>
        <UiButton v-if="mediaPath" variant="ghost" icon-only title="Ouvrir la fiche du media" aria-label="Ouvrir la fiche du media" @click="openMedia"><ExternalLink /></UiButton>
        <UiButton v-if="canTerminate" class="terminate-button" variant="danger" size="sm" @click="terminateOpen = true"><CircleStop />Arrêter</UiButton>
      </div>
    </div>

    <div class="session-progress">
      <div><span>Progression</span><strong>{{ Math.round(session.progress || 0) }} %</strong></div>
      <!-- En conversion, la barre montre aussi le tampon : la zone deja preparee par le
           transcodeur devant la tete de lecture. Tant qu'elle n'est pas vide, rien ne coupe. -->
      <div class="progress-track" :class="{ buffered: buffer }">
        <b v-if="buffer" class="buffer-zone" :style="{ left: `${buffer.played}%`, width: `${buffer.buffered - buffer.played}%` }"></b>
        <i :style="{width:`${buffer ? buffer.played : session.progress || 0}%`}"></i>
      </div>
      <!-- Timecodes aux deux bouts ; au milieu, jusqu'ou le transcodeur a deja prepare. -->
      <div class="progress-times">
        <time>{{ timecode(session.progress_ms || session.watched_ms) }}</time>
        <span v-if="buffer && bufferEndMs != null" class="buffer-end">prêt jusqu’à {{ timecode(bufferEndMs) }}</span>
        <time>{{ timecode(session.duration_ms) }}</time>
      </div>
      <p v-if="buffer" class="buffer-legend" :class="transcoder.tone">
        <span><Timer/>Tampon <strong>{{ formatBuffer(session.transcode_buffer_ms) }}</strong></span>
        <span class="transcoder-state"><Cpu/>{{ transcoder.label }}</span>
      </p>
      <SessionTimelineBar :session="session"/>
    </div>

    <div v-balanced-grid="{ min: 170 }" class="session-kpis">
      <article><Clock3/><span>Temps restant</span><strong>{{ remainingLabel(session) }}</strong><small>{{ estimatedEnd(session) }}</small></article>
      <!-- Un tiret se lit comme un zero : quand Plex ne communique pas le debit, on le
           dit plutot que d'afficher une valeur vide qui passerait pour une mesure. -->
      <article><Gauge/><span>Débit du flux</span><strong>{{ session.bandwidth_kbps ? formatBandwidth(session.bandwidth_kbps) : 'Non mesuré' }}</strong><small>{{ bitrateHint }}</small></article>
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

    <section v-if="session.transcode_reason || session.transcode_remux || details" class="session-detail-section conversion-section">
      <span class="eyebrow">Conversion<template v-if="session.transcode_hw"> · {{ session.transcode_hw }}</template></span>
      <TranscodeReason :reason="session.transcode_reason" :remux="session.transcode_remux"/>
      <!-- Source -> sortie, flux par flux. Sur mobile, chaque flux devient une ligne a
           deux niveaux plutot qu'un tableau a faire defiler. -->
      <div v-if="conversionRows.length" class="conversion-table" role="table" aria-label="Conversion flux par flux">
        <div class="conversion-head" role="row"><span role="columnheader">Flux</span><span role="columnheader">Source</span><span role="columnheader">Sortie</span><span role="columnheader">Traitement</span></div>
        <div v-for="row in conversionRows" :key="row.label" class="conversion-row" role="row">
          <span role="cell" class="conversion-label">{{ row.label }}</span>
          <span role="cell">{{ row.from }}</span>
          <span role="cell"><ArrowRight class="conversion-arrow" aria-hidden="true"/>{{ row.to }}</span>
          <span role="cell" class="conversion-treatment" :class="row.tone">{{ row.treatment }}</span>
        </div>
      </div>
    </section>

    <div class="session-detail-columns">
    <section class="session-detail-section">
      <span class="eyebrow">Lecture</span>
      <dl>
        <div><dt>État</dt><dd>{{ stateLabel(session.state) }}</dd></div>
        <div><dt>Qualité</dt><dd>{{ session.quality || 'Automatique' }}</dd></div>
        <template v-if="!details">
        <div><dt>Vidéo</dt><dd>{{ decisionLabel(session.video_decision) }}<template v-if="session.video_codec"> · {{ session.video_codec.toUpperCase() }}</template></dd></div>
        <div><dt>Audio</dt><dd>{{ decisionLabel(session.audio_decision) }}<template v-if="session.audio_codec"> · {{ session.audio_codec.toUpperCase() }}</template></dd></div>
        </template>
        <div><dt>Débit</dt><dd>{{ session.bandwidth_kbps ? formatBandwidth(session.bandwidth_kbps) : 'Non communiqué par Plex' }}</dd></div>
        <div><dt>Réseau</dt><dd>{{ networkLabel(session) }}</dd></div>
        <div><dt>Durée totale</dt><dd>{{ formatDuration(session.duration_ms) }}</dd></div>
        <div><dt>Temps visionné</dt><dd>{{ formatDuration(session.progress_ms || session.watched_ms) }}</dd></div>
        <div v-if="session.paused_ms"><dt>Temps en pause</dt><dd>{{ formatDuration(session.paused_ms) }}</dd></div>
      </dl>
    </section>

    <section class="session-detail-section">
      <span class="eyebrow">Contexte</span>
      <dl>
        <div><dt>Bibliothèque</dt><dd>{{ session.library || '—' }}</dd></div>
        <div><dt>Plateforme</dt><dd>{{ session.platform || '—' }}</dd></div>
        <div><dt>Appareil</dt><dd>{{ session.player || session.product || session.platform || '—' }}</dd></div>
        <div v-if="playerApp"><dt>Application</dt><dd>{{ playerApp }}</dd></div>
        <div v-if="playerDevice"><dt>Modèle</dt><dd>{{ playerDevice }}</dd></div>
        <div v-if="stream.secure != null"><dt>Connexion chiffrée</dt><dd>{{ stream.secure ? 'Oui' : 'Non' }}</dd></div>
        <div><dt>Adresse IP</dt><dd class="session-address">{{ session.address || 'Indisponible' }}</dd></div>
        <div><dt>Début</dt><dd>{{ formatDate(session.started_at) }}</dd></div>
        <div><dt>Dernière activité</dt><dd>{{ formatDate(session.last_seen_at || session.ended_at) }}</dd></div>
        <div><dt>Source</dt><dd>{{ session.source === 'tautulli' ? 'Tautulli' : 'Plex' }}</dd></div>
        <div><dt>Identifiant</dt><dd class="session-id">{{ session.session_id || '—' }}</dd></div>
      </dl>
    </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import TranscodeReason from './TranscodeReason.vue';
import TerminatePlaybackModal from './TerminatePlaybackModal.vue';
import { episodeLabel } from '@/utils/episode';
import { bufferSpan, formatBuffer, hasTranscodeBuffer, transcoderState } from '@/utils/transcodeBuffer';
import { formatDurationExact as formatDuration, formatBandwidth, formatDateTime, formatTime } from '@/utils/format';
import { computed, nextTick, ref, watch } from 'vue';
import { useResizeObserver } from '@vueuse/core';
import { useRouter } from 'vue-router';
import { ArrowRight, ChevronLeft, ChevronRight, CircleStop, ClipboardCopy, Clock3, Cpu, Download, ExternalLink, Gauge, MonitorPlay, Network, RadioTower, Server, Timer, User, Workflow } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiHeroBackdrop from '@/components/ui/UiHeroBackdrop.vue';
import { useToast } from '@/composables/useToast';
import { mediaDetailPath } from '@/mediaUrl';
import { ouvrirFiche, useMediaOverlay } from '@/composables/useMediaOverlay';
import MediaArtwork from './MediaArtwork.vue';
import PlaybackMethodBadge from './PlaybackMethodBadge.vue';
import SessionLocationMap from './SessionLocationMap.vue';
import SessionTimelineBar from './SessionTimelineBar.vue';

const props = withDefaults(
  defineProps<{
    session: Record<string, any>;
    hasPrevious?: boolean;
    hasNext?: boolean;
  }>(),
  { hasPrevious: false, hasNext: false }
);


const router = useRouter();
const { addToast } = useToast();
const hasSiblings = computed(() => props.hasPrevious || props.hasNext);

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
const { routeDeFond, actif: enSurface } = useMediaOverlay();
function openMedia(): void {
  if (!mediaPath.value) return;
  if (routeDeFond.value) ouvrirFiche(router, mediaPath.value, routeDeFond.value.fullPath);
  else router.push(mediaPath.value);
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
    `Qualite : ${session.quality || 'auto'}${session.video_codec ? ` / ${session.video_codec.toUpperCase()}` : ''}${session.audio_codec ? ` / ${session.audio_codec.toUpperCase()}` : ''}`,
    `Debit : ${session.bandwidth_kbps ? formatBandwidth(session.bandwidth_kbps) : 'non communique'}`,
    `Connexion : ${connectionLabel(session)} - ${networkLabel(session)}`,
    `Progression : ${Math.round(session.progress || 0)} % (${formatDuration(session.progress_ms || session.watched_ms)} / ${formatDuration(session.duration_ms)})`,
    `Debut : ${formatDate(session.started_at)}`,
  ];
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    addToast({ type: 'success', message: 'Diagnostic copié dans le presse-papier.' });
  } catch {
    addToast({ type: 'error', message: 'Copie impossible : le presse-papier est refusé par le navigateur.' });
  }
}

const artUrl = computed(() => props.session.media?.art_url || '');
const summary = computed(() => String(props.session.media?.summary || '').trim());
const summaryOpen = ref(false);
const summaryRef = ref<HTMLElement | null>(null);
const summaryClamped = ref(false);
function measureSummary(): void {
  const el = summaryRef.value;
  summaryClamped.value = Boolean(el && !summaryOpen.value && el.scrollHeight > el.clientHeight + 1);
}
useResizeObserver(summaryRef, measureSummary);
watch(summary, () => { summaryOpen.value = false; void nextTick(measureSummary); });
const headingEyebrow = computed(() => {
  const s = props.session;
  const media = s.media || {};
  const episode = episodeLabel(s, { season: media.season, episode: media.episode });
  return [s.grandparent_title || mediaTypeLabel(s.media_type), episode, s.year].filter(Boolean).join(' · ');
});

const details = computed<Record<string, any> | null>(() => props.session.transcode_details || null);
const stream = computed<Record<string, any>>(() => props.session.stream_details || {});

/* Arreter une lecture : seulement tant qu'elle est en cours, et pas un telechargement. */
const emitParent = defineEmits<{ (e: 'navigate', direction: number): void; (e: 'terminated'): void }>();
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
const playerApp = computed(() => {
  const player = stream.value.player || {};
  return [player.product, player.version].filter(Boolean).join(' ');
});
const playerDevice = computed(() => {
  const player = stream.value.player || {};
  const system = [player.platform, player.platform_version].filter(Boolean).join(' ');
  return [[player.vendor, player.model].filter(Boolean).join(' '), system].filter(Boolean).join(' · ');
});
const buffer = computed(() => (hasTranscodeBuffer(props.session as any) ? bufferSpan(props.session as any) : null));
const transcoder = computed(() => transcoderState(props.session as any));
const bufferEndMs = computed(() => {
  const s = props.session;
  if (s.transcode_details?.transcoder?.complete) return s.duration_ms ?? null;
  if (s.transcode_buffer_ms == null) return null;
  return Math.min(s.duration_ms || Infinity, (s.progress_ms || 0) + s.transcode_buffer_ms);
});
/** « 1:04:09 », « 12:07 » : la position telle que l'affiche un lecteur. */
function timecode(ms: any): string {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

const CODECS: Record<string, string> = { hevc: 'HEVC', h264: 'H.264', av1: 'AV1', truehd: 'TrueHD', eac3: 'E-AC3', ac3: 'AC3', dca: 'DTS', aac: 'AAC', opus: 'Opus', flac: 'FLAC', ass: 'ASS', srt: 'SRT', webvtt: 'WebVTT', pgs: 'PGS', mov_text: 'MOV text' };
const CHANNELS: Record<number, string> = { 1: 'mono', 2: 'stéréo', 6: '5.1', 8: '7.1' };
function kbps(value: any): string {
  return value ? ` · ${formatBandwidth(value)}` : '';
}
function codec(value: any): string {
  return value ? CODECS[String(value).toLowerCase()] || String(value).toUpperCase() : '—';
}
/* Couleurs des pastilles de lecture : copie en vert (rien ne bouge), conteneur change en
   bleu (Direct Stream), conversion en orange (transcodage). */
function treatment(decision: any): { treatment: string; tone: string } {
  const value = String(decision || '').toLowerCase();
  if (value === 'transcode') return { treatment: 'Converti', tone: 'converted' };
  if (value === 'burn') return { treatment: 'Incrusté', tone: 'converted' };
  if (value === 'copy') return { treatment: 'Copié', tone: 'copied' };
  if (value === 'directplay') return { treatment: 'Direct', tone: 'copied' };
  return { treatment: value || '—', tone: '' };
}
const conversionRows = computed(() => {
  const d = details.value;
  if (!d) return [];
  const rows: Array<{ label: string; from: string; to: string; treatment: string; tone: string }> = [];
  const container = d.container || {};
  if (container.to) {
    const changed = container.from && String(container.from).toLowerCase() !== String(container.to).toLowerCase();
    const protocol = String(d.protocol || '').toLowerCase();
    rows.push({
      label: 'Conteneur',
      from: container.from ? String(container.from).toUpperCase() : '—',
      to: `${String(container.to).toUpperCase()}${['dash', 'hls'].includes(protocol) ? ` · ${protocol.toUpperCase()}` : ''}`,
      treatment: changed ? 'Changé' : 'Identique',
      tone: changed ? 'remuxed' : 'copied',
    });
  }
  if (d.video) {
    rows.push({
      label: 'Vidéo',
      from: codec(d.video.from),
      to: `${codec(d.video.to)}${d.video.height ? ` ${d.video.height}p` : ''}${kbps(stream.value.bitrate?.video_kbps)}`,
      ...treatment(d.video.decision),
    });
  }
  const range = stream.value.dynamic_range || {};
  if (range.source && range.source !== 'SDR') {
    const mapped = range.output === 'SDR';
    rows.push({
      label: 'Plage dynamique',
      from: range.source,
      to: range.output || range.source,
      treatment: mapped ? 'Tone mapping' : 'Conservée',
      tone: mapped ? 'converted' : 'copied',
    });
  }
  if (d.audio) {
    const channels = d.audio.channels ? ` ${CHANNELS[d.audio.channels] || `${d.audio.channels} canaux`}` : '';
    rows.push({
      label: 'Audio',
      from: `${codec(d.audio.from)}${d.audio.language ? ` · ${d.audio.language}` : ''}`,
      to: `${codec(d.audio.to)}${channels}${kbps(stream.value.bitrate?.audio_kbps)}`,
      ...treatment(d.audio.decision),
    });
  }
  if (d.subtitles) {
    rows.push({
      label: 'Sous-titres',
      from: `${codec(d.subtitles.from)}${d.subtitles.language ? ` · ${d.subtitles.language}` : ''}${d.subtitles.forced ? ' forcés' : ''}`,
      to: codec(d.subtitles.to),
      ...treatment(d.subtitles.decision),
    });
  }
  return rows;
});

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
  if (!value) return 'Plex ne l’a pas communiqué';
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
  const map: Record<string, string> = { transcode: 'Transcodage', direct_stream: 'Direct Stream', direct_play: 'Aucune conversion' };
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
.session-banner__content{display:flex;align-items:flex-end;gap:var(--space-4);padding:var(--space-5)}
/* Dans la feuille, l'en-tete touche les bords comme celui d'un media : il annule les
   marges de la page (8px en haut, les gouttieres sur les cotes). */
.session-banner.in-sheet{margin:-8px calc(-1 * max(18px,var(--safe-right))) 0 calc(-1 * max(18px,var(--safe-left)))}
.session-banner.in-sheet .session-banner__content{padding:var(--space-6) max(18px,var(--safe-right)) var(--space-4) max(18px,var(--safe-left))}
.session-poster{flex:none;padding:0;border:0;border-radius:var(--radius-sm);background:none;cursor:default}
button.session-poster{cursor:pointer;transition:transform .15s}
button.session-poster:hover,button.session-poster:focus-visible{transform:translateY(-2px)}
button.session-poster:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.session-heading{display:grid;gap:4px;min-width:0}
.session-heading span{color:color-mix(in srgb,var(--text) 72%,transparent);font-size:var(--fs-sm)}
.session-heading h2{margin:0;font-size:var(--fs-xl);line-height:1.2;overflow-wrap:anywhere}
.session-summary{margin-top:12px}
.session-summary p{display:-webkit-box;margin:0;overflow:hidden;color:color-mix(in srgb,var(--text) 80%,transparent);font-size:var(--fs-sm);line-height:1.6;-webkit-line-clamp:3;-webkit-box-orient:vertical}
.session-summary p.open{display:block}
.summary-toggle{margin-top:4px;padding:0;border:0;background:none;color:var(--accent);font-size:var(--fs-xs);font-weight:600;cursor:pointer}
.session-who{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin:12px 0 16px;color:color-mix(in srgb,var(--text) 78%,transparent);font-size:var(--fs-sm)}
.session-flag{padding:3px 8px;border-radius:var(--radius-pill);font-size:var(--fs-xs);font-weight:700}
.session-flag.download{background:color-mix(in srgb,var(--slate,var(--muted)) 14%,transparent);color:var(--text)}
.session-flag.relay{background:color-mix(in srgb,var(--amber) 14%,transparent);color:var(--amber-text)}
.session-flag.relay svg{color:var(--amber-text)}
.session-flag.hdr{background:color-mix(in srgb,var(--blue) 12%,transparent);color:var(--blue-text)}
.session-flag.hdr.tonemap{background:color-mix(in srgb,var(--amber) 14%,transparent);color:var(--amber-text)}
.session-who span{display:inline-flex;align-items:center;gap:6px;min-width:0}
.session-who svg{width:15px;height:15px;color:var(--muted)}
.progress-track{position:relative}
.progress-track .buffer-zone{position:absolute;top:0;bottom:0;border-radius:inherit;background:color-mix(in srgb,var(--accent) 35%,transparent)}
.progress-track i{position:relative}
.progress-times{display:flex;justify-content:space-between;gap:8px;color:color-mix(in srgb,var(--text) 70%,transparent);font-size:var(--fs-xs);font-variant-numeric:tabular-nums}
.progress-times .buffer-end{color:var(--blue-text)}
.buffer-legend{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 14px;margin:0;font-size:var(--fs-xs);color:color-mix(in srgb,var(--text) 75%,transparent)}
.buffer-legend span{display:inline-flex;align-items:center;gap:6px}
.buffer-legend svg{width:14px;height:14px}
.buffer-legend.done .transcoder-state,.buffer-legend.paused .transcoder-state{color:var(--green-text)}
.buffer-legend.running .transcoder-state{color:var(--blue-text)}
.buffer-legend.low,.buffer-legend.low strong{color:var(--amber-text)}
.conversion-table{display:grid;margin-top:12px;border:1px solid var(--border);border-radius:var(--radius-md);font-size:var(--fs-sm)}
.conversion-head,.conversion-row{display:grid;grid-template-columns:minmax(80px,.8fr) minmax(0,1.2fr) minmax(0,1.2fr) minmax(80px,.8fr);gap:10px;align-items:center;padding:9px 12px}
.conversion-head{color:color-mix(in srgb,var(--text) 60%,transparent);font-size:var(--fs-xs)}
.conversion-row{border-top:1px solid var(--border)}
.conversion-label{color:color-mix(in srgb,var(--text) 70%,transparent)}
.conversion-row span{min-width:0;overflow-wrap:anywhere}
.conversion-arrow{display:none;width:13px;height:13px;margin-right:4px;vertical-align:-2px;color:var(--muted)}
.conversion-treatment{font-weight:600}
.conversion-treatment.copied{color:var(--green-text)}
.conversion-treatment.remuxed{color:var(--blue-text)}
.conversion-treatment.converted{color:var(--amber-text)}
@container sheet (max-width: 520px){
  .session-banner__content{gap:12px}
  .session-banner.in-sheet .session-banner__content{padding-top:var(--space-5)}
  .session-poster :deep(.media-artwork),.session-poster :deep(img){max-width:76px}
  .conversion-head{display:none}
  .conversion-row{grid-template-columns:minmax(0,1fr) auto;gap:2px 10px}
  .conversion-label{grid-column:1;font-weight:600;color:var(--text)}
  .conversion-treatment{grid-column:2;grid-row:1;text-align:right}
  .conversion-row span:nth-child(2),.conversion-row span:nth-child(3){grid-column:1/-1;display:inline;color:color-mix(in srgb,var(--text) 78%,transparent);font-size:var(--fs-xs)}
  .conversion-row span:nth-child(2){grid-row:2}
  .conversion-row span:nth-child(3){grid-row:3}
  .conversion-arrow{display:inline-block}
}
.session-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-1);margin-left:auto}
.session-progress{display:grid;gap: var(--space-2);padding:14px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2)}.session-progress>div:first-child{display:flex;justify-content:space-between}.session-progress span,.session-progress small{color:color-mix(in srgb,var(--text) 70%,transparent);font-size:var(--fs-xs)}.progress-track{height:6px;overflow:hidden;border-radius:var(--radius-pill);background:rgb(var(--ink) / .1)}.progress-track i{display:block;height:100%;border-radius:inherit;background:var(--accent)}.session-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap: var(--space-2);margin-top:10px}.session-kpis article{display:grid;gap: var(--space-1);padding:12px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2)}.session-kpis span,.session-kpis small{color:color-mix(in srgb,var(--text) 68%,transparent);font-size:var(--fs-xs)}.session-kpis strong{font-size:var(--fs-md)}.stream-route{margin-top:22px}.stream-route>div{display:grid;grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr) 28px minmax(0,1fr);align-items:center;margin-top:8px}.stream-route article{display:flex;align-items:center;gap: var(--space-2);min-width:0;padding:10px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2)}.stream-route article>svg{width:17px;color:var(--muted)}.stream-route article span{display:grid;min-width:0}.stream-route small{color:color-mix(in srgb,var(--text) 64%,transparent);font-size:var(--fs-xs);}.stream-route strong{overflow:hidden;font-size:var(--fs-xs);text-overflow:ellipsis;white-space:nowrap}.stream-route i{height:2px;background:var(--border)}.stream-route i.warning{background:var(--amber)}.session-detail-columns{display:grid;gap:0}@container sheet (min-width: 862px) {.session-detail-columns{grid-template-columns:1fr 1fr;gap:var(--space-4);align-items:start}.session-detail-columns>.session-detail-section{margin-top:22px}}.session-detail-section{margin-top:22px}.session-detail-section dl{display:grid;grid-template-columns:1fr 1fr;margin:8px 0 0;border:1px solid var(--border);border-radius:var(--radius-md)}.session-detail-section dl>div{display:grid;gap: var(--space-1);padding:13px;border-bottom:1px solid var(--border)}.session-detail-section dl>div:nth-child(odd){border-right:1px solid var(--border)}.session-detail-section dl>div:nth-last-child(-n+2){border-bottom:0}.session-detail-section dt{color:color-mix(in srgb,var(--text) 66%,transparent);font-size:var(--fs-xs);}.session-detail-section dd{margin:0;font-size:var(--fs-sm);line-height:1.4}.session-id{overflow:hidden;color:var(--muted);font-family: var(--font-mono);text-overflow:ellipsis;white-space:nowrap}.session-address{font-variant-numeric:tabular-nums}@include bp.until(phablet) {.session-kpis{grid-template-columns:1fr}.stream-route>div{grid-template-columns:1fr}.stream-route i{width:2px;height:14px;margin:auto}.stream-route article{width:100%}}@container sheet (max-width: 482px) {.session-detail-section dl{grid-template-columns:1fr}.session-detail-section dl>div,.session-detail-section dl>div:nth-child(odd){border-right:0;border-bottom:1px solid var(--border)}.session-detail-section dl>div:last-child{border-bottom:0}}
.session-kpis article{grid-template-columns:20px minmax(0,1fr);gap:3px 9px}.session-kpis article>svg{grid-row:1/4;width:18px;height:18px;color:var(--accent)}.session-kpis article>*:not(svg){grid-column:2}.session-kpis .network-kpi.remote>svg{color:var(--amber-text)}.session-kpis .network-kpi.local>svg{color: var(--green-text)}
.session-detail-section dl>div{position:relative;padding-left:16px}.session-detail-section dl>div::before{position:absolute;top:15px;bottom:15px;left:0;width:3px;border-radius: var(--radius-xs);background:color-mix(in srgb,var(--accent) 70%,transparent);content:""}.session-detail-section dd{color:color-mix(in srgb,var(--text) 92%,transparent);font-weight:600}
</style>
