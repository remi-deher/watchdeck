<template>
  <PageTemplate
    :title="pageTitle"
    v-model:query="query"
    :search="{ placeholder: 'Filtrer les réglages…', scope: 'Réglages', kind: 'filter' }"
    :match-count="settingsSearch.matched.value"
    :total-count="settingsSearch.total.value"
  >
    <!-- L'enregistrement des panneaux a formulaire est aussi l'action de la capsule. -->
    <template v-if="formPanels.has(tab)" #quick-action>
      <UiButton variant="primary" :loading="saving" @click="save"><template #icon><Save /></template>{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</UiButton>
    </template>
    <!-- Un panneau declare ses sections et porte lui-meme le gabarit (enregistrement global,
         garde de sortie) ; les autres, pas encore ecrits ainsi, sont enveloppes ici. -->
    <component :is="selfConfiguring.has(tab) ? 'div' : ConfigureTemplate" v-bind="selfConfiguring.has(tab) ? {} : { dirty, saving, onSave: save, onCancel: discardChanges }">
    <!-- La colonne de navigation a disparu : ses groupes sont devenus des destinations
         du rail et ses entrees leurs sections. Un seul panneau reste ici, sur toute la
         largeur -- c'est ce qui rend enfin possibles les grilles a deux ou trois
         colonnes des taches planifiees et de la maintenance. -->
    <div class="settings-layout">
      <div class="settings-panel">
        <SettingsValidationSummary />

        <!-- La question n'est plus « comment regler ceci » mais « ou vit ce reglage » :
             le champ retranche les cartes de cette page, et cette liste dit ce qui
             correspond ailleurs. -->
        <section v-if="elsewhere.length" class="settings-elsewhere">
          <h2>Ailleurs dans les réglages</h2>
          <ul>
            <li v-for="entry in elsewhere" :key="entry.path">
              <RouterLink :to="entry.path">
                <strong>{{ entry.label }}</strong>
                <small>{{ entry.group }}</small>
              </RouterLink>
            </li>
          </ul>
        </section>
        <p v-if="query.trim() && !settingsSearch.matched.value" class="settings-no-match">
          Aucun réglage de cette page ne correspond à « {{ query.trim() }} ».
        </p>

        <SettingsOverview v-if="tab==='overview'"/>
        <ConnectionsTab v-else-if="tab==='plex'"/>
        <ServicesTab v-else-if="tab==='services'"/>
        <MediaConnectionsTab v-else-if="tab==='media'"/>
        <WebhooksTab v-else-if="tab==='webhooks'"/>
        <div v-else-if="tab==='download-clients'" class="settings-rows"><ClientsVerdict/><DownloadClientsList/></div>
        <DownloadsTab v-else-if="tab==='downloads'"/>
        <!-- L'analyse VF de la bibliothèque vivait dans Connexions → Plex : elle décide de ce
             qui doit être amélioré, sa place est avec les améliorations VF. -->
        <div v-else-if="tab==='vf-upgrades'" class="settings-rows"><VfScanSection/><VfUpgradesSettingsTab/></div>
        <SubtitleSearchSection v-else-if="tab==='subtitles'"/>
        <ScheduledTasksTab v-else-if="tab==='scheduled-tasks'"/>
        <NotificationsChannelsTab v-else-if="tab==='notifications-channels'"/>
        <NotificationsRulesTab v-else-if="tab==='notifications-rules'"/>
        <EmailTemplatesPanel v-else-if="tab==='templates'"/>
        <MessageReasonsPanel v-else-if="tab==='reasons'"/>
        <RequestsTab v-else-if="tab==='requests'"/>
        <NetworkTab v-else-if="tab==='network'"/>
        <!-- Sécurité & API tient en une page : l'ancienne adresse du jeton y ouvre son bloc. -->
        <NetworkTab v-else-if="tab==='api'"/>
        <MaintenanceTab v-else-if="tab==='maintenance'"/>
        <DataTab v-else-if="tab==='data'"/>
        <GdprTab v-else-if="tab==='privacy'"/>
        <SystemVersionTab v-else-if="tab==='system-version'"/>
      </div>
    </div>

    </component>
  </PageTemplate>
</template>
<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Save } from '@lucide/vue';
import SettingsOverview from '@/components/settings/SettingsOverview.vue';
import UiButton from '@/components/ui/UiButton.vue';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import SettingsValidationSummary from '@/components/settings/SettingsValidationSummary.vue';
import { useToast } from '@/composables/useToast';
import { load, save, saving, error, message, isDirty, discardChanges } from '@/settingsForm';
import { panelForPath, pathForLegacyTab, type SettingsPanel } from '@/settingsRoutes';
import { SETTINGS_SEARCH_INDEX } from '@/settingsSearchIndex';
import { matchesQuery, normalizeSearchText, provideSettingsSearch } from '@/composables/useSettingsSearch';
import { provideSettingsPage } from '@/composables/useSettingsPage';

const ConnectionsTab = defineAsyncComponent(() => import('@/components/settings/ConnectionsTab.vue'));
const ServicesTab = defineAsyncComponent(() => import('@/components/settings/ServicesTab.vue'));
const WebhooksTab = defineAsyncComponent(() => import('@/components/settings/WebhooksTab.vue'));
const NotificationsChannelsTab = defineAsyncComponent(() => import('@/components/settings/NotificationsChannelsTab.vue'));
const NotificationsRulesTab = defineAsyncComponent(() => import('@/components/settings/NotificationsRulesTab.vue'));
const DownloadsTab = defineAsyncComponent(() => import('@/components/settings/DownloadsTab.vue'));
const VfScanSection = defineAsyncComponent(() => import('@/components/settings/VfScanSection.vue'));
const VfUpgradesSettingsTab = defineAsyncComponent(() => import('@/components/settings/VfUpgradesSettingsTab.vue'));
const SubtitleSearchSection = defineAsyncComponent(() => import('@/components/settings/SubtitleSearchSection.vue'));
const ClientsVerdict = defineAsyncComponent(() => import('@/components/settings/connections/ClientsVerdict.vue'));
const MediaConnectionsTab = defineAsyncComponent(() => import('@/components/settings/MediaConnectionsTab.vue'));
const ScheduledTasksTab = defineAsyncComponent(() => import('@/components/settings/ScheduledTasksTab.vue'));
const MaintenanceTab = defineAsyncComponent(() => import('@/components/settings/MaintenanceTab.vue'));
const DownloadClientsList = defineAsyncComponent(() => import('@/components/settings/connections/DownloadClientsList.vue'));
const RequestsTab = defineAsyncComponent(() => import('@/components/settings/RequestsTab.vue'));
const NetworkTab = defineAsyncComponent(() => import('@/components/settings/NetworkTab.vue'));
const EmailTemplatesPanel = defineAsyncComponent(() => import('@/components/EmailTemplatesPanel.vue'));
const MessageReasonsPanel = defineAsyncComponent(() => import('@/components/settings/MessageReasonsPanel.vue'));
const DataTab = defineAsyncComponent(() => import('@/components/settings/DataTab.vue'));
const GdprTab = defineAsyncComponent(() => import('@/components/settings/GdprTab.vue'));
const SystemVersionTab = defineAsyncComponent(() => import('@/components/settings/SystemVersionTab.vue'));

const route = useRoute(), router = useRouter();
// Le panneau se lit desormais dans le chemin. `?tab=` reste accepte le temps d'une
// redirection : ces liens circulent dans les favoris et les echanges, les laisser tomber
// sur la page d'accueil des reglages aurait ete une regression silencieuse.
const tab = computed(() => panelForPath(route.path));

/* Deux moities de la meme question : le champ retranche les cartes de la page affichee
   (les cartes se declarent elles-memes, voir `useSettingsSearch`), et l'index dit ou
   trouver ce qui correspond ailleurs. */
const query = ref('');
const settingsSearch = provideSettingsSearch(query);
const elsewhere = computed(() => {
  const needle = query.value.trim();
  if (normalizeSearchText(needle).length < 2) return [];
  return SETTINGS_SEARCH_INDEX.filter(
    (entry) => entry.path !== route.path && matchesQuery(`${entry.label} ${entry.group} ${entry.keywords.join(' ')}`, needle)
  ).slice(0, 6);
});
// L'accueil n'enregistre rien, mais il lit les reglages (canaux actifs, adresse
// publique) pour sa liste « A traiter » : il les charge comme les autres panneaux.
// Les panneaux qui n'editent aucun champ du formulaire general (listes gerees par leur
// propre API, actions, journaux) ne le chargent pas et n'affichent pas sa barre.
const standaloneTabs = new Set<SettingsPanel>([
  'templates', 'system-version', 'download-clients', 'maintenance', 'data',
]);
// Ceux dont les champs passent par le bouton Enregistrer de la capsule.
const formPanels = new Set<SettingsPanel>([
  'plex', 'services', 'media', 'webhooks', 'downloads', 'vf-upgrades', 'subtitles', 'scheduled-tasks',
  'notifications-channels', 'notifications-rules', 'requests', 'network', 'api', 'privacy',
]);
let settingsLoadPromise: Promise<void> | undefined;
function ensureSettingsLoaded(value = tab.value): Promise<void> {
  if (standaloneTabs.has(value)) return Promise.resolve();
  if (!settingsLoadPromise) settingsLoadPromise = load().catch((err) => {
    settingsLoadPromise = undefined;
    throw err;
  });
  return settingsLoadPromise;
}
const pageTitle = computed(() => (tab.value === 'overview' ? 'Administration' : String(route.meta?.title || 'Administration')));
/* Les panneaux qui n'editent aucun champ du formulaire general n'ont rien a enregistrer ; les autres
   passent par l'enregistrement global du gabarit (barre, confirmation avant de quitter). */
const dirty = computed(() => isDirty.value && !standaloneTabs.has(tab.value));
/* Reussites et echecs de l'enregistrement : un message qui passe, pas un bandeau. */
const toast = useToast();
watch(error, (value) => { if (value) toast.error('Enregistrement impossible', value); });
watch(message, (value) => { if (value) toast.success(value); });

provideSettingsPage({ query, dirty, saving, save, cancel: discardChanges });
/* Panneaux ecrits en sections declarees (ils portent leur ConfigureTemplate). */
const selfConfiguring = new Set<SettingsPanel>(['privacy', 'requests', 'network', 'api']);

watch(tab, (value) => ensureSettingsLoaded(value).catch(() => {}));
onMounted(() => ensureSettingsLoaded().catch(() => {}));

// Redirection des anciens liens `/settings?tab=...` vers leur chemin canonique.
function redirectLegacyTab(): void {
  const legacy = pathForLegacyTab(route.query.tab as string | undefined);
  // Le reste de la requete suit (retour OAuth des e-mails : `email_oauth`, `msg`).
  const { tab: _tab, ...query } = route.query;
  if (legacy && legacy !== route.path) router.replace({ path: legacy, query });
}
watch(() => route.query.tab, redirectLegacyTab);
onMounted(redirectLegacyTab);
</script>
<style scoped lang="scss">
/* Une seule colonne, pleine largeur. La reserve de 232px pour la navigation interne n'a
   plus lieu d'etre : c'est elle qui etranglait les grilles de cartes. */
.settings-layout { display: grid; gap: var(--space-4); min-width: 0; }
.settings-panel { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }

/* Les resultats d'ailleurs passent avant les cartes : quand on cherche « ou vit ce
   reglage », la reponse est cette liste, pas ce qui reste de la page courante. */
.settings-elsewhere {
  padding: var(--space-4);
  border: 1px solid color-mix(in srgb, var(--accent) 32%, var(--border));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent) 5%, var(--surface));
}
.settings-elsewhere h2 { margin: 0 0 var(--space-3); font-size: var(--fs-sm); color: var(--muted); }
.settings-elsewhere ul { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.settings-elsewhere a {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  color: var(--text);
  text-decoration: none;
}
.settings-elsewhere a:hover { background: var(--surface-2); }
.settings-elsewhere small { color: var(--muted); font-size: var(--fs-xs); }
.settings-no-match { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
</style>
