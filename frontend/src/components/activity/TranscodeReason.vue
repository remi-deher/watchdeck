<template>
  <!-- Deux fiabilites, deux couleurs : en vert la decision que Plex a ecrite dans ses
       journaux (le vrai pourquoi), en orange ce qu'on deduit du flux (le quoi). -->
  <div v-if="reason || remux" class="transcode-reason" :class="[reason?.source === 'plex' ? 'from-plex' : 'deduced', { compact }]">
    <!-- Bleu, comme la pastille Direct Stream : conteneur change, rien n'est reencode. -->
    <p v-if="remux" class="remux-line" title="Conteneur changé, sans réencodage"><strong>{{ remux }}</strong></p>
    <template v-if="reason">
    <p :title="compact ? tooltip : undefined">
      <strong>{{ reason.source === 'plex' ? plexPhrase(reason.text) : reason.text }}</strong>
      <small v-if="!compact">{{ sourceLabel }}</small>
    </p>
    <template v-if="!compact && reason.source === 'plex'">
      <!-- Plex motive parfois un refus par une piste que personne n'ecoute : sans ce
           contexte, sa raison passe pour une erreur. -->
      <p v-if="reason.note" class="reason-note">{{ reason.note }}</p>
      <p v-if="reason.deduced" class="deduced-line">{{ reason.deduced }}</p>
      <ul v-if="reason.mde?.length">
        <li v-for="line in reason.mde" :key="line">{{ line }}</li>
      </ul>
      <dl v-if="clientParams.length">
        <div v-for="[label, value] in clientParams" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
      </dl>
    </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { plexPhrase } from '@/utils/plexDecisionText';

export interface TranscodeReasonData {
  source: 'plex' | 'deduced';
  text: string;
  code?: number | null;
  deduced?: string | null;
  mde?: string[];
  client?: Record<string, string>;
  note?: string | null;
}

const props = defineProps<{ reason?: TranscodeReasonData | null; remux?: string | null; compact?: boolean }>();

const sourceLabel = computed(() =>
  props.reason?.source === 'plex'
    ? `Décision de Plex${props.reason.code ? ` · code ${props.reason.code}` : ''}`
    : 'Déduit du flux · journaux de débogage Plex indisponibles',
);
const tooltip = computed(() =>
  [sourceLabel.value, props.reason?.note, props.reason?.deduced].filter(Boolean).join('\n'),
);

// Ce que le lecteur a demande : c'est ce qui change entre un lancement transcode et
// une relance en lecture directe du meme fichier.
const CLIENT_LABELS: Record<string, string> = {
  location: 'Réseau annoncé',
  maxVideoBitrate: 'Débit max demandé',
  videoBitrate: 'Débit vidéo demandé',
  videoResolution: 'Résolution demandée',
  directPlay: 'Lecture directe autorisée',
  directStream: 'Direct Stream autorisé',
};
function clientValue(key: string, value: string): string {
  if (key === 'location') return value === 'lan' ? 'Local' : value === 'wan' ? 'Distant' : value;
  if (key === 'directPlay' || key === 'directStream') return value === '1' ? 'Oui' : 'Non';
  if (key.endsWith('Bitrate')) return `${value} kb/s`;
  return value;
}
const clientParams = computed(() =>
  Object.entries(props.reason?.client || {})
    .filter(([key]) => key in CLIENT_LABELS)
    .map(([key, value]) => [CLIENT_LABELS[key], clientValue(key, value)] as const),
);
</script>

<style scoped>
.transcode-reason { --reason-color: var(--amber-text); display: grid; gap: 6px; }
.transcode-reason.from-plex { --reason-color: var(--green-text); }
.transcode-reason .remux-line strong { color: var(--blue-text); }
.transcode-reason p { margin: 0; display: grid; gap: 2px; }
.transcode-reason strong { color: var(--reason-color); font-weight: 600; overflow-wrap: anywhere; }
.transcode-reason small, .deduced-line { color: var(--text-muted, inherit); font-size: .8rem; }
.transcode-reason.compact strong { font-size: .78rem; font-weight: 500; }
.reason-note { font-size: .82rem; color: var(--text); }
.transcode-reason ul { margin: 0; padding-left: 1.1rem; font-size: .82rem; }
.transcode-reason dl { margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 4px 12px; font-size: .8rem; }
.transcode-reason dl div { display: flex; justify-content: space-between; gap: 8px; }
.transcode-reason dt { color: var(--text-muted, inherit); }
.transcode-reason dd { margin: 0; }
</style>
