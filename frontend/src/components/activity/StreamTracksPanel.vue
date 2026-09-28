<template>
  <section v-if="cards.length" class="tracks-panel" aria-labelledby="tracks-title">
    <!-- Pour toutes les lectures, pas seulement les conversions : ce qui est lu (source),
         ce qui part vers le lecteur (sortie), et si Plex a dû le convertir. -->
    <span id="tracks-title" class="eyebrow">Flux</span>
    <div class="tracks-grid">
      <article v-for="card in cards" :key="card.label" class="track-card">
        <header>
          <component :is="card.icon" aria-hidden="true" />
          <strong>{{ card.label }}</strong>
          <span v-if="card.status" class="pill" :class="card.status.tone">{{ card.status.label }}</span>
        </header>
        <dl>
          <div v-for="row in card.rows" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>
        <!-- Toutes les pistes audio du fichier, avec leurs caracteristiques : la piste
             ecoutee est mise en avant, les autres restent comparables d'un coup d'oeil. -->
        <div v-if="card.languages?.length" class="track-languages">
          <span class="track-languages-title">Pistes audio disponibles</span>
          <ul aria-label="Pistes audio disponibles">
            <li v-for="(item, index) in card.languages" :key="index" :class="{ played: item.played }">
              <strong>{{ item.language }}</strong>
              <span>{{ item.detail || '—' }}</span>
              <em v-if="item.played">Écoutée</em>
            </li>
          </ul>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Box, Film, Volume2 } from '@lucide/vue';
import { codecLabel } from '@/utils/conversionVerdict';
import { formatBandwidth } from '@/utils/format';

const props = defineProps<{ session: Record<string, any> }>();

interface Row { label: string; value: string }
type Tone = 'copied' | 'remuxed' | 'converted';

const CHANNELS: Record<number, string> = { 1: 'mono', 2: 'stéréo', 6: '5.1', 8: '7.1' };
const channels = (value: unknown) => (value ? CHANNELS[Number(value)] || `${value} canaux` : '');
/* Sous 1 Mb/s (l'audio le plus souvent), les kb/s restent lisibles : « 0,3 Mb/s » ne l'est pas. */
const bitrate = (value: unknown) => {
  const kbps = Number(value || 0);
  if (!kbps) return '';
  return kbps < 1000 ? `${Math.round(kbps)} kb/s` : formatBandwidth(kbps);
};
const join = (parts: unknown[]) => parts.filter(Boolean).join(' · ');

function status(decision: unknown): { label: string; tone: Tone } | null {
  const value = String(decision || '').toLowerCase().replace(/[\s_-]/g, '');
  if (value === 'transcode') return { label: 'Converti', tone: 'converted' };
  if (value === 'copy' || value === 'directstream') return { label: 'Copié', tone: 'remuxed' };
  if (value === 'directplay') return { label: 'Direct', tone: 'copied' };
  return null;
}

function videoLine(v: Record<string, any> | undefined, fallbackQuality?: string): string {
  if (!v) return '';
  const size = v.height ? `${v.height}p` : fallbackQuality || '';
  const depth = v.bit_depth ? `${v.bit_depth} bits` : '';
  const fps = v.frame_rate ? `${Math.round(v.frame_rate * 100) / 100} i/s` : '';
  return join([v.codec && codecLabel(v.codec), size, v.profile, depth, v.dynamic_range, fps, bitrate(v.bitrate_kbps)]);
}
function audioLine(a: Record<string, any> | undefined): string {
  if (!a) return '';
  return join([a.language, a.codec && codecLabel(a.codec), channels(a.channels), bitrate(a.bitrate_kbps)]);
}

const cards = computed(() => {
  const s = props.session;
  const tracks = s.stream_details?.tracks || null;
  const out: Array<{ label: string; icon: any; status: ReturnType<typeof status>; rows: Row[]; languages?: Array<{ language: string; detail: string; played: boolean }> }> = [];

  // Sessions anterieures ou importees de Tautulli : seuls les champs de la session existent.
  const video = tracks?.video || (s.video_codec ? { decision: s.video_decision, from: { codec: s.video_codec } } : null);
  if (video) {
    const converted = status(video.decision)?.tone === 'converted';
    const rows: Row[] = [{ label: 'Source', value: videoLine(video.from, s.quality) || '—' }];
    if (converted) rows.push({ label: 'Transcode', value: videoLine(video.to) || '—' });
    out.push({ label: 'Vidéo', icon: Film, status: status(video.decision), rows });
  }

  const audio = tracks?.audio || (s.audio_codec ? { decision: s.audio_decision, from: { codec: s.audio_codec } } : null);
  if (audio) {
    const converted = status(audio.decision)?.tone === 'converted';
    const rows: Row[] = [{ label: 'Source', value: audioLine(audio.from) || '—' }];
    if (converted) rows.push({ label: 'Transcode', value: audioLine({ ...audio.to, language: undefined }) || '—' });
    const languages = (audio.languages || []).map((item: any) => ({
      language: item.language || 'Langue inconnue',
      detail: join([
        item.codec && codecLabel(item.codec),
        item.profile && item.profile !== item.codec ? String(item.profile).toUpperCase() : '',
        channels(item.channels),
        bitrate(item.bitrate_kbps),
        item.sampling_rate ? `${Math.round(item.sampling_rate / 100) / 10} kHz` : '',
      ]),
      played: Boolean(item.played),
    }));
    out.push({ label: 'Audio', icon: Volume2, status: status(audio.decision), rows, languages });
  }

  const container = tracks?.container || (s.transcode_details?.container?.to
    ? { from: s.transcode_details.container.from, to: s.transcode_details.container.to, protocol: s.transcode_details.protocol }
    : s.container ? { from: s.container, to: s.container } : null);
  if (container && (container.from || container.to)) {
    const from = String(container.from || '').toUpperCase();
    const to = String(container.to || '').toUpperCase();
    const changed = Boolean(from && to && from !== to);
    const protocol = String(container.protocol || '').toLowerCase();
    const rows: Row[] = [{ label: 'Source', value: from || '—' }];
    if (changed) rows.push({ label: 'Transcode', value: to });
    if (['dash', 'hls'].includes(protocol)) rows.push({ label: 'Diffusion', value: `segments ${protocol.toUpperCase()}` });
    out.push({ label: 'Conteneur', icon: Box, status: changed ? { label: 'Converti', tone: 'remuxed' } : { label: 'Inchangé', tone: 'copied' }, rows });
  }
  return out;
});
</script>

<style scoped>
.tracks-panel { display: grid; gap: 8px; margin-top: 22px; }
.tracks-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-3); }
.track-card { display: grid; align-content: start; gap: 8px; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface-2); min-width: 0; }
.track-card header { display: flex; align-items: center; gap: 8px; }
.track-card header svg { width: 16px; height: 16px; color: var(--muted); }
.track-card header .pill { margin-left: auto; }
.track-card dl { display: grid; gap: 6px; margin: 0; }
.track-card dl > div { display: grid; gap: 2px; }
.track-card dt { color: var(--muted); font-size: var(--fs-xs); }
.track-card dd { margin: 0; font-size: var(--fs-sm); overflow-wrap: anywhere; }
.pill { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: var(--radius-pill); font-size: var(--fs-xs); font-weight: 600; }
.pill.copied { background: color-mix(in srgb, var(--green) 14%, transparent); color: var(--green-text); }
.pill.remuxed { background: color-mix(in srgb, var(--blue) 14%, transparent); color: var(--blue-text); }
.pill.converted { background: color-mix(in srgb, var(--amber) 16%, transparent); color: var(--amber-text); }
.track-languages { display: grid; gap: 6px; }
.track-languages-title { color: var(--muted); font-size: var(--fs-xs); }
.track-languages ul { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.track-languages li { display: grid; grid-template-columns: minmax(70px, auto) minmax(0, 1fr) auto; gap: 8px; align-items: baseline; padding: 5px 9px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: var(--fs-xs); }
.track-languages li span { color: var(--muted); overflow-wrap: anywhere; }
.track-languages li em { color: var(--accent); font-style: normal; font-weight: 600; }
.track-languages li.played { border-color: color-mix(in srgb, var(--accent) 50%, transparent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.track-languages li.played span { color: var(--text); }
</style>
