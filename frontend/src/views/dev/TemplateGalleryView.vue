<template>
  <!-- Galerie des gabarits, en developpement seulement (route absente en production) :
       chaque gabarit rendu avec des donnees realistes, pour en affiner le design. -->
  <PageTemplate
    v-model:query="query"
    title="Galerie des gabarits"
    :tabs="TABS"
    :active-tab="current"
    :search="current === 'explore' ? { placeholder: 'Filtrer les films…', scope: 'Bibliothèque' } : null"
    :filter-count="chips.length"
    :filter-chips="chips"
    :match-count="37"
    @reset-filters="chips = []"
  >
    <template v-if="current === 'explore'" #filters>
      <FilterGroup label="Version"><UiChipGroup label="Version" :options="[{ value: '', label: 'Toutes' }, { value: 'vf', label: 'VF' }, { value: 'vo', label: 'Sans VF' }]" model-value="vo" /></FilterGroup>
      <ExploreDisplay v-model:sort="sort" v-model:view="view" :sort-options="SORTS" />
    </template>
    <MonitorTemplate v-if="current === 'monitor'" :items="monitorItems" :icons="{ queue: ListOrdered, disks: FolderTree }" :kpis="kpis" :zones="zones" :labels="{ okTitle: 'L’encodage tourne', kpisLabel: 'Activité de l’encodage', zonesLabel: 'Parties de l’encodage', checkingTitle: 'Vérification de FileFlows…' }" />

    <TrackTemplate v-else-if="current === 'track'" :items="trackItems" :recent="recent" history-to="/dev/gabarits?g=understand" updated="Mis à jour il y a 10 s" :labels="{ items: 'traitements' }" @action="log" />

    <HandleTemplate v-else-if="current === 'handle'" :issues="issues" :items="handleItems" :selection-actions="[{ key: 'ignore', label: 'Ignorer' }, { key: 'fix', label: 'Corriger', tone: 'primary' }]" :labels="{ items: 'films' }" @action="log" @bulk="log" @selection="log" />

    <ExploreTemplate v-else-if="current === 'explore'" :view="view" :items="films" :total="37" :unit="['film', 'films']" :chips="chips" @reset="chips = []">
      <template #item="{ item, view: shown }"><LibraryCard :item="item" :view="shown" /></template>
    </ExploreTemplate>

    <BrowseTemplate v-else-if="current === 'browse'" :rows="browseRows" :hero="hubItems().slice(0, 5)" @title-click="log" @open-row="log">
      <template #item="{ item }"><LibraryCard :item="item" view="grid" /></template>
      <template #row-genres><p class="muted">Rails de genres, chargés à l’ouverture.</p></template>
    </BrowseTemplate>

    <template v-else-if="current === 'plan'">
      <PlanTemplate v-model:cursor="planCursor" :events="planEvents" :states="PLAN_STATES" :unit="['sortie', 'sorties']" preference-key="gallery.plan" @open="log" />
      <h2 class="gallery-sub">Mini-calendrier (dans une fiche)</h2>
      <MiniCalendar :entries="miniEntries" />
    </template>

    <ChooseTemplate v-else-if="current === 'choose'" v-model:mode="chooseMode" :candidates="chooseMode === 'vf' ? candidates.filter((c) => c.vf) : candidates" :modes="[{ value: 'vf', label: 'VF' }, { value: 'all', label: 'Toutes' }]" :sorts="SORTS_CHOOSE" :result="chosen" @choose="(c) => (chosen = { message: `Envoyé à Radarr : ${c.title}`, to: '/dev/gabarits?g=track' })" @reset="chosen = null">
      <template #context><p class="muted">Dune : deuxième partie · version voulue : VF, 2160p · candidats via Radarr</p></template>
    </ChooseTemplate>

    <div v-else-if="current === 'create'" class="gallery-create">
      <p class="muted">Un seul gabarit, deux définitions : il s’adapte à ce qu’on crée.</p>
      <UiButton variant="primary" @click="creating = galleryService">Ajouter un service</UiButton>
      <UiButton @click="creating = galleryUser">Ajouter un utilisateur</UiButton>
      <CreateTemplate v-if="creating" :open="Boolean(creating)" :definition="creating" @close="creating = null" />
    </div>

    <AnalyzeTemplate v-else-if="current === 'analyze'" v-model:period="analyzePeriod" :kpis="analyzeKpis" :leads="analyzeLeads" :drill="drill" @drill="openDrill" @close-drill="drill = null">
      <template #drill><ul class="gallery-drill"><li v-for="title in ['Oppenheimer', 'Dune', 'Tenet', 'Interstellar']" :key="title">{{ title }} <small>8,4 Go</small></li></ul></template>
      <template #blocks>
        <BreakdownPanel title="Résolutions" eyebrow="Vidéo" interactive :items="[{ label: '2160p', value: 22, suffix: ' %' }, { label: '1080p', value: 61, suffix: ' %' }, { label: '720p', value: 12, suffix: ' %' }, { label: 'SD', value: 5, suffix: ' %' }]" @select="(v) => openDrill({ key: `res-${v}`, title: `Résolutions · ${v}`, kind: 'block' })" />
        <BreakdownPanel title="Codecs vidéo" eyebrow="Vidéo" interactive :items="[{ label: 'HEVC', value: 48, suffix: ' %' }, { label: 'H.264', value: 46, suffix: ' %' }, { label: 'AV1', value: 6, suffix: ' %' }]" @select="(v) => openDrill({ key: `codec-${v}`, title: `Codecs · ${v}`, kind: 'block' })" />
        <ActivityHeatmap :points="heatmap" />
      </template>
    </AnalyzeTemplate>

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

    <DetailTemplate v-else-if="current === 'detail'" v-model:tab="detailTab" title="Anaconda" eyebrow="Film" :poster="POSTER" :backdrop="BACKDROP" summary="Une équipe de documentaire en Amazonie croise un chasseur obsédé par un serpent géant, qui détourne l’expédition pour le capturer vivant." :meta="['1997', 'Film', '1 h 29']" :badges="badges" :actions="detailActions" :alert="{ tone: 'danger', message: 'Le dernier encodage a échoué : durée audio différente de la source.', link: { label: 'Voir l’encodage', tab: 'encoding' } }" :tabs="DETAIL_TABS" :facts="facts" @action="log">
      <template #tab-summary><p>Distribution : Jennifer Lopez, Ice Cube, Jon Voight.</p></template>
      <template #tab-files><p>Vidéo H.264 1080p · Audio Français AC3 5.1 (défaut), Anglais DTS 5.1 · Sous-titres français forcés.</p></template>
      <template #tab-encoding><p>Échec aujourd’hui à 04:12 · Assemblage et contrôles.</p></template>
    </DetailTemplate>
  </PageTemplate>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Clapperboard, Cog, FolderTree, ListOrdered, Tv } from '@lucide/vue';
import MiniCalendar, { type MiniCalendarEntry } from '@/components/ui/MiniCalendar.vue';
import PlanTemplate, { type PlanEvent, type PlanState } from '@/components/templates/PlanTemplate.vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import LibraryCard from '@/components/library/LibraryCard.vue';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import MonitorTemplate, { type MonitorAttentionItem, type MonitorKpi, type MonitorZoneGroup } from '@/components/templates/MonitorTemplate.vue';
import TrackTemplate, { type TrackItem, type TrackRecent } from '@/components/templates/TrackTemplate.vue';
import HandleTemplate, { type HandleIssue, type HandleItem } from '@/components/templates/HandleTemplate.vue';
import ChooseTemplate, { type ChooseCandidate, type ChooseResult, type ChooseSort } from '@/components/templates/ChooseTemplate.vue';
import AnalyzeTemplate, { type AnalyzeDrill, type AnalyzeDrillRequest, type AnalyzeKpi, type AnalyzeLead, type AnalyzePeriod } from '@/components/templates/AnalyzeTemplate.vue';
import BreakdownPanel from '@/components/activity/BreakdownPanel.vue';
import ActivityHeatmap from '@/components/activity/ActivityHeatmap.vue';
import CreateTemplate, { type CreateDefinition } from '@/components/templates/CreateTemplate.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { serviceCreation } from '@/creations/service';
import { userCreation } from '@/creations/user';
import BrowseTemplate, { type BrowseRow } from '@/components/templates/BrowseTemplate.vue';
import ExploreTemplate from '@/components/templates/ExploreTemplate.vue';
import ExploreDisplay from '@/components/templates/explore/ExploreDisplay.vue';
import UnderstandTemplate, { type UnderstandDetail, type UnderstandEvent } from '@/components/templates/UnderstandTemplate.vue';
import ConfigureTemplate, { type ConfigureResource } from '@/components/templates/ConfigureTemplate.vue';
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';
import ConfigureTest from '@/components/templates/configure/ConfigureTest.vue';
import ResourceList from '@/components/templates/configure/ResourceList.vue';
import DetailTemplate, { type DetailAction, type DetailBadge } from '@/components/templates/DetailTemplate.vue';

const KEYS = ['monitor', 'track', 'handle', 'analyze', 'choose', 'create', 'plan', 'browse', 'explore', 'understand', 'configure', 'detail'] as const;
const LABELS = ['Surveiller', 'Suivre', 'Traiter', 'Analyser', 'Choisir', 'Créer', 'Anticiper', 'Parcourir', 'Explorer', 'Comprendre', 'Configurer', 'Fiche'];
const TABS = KEYS.map((key, i) => ({ key, label: LABELS[i], to: { path: '/dev/gabarits', query: { g: key } } }));
const route = useRoute();
const current = computed(() => (KEYS as readonly string[]).includes(String(route.query.g)) ? String(route.query.g) : 'monitor');
const log = (...args: unknown[]) => console.info('[galerie]', ...args);

const POSTER = 'https://image.tmdb.org/t/p/w300/ehIzBOg7wtHKgtWnSoNHRDuh0GJ.jpg';
const BACKDROP = 'https://image.tmdb.org/t/p/w1280/9MdDpjeLzGT4xaYiTRmgyzDTmSB.jpg';

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
  { key: 'dune', issue: 'vf', urgency: 'high', title: 'Dune : deuxième partie', media: { id: 1, title: 'Dune : deuxième partie', media_type: 'movie', poster_url: POSTER }, problem: 'Aucune piste française', proposal: 'release MULTi 2160p trouvée (Radarr)', actions: [{ key: 'replace', label: 'Remplacer' }, { key: 'ignore', label: 'Ignorer' }] },
  { key: 'mc', issue: 'track', urgency: 'medium', title: 'Le Comte de Monte-Cristo', media: { id: 2, title: 'Le Comte de Monte-Cristo', media_type: 'movie', poster_url: POSTER }, problem: 'VF présente mais piste par défaut en anglais', proposal: 'mettre la VF par défaut dans Plex', actions: [{ key: 'align', label: 'Aligner' }, { key: 'ignore', label: 'Ignorer' }] },
  { key: 'radarr', issue: 'subs', urgency: 'low', title: 'Profil Radarr « HD-1080p »', problem: 'Aucun sous-titre français demandé', proposal: 'ajouter le français aux langues', actions: [{ key: 'edit', label: 'Modifier le profil' }, { key: 'ignore', label: 'Ignorer' }] },
];

/* Explorer */
const query = ref('');
const view = ref<'grid' | 'list'>('grid');
const sort = ref('recent');
const SORTS = [{ value: 'recent', label: 'Ajout récent' }, { value: 'title', label: 'Titre' }];
const chips = ref([{ key: 'vo', label: 'Sans VF', onRemove: () => { chips.value = chips.value.filter((c) => c.key !== 'vo'); } }, { key: '4k', label: '4K', onRemove: () => { chips.value = chips.value.filter((c) => c.key !== '4k'); } }]);
const hubItems = () => ['Oppenheimer', 'Dune', 'Tenet', 'Interstellar', 'Heat', 'Alien', 'Arrival', 'Sicario'].map((title, i) => ({ id: i, title, year: 2023 - i, media_type: 'movie', poster_url: POSTER, backdrop_url: BACKDROP, overview: 'Un film de la bibliothèque.', status: 'available' }));
const browseRows: BrowseRow[] = [
  { kind: 'posters', key: 'recent', title: 'Derniers ajouts', items: hubItems(), moreTo: '/dev/gabarits?g=explore' },
  { kind: 'posters', key: 'requests', title: 'Dernières demandes', items: hubItems().reverse(), moreTo: '/dev/gabarits?g=explore' },
  { kind: 'collapsible', key: 'genres', title: 'Explorer par genre', eyebrow: 'Catalogue' },
];
const films = ['Oppenheimer', 'Dune', 'Tenet', 'Interstellar', 'Heat', 'Alien'].map((title, i) => ({ id: i, title, year: 2023 - i * 3, media_type: 'movie', poster_url: POSTER, status: 'available', _kind: 'library' }));

/* Analyser */
const analyzePeriod = ref<AnalyzePeriod>('30d');
const analyzeKpis: AnalyzeKpi[] = [
  { key: 'files', label: 'Fichiers', value: '12 480', change: 4 },
  { key: 'size', label: 'Poids total', value: '12,4 To', change: 3 },
  { key: 'duration', label: 'Durée cumulée', value: '21 000 h', change: 4 },
  { key: 'novf', label: 'Sans VF', value: '312', change: -6, better: 'down' },
];
const analyzeLeads: AnalyzeLead[] = [
  { key: 'novf', text: '312 films sans VF occupent 2,1 To', action: 'handle' },
  { key: 'h264', text: '1 180 fichiers en H.264 de plus de 10 Go' },
  { key: 'unwatched', text: '28 % de la bibliothèque n’a jamais été regardée' },
  { key: 'pgs', text: '40 % des lectures transcodées viennent des sous-titres PGS', action: 'handle' },
  { key: 'dup', text: '46 films existent en deux versions' },
  { key: 'old', text: '210 films ajoutés il y a plus de 5 ans, jamais revus' },
];
const drill = ref<AnalyzeDrill | null>(null);
function openDrill(request: AnalyzeDrillRequest): void {
  drill.value = { key: request.key, title: request.title, exploreTo: '/dev/gabarits?g=explore', handleTo: request.action === 'handle' ? '/dev/gabarits?g=handle' : null };
}
const heatmap = Array.from({ length: 7 * 24 }, (_, i) => ({ weekday: Math.floor(i / 24), hour: i % 24, sessions: Math.max(0, Math.round(Math.sin(((i % 24) - 14) / 4) * (Math.floor(i / 24) > 4 ? 10 : 6))) }));

/* Creer : les vraies definitions, test et creation simules (pas de serveur ici). */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const galleryService: CreateDefinition = {
  ...serviceCreation,
  test: { ...serviceCreation.test!, run: async (values) => { await wait(600); return /:\d+/.test(values.url) ? { ok: true, message: 'Connecté · Radarr 5.14' } : { ok: false, message: 'Injoignable : vérifiez l’adresse et le port.' }; } },
  submit: async (values) => { await wait(500); return { message: `« ${values.name} » branché`, detail: 'Il est actif et sera pris en compte à la prochaine synchronisation.', links: [{ label: 'Voir les connexions', to: '/dev/gabarits?g=configure' }] }; },
};
const galleryUser: CreateDefinition = {
  ...userCreation,
  submit: async (values) => { await wait(500); return { message: `${values.display_name} a été ajouté`, detail: 'Il peut se connecter avec son compte Plex.' }; },
};
const creating = ref<CreateDefinition | null>(null);

/* Choisir */
const chooseMode = ref('vf');
const chosen = ref<ChooseResult | null>(null);
const SORTS_CHOOSE: ChooseSort[] = [{ key: 'score', label: 'Meilleur score' }, { key: 'size', label: 'Taille', direction: 'asc' }, { key: 'seeds', label: 'Seeds' }];
const release = (key: string, title: string, vf: boolean, res: string, extra: string[], size: number, seeds: number, score: number, rejected = '') => ({
  key, title, vf, rejected,
  badges: [{ label: vf ? 'VF' : 'VO', tone: vf ? 'success' as const : undefined }, { label: res, tone: res === '2160p' ? 'accent' as const : undefined }, ...extra.map((label) => ({ label }))],
  facts: [`${size.toLocaleString('fr-FR')} Go`, `${seeds} seeds`, `score ${score}`],
  metrics: { size, seeds, score },
});
const candidates: Array<ChooseCandidate & { vf: boolean }> = [
  release('a', 'Dune.Part.Two.2024.MULTi.VFF.2160p.WEB-DL.DV.HDR.x265', true, '2160p', ['DV · HDR', 'WEB-DL', 'x265'], 18.4, 142, 1850),
  release('b', 'Dune.Part.Two.2024.FRENCH.CAM.x264', true, '720p', ['CAM', 'x264'], 1.4, 12, 1900, 'Qualité CAM refusée par le profil'),
  release('c', 'Dune.Part.Two.2024.MULTi.TRUEFRENCH.2160p.BluRay.REMUX.HDR', true, '2160p', ['HDR', 'REMUX', 'HEVC'], 61.2, 38, 1700),
  release('d', 'Dune.Part.Two.2024.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR', false, '2160p', ['DV · HDR', 'WEB-DL', 'x265'], 21, 520, 900),
];

/* Anticiper */
const planCursor = ref(new Date());
const PLAN_STATES: PlanState[] = [
  { key: 'available', label: 'Disponible', color: 'var(--success)' },
  { key: 'late', label: 'En retard', color: 'var(--danger)', emphasize: true },
  { key: 'upcoming', label: 'À venir', color: 'var(--accent)' },
];
const day = (offset: number, hour = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const planEvents: PlanEvent[] = [
  ['Dune : Prophecy', 'S01E05', 'upcoming', 1, 21], ['The Last of Us', 'S02E03', 'available', -2, 3], ['Gladiator II', 'Film', 'late', -5, 0], ['Severance', 'S02E08', 'upcoming', 3, 9],
  ['Andor', 'S02E01', 'upcoming', 3, 3], ['Shōgun', 'S02E02', 'available', -1, 0], ['Silo', 'S02E06', 'upcoming', 3, 4], ['Arcane', 'S02E09', 'upcoming', 3, 6], ['Wicked', 'Film', 'upcoming', 9, 0],
].map(([title, subtitle, state, offset, hour], i) => ({ key: `e${i}`, title: String(title), subtitle: String(subtitle), state: String(state), date: day(Number(offset), Number(hour)), icon: subtitle === 'Film' ? Clapperboard : Tv }));
const miniEntries: MiniCalendarEntry[] = [
  { key: 'c', date: day(-40), title: 'Sortie au cinéma', kind: 'cinema' },
  { key: 's', date: day(12), title: 'Sortie en streaming', subtitle: 'Prime Video', kind: 'streaming' },
  { key: 'p', date: day(55), title: 'Sortie en Blu-ray', subtitle: 'Édition 4K', kind: 'physical' },
];

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

<style scoped>
.gallery-create { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.gallery-drill { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; font-size: var(--fs-sm); }
.gallery-drill small { color: var(--muted); }
.gallery-sub { margin: var(--space-6) 0 var(--space-3); font-size: var(--fs-md); }
</style>
