<template>
  <section v-if="verdict" class="conversion-panel" aria-labelledby="conversion-title">
    <!-- Du plus utile au plus technique : le verdict en clair, ce que devient chaque flux,
         ce que le lecteur a demande, puis le raisonnement de Plex, replie. -->
    <span id="conversion-title" class="eyebrow">Conversion<template v-if="session.transcode_hw"> · {{ session.transcode_hw }}</template></span>
    <div class="conversion-card">
      <div class="conversion-verdict">
        <span class="verdict-icon" :class="tone" aria-hidden="true"><ArrowLeftRight /></span>
        <div>
          <strong class="verdict-title">{{ verdict.title }}</strong>
          <p v-if="verdict.explanation" class="verdict-explanation">{{ verdict.explanation }}</p>
          <p v-if="reason?.note" class="verdict-note">{{ reason.note }}</p>
          <div class="verdict-badges">
            <span v-if="verdict.source === 'plex'" class="pill plex">Décision de Plex<template v-if="reason?.code"> · code {{ reason.code }}</template></span>
            <span v-else class="pill deduced" title="Journaux de débogage de Plex indisponibles : cause déduite du flux">Déduit du flux</span>
            <span v-if="verdict.source === 'plex' && reason?.text" class="pill quote" :title="reason.text">« {{ reason.text }} »</span>
          </div>
        </div>
      </div>

      <div v-if="flows.length" class="conversion-flows">
        <div v-for="flow in flows" :key="flow.label" class="conversion-flow">
          <span class="flow-label">{{ flow.label }}</span>
          <strong>{{ flow.value }}</strong>
          <span class="pill" :class="flow.tone" :title="flow.hint">{{ flow.treatment }}</span>
        </div>
      </div>

      <div v-if="requests.length" class="conversion-request">
        <span class="flow-label">Le lecteur accepte :</span>
        <span v-for="item in requests" :key="item.label" class="pill outline" :class="{ refused: item.refused }">{{ item.label }}</span>
      </div>

      <details v-if="steps.length" class="conversion-steps">
        <summary>Raisonnement de Plex ({{ steps.length }} étape{{ steps.length > 1 ? 's' : '' }})</summary>
        <ol>
          <li v-for="step in steps" :key="step.original">
            {{ step.text }}<small v-if="step.translated"> · {{ step.original }}</small>
          </li>
        </ol>
      </details>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLeftRight } from '@lucide/vue';
import { codecLabel, conversionVerdict } from '@/utils/conversionVerdict';
import { translatePlexPhrase } from '@/utils/plexDecisionText';

const props = defineProps<{ session: Record<string, any> }>();

const reason = computed(() => props.session.transcode_reason || null);
const details = computed<Record<string, any>>(() => props.session.transcode_details || {});
const verdict = computed(() => conversionVerdict(props.session));

const isConverted = (decision: unknown) => ['transcode', 'burn'].includes(String(decision || '').toLowerCase());
/* Orange : quelque chose est reencode ; bleu : seul le conteneur change (Direct Stream). */
const tone = computed(() => {
  const d = details.value;
  const reencoded = [d.video?.decision, d.audio?.decision, d.subtitles?.decision, props.session.video_decision, props.session.audio_decision]
    .some(isConverted);
  return reencoded || props.session.playback_method === 'transcode' ? 'converted' : 'remuxed';
});

const CHANNELS: Record<number, string> = { 1: 'mono', 2: 'stéréo', 6: '5.1', 8: '7.1' };
function treatment(decision: unknown, fem: boolean): { treatment: string; tone: string } {
  const value = String(decision || '').toLowerCase();
  if (value === 'transcode') return { treatment: fem ? 'Convertie' : 'Converti', tone: 'converted' };
  if (value === 'burn') return { treatment: 'Incrustés', tone: 'converted' };
  return { treatment: fem ? 'Inchangée' : 'Inchangé', tone: 'copied' };
}
const arrow = (from: unknown, to: unknown, extra = '') =>
  from && to && String(from).toLowerCase() !== String(to).toLowerCase()
    ? `${codecLabel(from)} → ${codecLabel(to)}${extra}`
    : `${codecLabel(to || from)}${extra}`;

const flows = computed(() => {
  const d = details.value;
  const rows: Array<{ label: string; value: string; treatment: string; tone: string; hint?: string }> = [];
  const container = d.container || {};
  if (container.to) {
    const changed = container.from && String(container.from).toLowerCase() !== String(container.to).toLowerCase();
    const protocol = String(d.protocol || '').toLowerCase();
    const segmented = ['dash', 'hls'].includes(protocol);
    rows.push({
      label: 'Conteneur',
      value: changed ? `${String(container.from).toUpperCase()} → ${String(container.to).toUpperCase()}` : String(container.to).toUpperCase(),
      treatment: changed ? (segmented ? 'Changé · diffusion en segments' : 'Changé') : 'Inchangé',
      tone: changed ? 'remuxed' : 'copied',
      hint: segmented ? `Protocole ${protocol.toUpperCase()}` : undefined,
    });
  }
  if (d.video?.decision) {
    rows.push({ label: 'Vidéo', value: arrow(d.video.from, d.video.to, d.video.height ? ` ${d.video.height}p` : ''), ...treatment(d.video.decision, true) });
  }
  const range = props.session.stream_details?.dynamic_range || {};
  if (range.source && range.source !== 'SDR') {
    const mapped = range.output === 'SDR';
    rows.push({ label: 'Plage dynamique', value: mapped ? `${range.source} → SDR` : range.source, treatment: mapped ? 'HDR converti en SDR' : 'Inchangée', tone: mapped ? 'converted' : 'copied' });
  }
  if (d.audio?.decision) {
    const channels = d.audio.channels ? ` ${CHANNELS[d.audio.channels] || `${d.audio.channels} canaux`}` : '';
    rows.push({ label: 'Audio', value: arrow(d.audio.from, d.audio.to, channels), ...treatment(d.audio.decision, false) });
  }
  if (d.subtitles?.decision && String(d.subtitles.decision).toLowerCase() !== 'ignore') {
    rows.push({
      label: 'Sous-titres',
      value: `${arrow(d.subtitles.from, d.subtitles.to)}${d.subtitles.forced ? ' · forcés' : ''}`,
      ...treatment(d.subtitles.decision, false),
    });
  }
  return rows;
});

/* Ce que l'application a envoye a Plex : c'est souvent la que se trouve la vraie cause. */
const requests = computed(() => {
  const client = reason.value?.client || {};
  const items: Array<{ label: string; refused?: boolean }> = [];
  if (client.directPlay != null) items.push({ label: `lecture directe : ${client.directPlay === '1' ? 'oui' : 'non'}`, refused: client.directPlay !== '1' });
  if (client.directStream != null) items.push({ label: `conversion légère : ${client.directStream === '1' ? 'oui' : 'non'}`, refused: client.directStream !== '1' });
  if (client.location) items.push({ label: `réseau ${client.location === 'lan' ? 'local' : client.location === 'wan' ? 'distant' : client.location}` });
  const bitrate = client.maxVideoBitrate || client.videoBitrate;
  if (bitrate) items.push({ label: `débit max ${bitrate} kb/s`, refused: true });
  if (client.videoResolution) items.push({ label: `résolution max ${client.videoResolution}` });
  return items;
});

const steps = computed(() =>
  ((reason.value as any)?.mde || []).map((original: string) => {
    const translated = translatePlexPhrase(original);
    return { original, text: translated ?? original, translated: Boolean(translated) };
  }),
);
</script>

<style scoped>
.conversion-panel { display: grid; gap: 8px; margin-top: 22px; }
.conversion-card { overflow: hidden; border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface-2); }
.conversion-verdict { display: flex; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--divider); }
.verdict-icon { display: grid; flex: none; place-items: center; width: 34px; height: 34px; border-radius: 10px; }
.verdict-icon svg { width: 18px; height: 18px; }
.verdict-icon.converted { background: color-mix(in srgb, var(--amber) 16%, transparent); color: var(--amber-text); }
.verdict-icon.remuxed { background: color-mix(in srgb, var(--blue) 14%, transparent); color: var(--blue-text); }
.verdict-title { display: block; font-size: var(--fs-md); line-height: 1.35; }
.verdict-explanation { margin: 4px 0 0; color: var(--text); }
.verdict-note { margin: 6px 0 0; color: var(--text); font-size: var(--fs-sm); }
.verdict-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.pill { display: inline-flex; align-items: center; max-width: 100%; padding: 3px 9px; border-radius: var(--radius-pill); font-size: var(--fs-xs); font-weight: 600; overflow-wrap: anywhere; }
.pill.plex { background: color-mix(in srgb, var(--green) 14%, transparent); color: var(--green-text); }
.pill.deduced { background: color-mix(in srgb, var(--amber) 14%, transparent); color: var(--amber-text); }
.pill.quote { background: rgb(var(--ink) / .06); color: var(--muted); font-weight: 500; }
.pill.copied { background: color-mix(in srgb, var(--green) 14%, transparent); color: var(--green-text); }
.pill.remuxed { background: color-mix(in srgb, var(--blue) 14%, transparent); color: var(--blue-text); }
.pill.converted { background: color-mix(in srgb, var(--amber) 16%, transparent); color: var(--amber-text); }
.pill.outline { border: 1px solid var(--border); color: var(--text); font-weight: 500; }
.pill.outline.refused { border-color: color-mix(in srgb, var(--red) 45%, transparent); color: var(--red-text); }
.conversion-flows { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; background: var(--divider); border-bottom: 1px solid var(--divider); }
.conversion-flow { display: grid; align-content: start; justify-items: start; gap: 4px; padding: 10px 14px; background: var(--surface-2); }
.conversion-flow strong { font-size: var(--fs-sm); }
.flow-label { color: var(--muted); font-size: var(--fs-xs); }
.conversion-request { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 16px; border-bottom: 1px solid var(--divider); }
.conversion-steps { padding: 10px 16px; }
.conversion-steps summary { color: var(--muted); font-size: var(--fs-sm); cursor: pointer; }
.conversion-steps ol { margin: 8px 0 0; padding-left: 20px; color: var(--text); font-size: var(--fs-sm); line-height: 1.7; }
.conversion-steps small { color: var(--muted); font-size: var(--fs-xs); }
.conversion-card > :last-child { border-bottom: 0; }
</style>
