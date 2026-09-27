<template>
  <!-- Details de la session, ranges par theme : ce qui se passe (Lecture), qui regarde et
       avec quoi (Lecteur), par ou passe le flux (Reseau), quand (Chronologie). Quatre
       cartes de taille voisine, plutot qu'un bloc « Contexte » de onze lignes qui melait
       tout, avec « Opera » trois fois. -->
  <section class="session-facts" aria-label="Détails de la session">
    <article v-for="card in cards" :key="card.title" class="facts-card">
      <h3><component :is="card.icon" aria-hidden="true" />{{ card.title }}</h3>
      <dl>
        <div v-for="row in card.rows" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd :class="{ mono: row.mono }">
            <span :title="row.title">{{ row.value }}</span>
            <UiButton v-if="row.copy" class="copy-id" variant="ghost" size="sm" icon-only title="Copier l’identifiant" aria-label="Copier l’identifiant de session Plex" @click="copy(row.copy)"><Copy /></UiButton>
          </dd>
        </div>
      </dl>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Clock3, Copy, Globe, MonitorPlay, Play } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import { useToast } from '@/composables/useToast';
import { formatDurationExact as formatDuration, formatDateTime, formatTime } from '@/utils/format';

const props = defineProps<{ session: Record<string, any> }>();
const { addToast } = useToast();

interface Row { label: string; value: string; mono?: boolean; title?: string; copy?: string }

const STATES: Record<string, string> = { playing: 'En lecture', paused: 'En pause', buffering: 'Mise en mémoire' };
const clean = (value: unknown) => {
  const text = String(value ?? '').trim();
  // Plex Web renvoie « standalone » comme modele : ca n'apprend rien.
  return text && text.toLowerCase() !== 'standalone' ? text : '';
};

function isLocal(s: Record<string, any>): boolean {
  return s.geo_status === 'local' || s.location === 'lan' || s.stream_location === 'lan' || s.stream_details?.local === true;
}

const cards = computed(() => {
  const s = props.session;
  const stream = s.stream_details || {};
  const player = stream.player || {};
  const details = s.transcode_details || {};
  const duration = s.duration_ms || 0;
  const watched = s.progress_ms || s.watched_ms || 0;

  const lecture: Row[] = [{ label: 'État', value: s.ended_at ? 'Terminée' : STATES[String(s.state)] || 'En lecture' }];
  const outHeight = details.video?.height;
  const reencoded = String(details.video?.decision || s.video_decision || '').toLowerCase() === 'transcode';
  lecture.push({ label: 'Qualité', value: reencoded && outHeight && s.quality ? `${s.quality} → ${outHeight}p` : s.quality || 'Automatique' });
  lecture.push({ label: 'Visionné', value: duration ? `${formatDuration(watched)} sur ${formatDuration(duration)}` : formatDuration(watched) });
  if (s.initial_progress_ms && duration) lecture.push({ label: 'Reprise', value: `depuis ${Math.round((s.initial_progress_ms / duration) * 100)} %` });
  if ((s.group_count || 1) > 1) lecture.push({ label: 'Séances', value: `${s.group_count}e séance de ce média` });

  const lecteur: Row[] = [];
  const app = [player.product || s.product, player.version].filter(Boolean).join(' ');
  if (app) lecteur.push({ label: 'Application', value: app });
  const device = clean([player.vendor, player.model].filter(Boolean).join(' ')) || clean(s.player);
  if (device) lecteur.push({ label: 'Appareil', value: device });
  const system = [player.platform || s.platform, player.platform_version].filter(Boolean).join(' ');
  if (system) lecteur.push({ label: 'Système', value: system });
  lecteur.push({ label: 'Utilisateur', value: s.user_name || 'Utilisateur Plex' });
  lecteur.push({ label: 'Bibliothèque', value: s.library || '—' });

  const reseau: Row[] = [];
  const secure = stream.secure == null ? '' : stream.secure ? ' · chiffrée' : ' · non chiffrée';
  reseau.push({ label: 'Connexion', value: `${isLocal(s) ? 'Locale' : 'Distante'}${secure}` });
  const place = [s.geo_city, s.geo_country_code || s.geo_country].filter(Boolean).join(', ');
  if (place) reseau.push({ label: 'Lieu', value: place });
  const isp = s.geo_isp || s.geo_organization;
  if (isp) reseau.push({ label: 'Fournisseur', value: isp });
  if (stream.relayed != null) reseau.push({ label: 'Relais Plex (limité à ~2 Mb/s)', value: stream.relayed ? 'Oui' : 'Non' });
  reseau.push({ label: 'Adresse IP', value: s.address || 'Indisponible', mono: true });

  const chrono: Row[] = [{ label: 'Début', value: formatDateTime(s.started_at, '—') }];
  chrono.push(s.ended_at
    ? { label: 'Fin', value: formatTime(s.ended_at) }
    : { label: 'Dernière activité', value: formatTime(s.last_seen_at) });
  if (s.paused_ms) chrono.push({ label: 'Temps en pause', value: formatDuration(s.paused_ms) });
  chrono.push({ label: 'Enregistré par', value: s.source === 'tautulli' ? 'Tautulli' : 'Plex' });
  if (s.session_id) {
    const id = String(s.session_id);
    chrono.push({ label: 'Identifiant de session Plex', value: id.length > 14 ? `${id.slice(0, 7)}…${id.slice(-4)}` : id, title: id, mono: true, copy: id });
  }

  return [
    { title: 'Lecture', icon: Play, rows: lecture },
    { title: 'Lecteur', icon: MonitorPlay, rows: lecteur },
    { title: 'Réseau', icon: Globe, rows: reseau },
    { title: 'Chronologie', icon: Clock3, rows: chrono },
  ];
});

/* L'identifiant est tronque a l'affichage : le copier evite de le recopier a la main
   (recherche dans les journaux de Plex, ticket). */
async function copy(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    addToast({ type: 'success', message: 'Identifiant copié.' });
  } catch {
    addToast({ type: 'error', message: 'Copie impossible : le presse-papier est refusé par le navigateur.' });
  }
}
</script>

<style scoped>
.session-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; margin-top: 22px; }
.facts-card { overflow: hidden; border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface-2); }
.facts-card h3 { display: flex; align-items: center; gap: 8px; margin: 0; padding: 10px 14px; border-bottom: 1px solid var(--divider); font-size: var(--fs-sm); }
.facts-card h3 svg { width: 16px; height: 16px; color: var(--muted); }
.facts-card dl { margin: 0; }
.facts-card dl > div { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 14px; border-bottom: 1px solid var(--divider); }
.facts-card dl > div:last-child { border-bottom: 0; }
.facts-card dt { color: var(--muted); font-size: var(--fs-xs); }
.facts-card dd { display: flex; align-items: center; gap: 4px; min-width: 0; margin: 0; color: var(--text); font-size: var(--fs-sm); font-weight: 600; text-align: right; }
.facts-card dd span { min-width: 0; overflow-wrap: anywhere; }
.facts-card dd.mono { font-family: var(--font-mono); font-weight: 500; font-variant-numeric: tabular-nums; }
.copy-id { flex: none; margin: -6px -6px -6px 0; }
</style>
