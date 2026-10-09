<template>
  <!-- Galerie des gabarits, en developpement seulement (route absente en production) :
       chaque gabarit rendu avec des donnees realistes, pour en affiner le design. -->
  <PageTemplate title="Galerie des gabarits" :tabs="TABS" :active-tab="current">
    <MonitorTemplate v-if="current === 'monitor'" :items="monitorItems" :icons="{ queue: ListOrdered, disks: FolderTree }" :kpis="kpis" :zones="zones" :labels="{ okTitle: 'L’encodage tourne', kpisLabel: 'Activité de l’encodage', zonesLabel: 'Parties de l’encodage', checkingTitle: 'Vérification de FileFlows…' }" />

    <TrackTemplate v-else-if="current === 'track'" :items="trackItems" :recent="recent" history-to="/dev/gabarits?g=understand" updated="Mis à jour il y a 10 s" :labels="{ items: 'traitements' }" @action="log" />

    <HandleTemplate v-else-if="current === 'handle'" :issues="issues" :items="handleItems" :selection-actions="[{ key: 'ignore', label: 'Ignorer' }, { key: 'fix', label: 'Corriger', tone: 'primary' }]" :labels="{ items: 'films' }" @action="log" @bulk="log" @selection="log" />

    <ExploreTemplate v-else-if="current === 'explore'" v-model:filters-open="filtersOpen" v-model:view="view" v-model:sort="sort" :items="films" :total="37" :unit="['film', 'films']" :chips="chips" :sort-options="SORTS" @reset="chips = []">
      <template #filters>
        <FilterGroup label="Version"><UiChipGroup label="Version" :options="[{ value: '', label: 'Toutes' }, { value: 'vf', label: 'VF' }, { value: 'vo', label: 'Sans VF' }]" model-value="vo" /></FilterGroup>
      </template>
      <template #item="{ item, view: shown }"><LibraryCard :item="item" :view="shown" /></template>
    </ExploreTemplate>

    <UnderstandTemplate v-else-if="current === 'understand'" v-model:period="period" v-model:outcome="outcome" :periods="PERIODS" :outcomes="OUTCOMES" :events="events" :summary="summary" :open-key="openKey" :detail="openKey ? detail : null" @open="openKey = $event.key" @close="openKey = ''" @action="log" @export="log('export')" />

    <ConfigureTemplate v-else-if="current === 'configure'" :sections="sections" :dirty="dirty" @save="savePause" @cancel="pause = savedPause">
      <template #section-connection>
        <ConfigureField label="Adresse du serveur" help="Adresse de FileFlows, sans authentification." for-id="ff-url" stacked><input id="ff-url" class="input" value="http://192.168.1.51:19200" /></ConfigureField>
        <ConfigureTest :result="{ ok: true, message: 'Connecté · FileFlows 25.10 · 4 runners' }" />
      </template>
      <template #section-plex>
        <ConfigureField label="Mettre en pause" :help="PAUSE_HELP[pause]"><UiSegmentedControl v-model="pause" :options="PAUSES" ariaLabel="Pause pendant une lecture" /></ConfigureField>
      </template>
      <template #section-libraries>
        <ResourceList :resources="resources" add-label="Ajouter une bibliothèque" @toggle="(r, on) => (resources.find((x) => x.key === r.key)!.enabled = on)" />
      </template>
    </ConfigureTemplate>

    <DetailTemplate v-else-if="current === 'detail'" v-model:tab="detailTab" title="Anaconda" :meta="['1997', 'Film', '1 h 29']" :badges="badges" :actions="detailActions" :alert="{ tone: 'danger', message: 'Le dernier encodage a échoué : durée audio différente de la source.', link: { label: 'Voir l’encodage', tab: 'encoding' } }" :tabs="DETAIL_TABS" :facts="facts" @action="log">
      <template #tab-summary><p>Une équipe de documentaire en Amazonie croise un chasseur obsédé par un serpent géant.</p></template>
      <template #tab-files><p>Vidéo H.264 1080p · Audio Français AC3 5.1 (défaut), Anglais DTS 5.1 · Sous-titres français forcés.</p></template>
      <template #tab-encoding><p>Échec aujourd’hui à 04:12 · Assemblage et contrôles.</p></template>
    </DetailTemplate>
  </PageTemplate>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Cog, FolderTree, ListOrdered } from '@lucide/vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import LibraryCard from '@/components/library/LibraryCard.vue';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import MonitorTemplate, { type MonitorAttentionItem, type MonitorKpi, type MonitorZoneGroup } from '@/components/templates/MonitorTemplate.vue';
import TrackTemplate, { type TrackItem, type TrackRecent } from '@/components/templates/TrackTemplate.vue';
import HandleTemplate, { type HandleIssue, type HandleItem } from '@/components/templates/HandleTemplate.vue';
import ExploreTemplate from '@/components/templates/ExploreTemplate.vue';
import UnderstandTemplate, { type UnderstandDetail, type UnderstandEvent } from '@/components/templates/UnderstandTemplate.vue';
import ConfigureTemplate, { type ConfigureResource } from '@/components/templates/ConfigureTemplate.vue';
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';
import ConfigureTest from '@/components/templates/configure/ConfigureTest.vue';
import ResourceList from '@/components/templates/configure/ResourceList.vue';
import DetailTemplate, { type DetailAction, type DetailBadge } from '@/components/templates/DetailTemplate.vue';

const KEYS = ['monitor', 'track', 'handle', 'explore', 'understand', 'configure', 'detail'] as const;
const LABELS = ['Surveiller', 'Suivre', 'Traiter', 'Explorer', 'Comprendre', 'Configurer', 'Fiche'];
const TABS = KEYS.map((key, i) => ({ key, label: LABELS[i], to: { path: '/dev/gabarits', query: { g: key } } }));
const route = useRoute();
const current = computed(() => (KEYS as readonly string[]).includes(String(route.query.g)) ? String(route.query.g) : 'monitor');
const log = (...args: unknown[]) => console.info('[galerie]', ...args);

const POSTER = 'https://image.tmdb.org/t/p/w300/ehIzBOg7wtHKgtWnSoNHRDuh0GJ.jpg';

/* Surveiller */
const monitorItems: MonitorAttentionItem[] = [
  { key: 'ana', severity: 'error', area: 'queue', title: 'Anaconda a échoué', detail: 'Contrôle de durée audio', action: { label: 'Voir le log', to: '/dev/gabarits?g=understand' } },
  { key: 'usb2', severity: 'warn', area: 'disks', title: 'USB 2 occupe 3 runners', detail: 'Disque lent, fichiers en attente du verrou', action: { label: 'Voir la file', to: '/dev/gabarits?g=track' } },
];
const kpis: MonitorKpi[] = [
  { key: 'run', label: 'En cours', value: '4', status: 'Normal', tone: 'ok', to: '#' },
  { key: 'wait', label: 'En attente', value: '230', status: 'File longue', tone: 'info', to: '#' },
  { key: 'rate', label: 'Débit', value: '6', unit: '/h', status: '24 h', tone: 'ok', to: '#', spark: [4, 6, 5, 7, 6, 5, 6] },
  { key: 'fail', label: 'Échecs 24 h', value: '1', status: 'À voir', tone: 'error', to: '#' },
];
const zones: MonitorZoneGroup[] = [{ label: '', items: [
  { key: 'queue', label: 'Traitements', to: '#', icon: ListOrdered, line: '4 en cours', severity: null },
  { key: 'disks', label: 'Disques', to: '#', icon: FolderTree, line: 'USB 2 saturé', severity: 'warn' },
  { key: 'config', label: 'Configuration', to: '#', icon: Cog, line: 'À jour', severity: null },
] }];

/* Suivre */
const trackItems: TrackItem[] = [
  { key: 'div', state: 'blocked', title: 'Divergent (2014)', subtitle: 'USB 2 · Films', poster: POSTER, cause: { headline: 'Attend le verrou du disque depuis 42 min', hint: 'USB 2 traite déjà Psycho-Pass, disque lent.' }, actions: [{ key: 'defer', label: 'Passer après les autres disques', tone: 'primary' }, { key: 'log', label: 'Voir le log' }] },
  { key: 'scr', state: 'running', title: 'Scream 7', subtitle: 'USB 1', poster: POSTER, step: 'Vidéo', progress: 62, eta: 'reste 8 min' },
  { key: 'psy', state: 'running', title: 'Psycho-Pass', subtitle: 'USB 2', step: 'Assemblage', progress: 88, eta: 'reste 2 min' },
  ...Array.from({ length: 9 }, (_, i) => ({ key: `w${i}`, state: 'waiting' as const, title: ['Lilo et Stitch', 'Anaconda', 'Dune', 'Tenet', 'Heat', 'Alien', 'Arrival', 'Sicario', 'Prisoners'][i], subtitle: `USB ${(i % 3) + 1}`, note: i === 0 ? 'relancé à la main' : '' })),
];
const recent: TrackRecent[] = [{ key: 'd', title: 'Dune', detail: 'il y a 5 min' }, { key: 'a', title: 'Anaconda (1997)', detail: 'il y a 1 h', failed: true }];

/* Traiter */
const issues: HandleIssue[] = [
  { key: 'vf', label: 'VF manquante', count: 18, fixable: 12, bulk: { key: 'fix-vf', label: 'Corriger les 12' } },
  { key: 'track', label: 'Piste mal réglée', count: 7, fixable: 7, bulk: { key: 'align', label: 'Aligner les 7' } },
  { key: 'subs', label: 'Sous-titres absents', count: 4 },
];
const handleItems: HandleItem[] = [
  { key: 'dune', issue: 'vf', urgency: 'high', title: 'Dune : deuxième partie', poster: POSTER, problem: 'Aucune piste française', proposal: 'release MULTi 2160p trouvée (Radarr)', actions: [{ key: 'replace', label: 'Remplacer' }, { key: 'ignore', label: 'Ignorer' }] },
  { key: 'mc', issue: 'track', urgency: 'medium', title: 'Le Comte de Monte-Cristo', poster: POSTER, problem: 'VF présente mais piste par défaut en anglais', proposal: 'mettre la VF par défaut dans Plex', actions: [{ key: 'align', label: 'Aligner' }, { key: 'ignore', label: 'Ignorer' }] },
  { key: 'radarr', issue: 'subs', urgency: 'low', title: 'Profil Radarr « HD-1080p »', problem: 'Aucun sous-titre français demandé', proposal: 'ajouter le français aux langues', actions: [{ key: 'edit', label: 'Modifier le profil' }, { key: 'ignore', label: 'Ignorer' }] },
];

/* Explorer */
const filtersOpen = ref(false);
const view = ref<'grid' | 'list'>('grid');
const sort = ref<unknown>('recent');
const SORTS = [{ value: 'recent', label: 'Ajout récent' }, { value: 'title', label: 'Titre' }];
const chips = ref([{ key: 'vo', label: 'Sans VF', onRemove: () => { chips.value = chips.value.filter((c) => c.key !== 'vo'); } }, { key: '4k', label: '4K', onRemove: () => { chips.value = chips.value.filter((c) => c.key !== '4k'); } }]);
const films = ['Oppenheimer', 'Dune', 'Tenet', 'Interstellar', 'Heat', 'Alien'].map((title, i) => ({ id: i, title, year: 2023 - i * 3, media_type: 'movie', poster_url: POSTER, status: 'available', _kind: 'library' }));

/* Comprendre */
const period = ref('7d');
const outcome = ref('all');
const PERIODS = [{ value: '1d', label: '24 h' }, { value: '7d', label: '7 jours' }, { value: '30d', label: '30 jours' }];
const OUTCOMES = [{ value: 'all', label: 'Tout' }, { value: 'success', label: 'Réussis' }, { value: 'failed', label: 'Échecs' }];
const at = (daysAgo: number, h: number, m: number) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.toISOString(); };
const events: UnderstandEvent[] = [
  { key: 'ana', at: at(0, 4, 12), outcome: 'failed', title: 'Anaconda (1997)', detail: 'Contrôle de durée audio', context: 'USB 3' },
  { key: 'dune', at: at(0, 3, 58), outcome: 'success', title: 'Dune', detail: 'Réencodage · −4,1 Go', context: 'USB 1' },
  { key: 'tenet', at: at(0, 3, 31), outcome: 'success', title: 'Tenet', detail: 'Sur place · 0 Go', context: 'USB 1' },
  { key: 'heat', at: at(1, 22, 5), outcome: 'success', title: 'Heat', detail: 'Réécriture · −0,3 Go', context: 'USB 2' },
];
const summary = [{ key: 'ok', label: 'traités', value: '142' }, { key: 'ko', label: 'échecs', value: '3', tone: 'danger' as const }, { key: 'gain', label: 'gagnés', value: '−212 Go', tone: 'success' as const }];
const openKey = ref('');
const detail: UnderstandDetail = {
  title: 'Anaconda (1997)', subtitle: 'Aujourd’hui 04:12 · USB 3', outcome: 'failed', cause: 'Durée audio 1:29:12 contre 1:29:40 attendu',
  comparison: [{ label: 'Taille', before: '8,2 Go', after: '—' }, { label: 'Vidéo', before: 'H.264', after: '—' }],
  steps: [{ label: 'Verrou du disque', outcome: 'success', duration: '0 s' }, { label: 'Sous-titres', outcome: 'success', duration: '12 s' }, { label: 'Audio', outcome: 'success', duration: '2 min' }, { label: 'Assemblage et contrôles', outcome: 'failed' }],
  links: [{ label: 'Voir le log', to: '#' }, { label: 'Ouvrir la fiche', to: '/dev/gabarits?g=detail' }],
  action: { key: 'retry', label: 'Relancer' },
};

/* Configurer */
const PAUSES = [{ value: 'off', label: 'Non' }, { value: 'disk', label: 'Disque lu' }, { value: 'all', label: 'Tout' }];
const PAUSE_HELP: Record<string, string> = { off: 'Les traitements continuent pendant les lectures.', disk: 'Seul le disque du fichier lu attend ; les autres continuent.', all: 'Tout attend la fin des lectures.' };
const savedPause = ref('off');
const pause = ref('off');
const dirty = computed(() => pause.value !== savedPause.value);
const savePause = () => { savedPause.value = pause.value; };
const sections = computed(() => [
  { key: 'connection', title: 'Connexion à FileFlows', description: 'Où trouver le serveur, et vérifier qu’il répond.' },
  { key: 'plex', title: 'Pendant une lecture Plex', description: 'Éviter de ralentir un film en cours de lecture.', dirty: dirty.value },
  { key: 'libraries', title: 'Bibliothèques FileFlows', description: 'Ce que FileFlows traite, et sa correspondance avec Plex.' },
]);
const resources = ref<ConfigureResource[]>([
  { key: 'u1', label: 'Films — USB 1', subtitle: '/usb/MEDIA/FILMS', enabled: true, state: { tone: 'ok', text: 'Correspondance Plex OK' } },
  { key: 'u2', label: 'Films — USB 2', subtitle: '/usb2/MEDIA/FILMS', enabled: true, state: { tone: 'ok', text: 'Correspondance Plex OK' } },
  { key: 'u4', label: 'Films — USB 4', subtitle: '/usb4/MEDIA/FILMS', enabled: true, testable: true, state: { tone: 'error', text: 'Dossier Plex introuvable' } },
  { key: 's1', label: 'Séries — USB 1', subtitle: '/usb/MEDIA/SERIES', enabled: false },
]);

/* Fiche */
const detailTab = ref('summary');
const DETAIL_TABS = [{ key: 'summary', label: 'Résumé' }, { key: 'files', label: 'Fichiers et pistes' }, { key: 'encoding', label: 'Encodage' }];
const badges: DetailBadge[] = [{ key: 'plex', label: 'Dans Plex', tone: 'success' }, { key: 'vf', label: 'VF', tone: 'success' }, { key: 'enc', label: 'Encodage en échec', tone: 'danger' }];
const detailActions: DetailAction[] = [{ key: 'play', label: 'Lire dans Plex' }, { key: 'relaunch', label: 'Relancer l’encodage' }, { key: 'vf', label: 'Chercher une VF' }, { key: 'delete', label: 'Supprimer', danger: true }];
const facts = [{ label: 'Qualité', value: '1080p' }, { label: 'Taille', value: '8,2 Go' }, { label: 'Audio', value: 'FR, EN' }, { label: 'Disque', value: 'USB 3' }, { label: 'Source', value: 'Radarr' }];
</script>
