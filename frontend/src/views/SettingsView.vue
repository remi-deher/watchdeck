<template>
  <AppPage
    title="Paramètres"
    v-model:query="query"
    search-scope="Réglages"
    placeholder="Filtrer les réglages…"
    search-kind="filter"
    :match-count="settingsSearch.matched.value"
    :total-count="settingsSearch.total.value"
  >
    <template #actions>
      <UiButton v-if="['plex','services','webhooks','notifications-channels','notifications-rules','downloads','vf-upgrades','scheduled-tasks','data'].includes(tab)" variant="primary" :loading="saving" @click="save"><template #icon><Save/></template>{{ saving ? 'Enregistrement...' : 'Enregistrer' }}</UiButton>
    </template>
    <!-- La colonne de navigation a disparu : ses groupes sont devenus des destinations
         du rail et ses entrees leurs sections. Un seul panneau reste ici, sur toute la
         largeur -- c'est ce qui rend enfin possibles les grilles a deux ou trois
         colonnes des taches planifiees et de la maintenance. -->
    <div class="settings-layout">
      <div class="settings-panel">
        <UiFeedback v-if="error" type="error" title="Enregistrement impossible" :message="error" />
        <UiFeedback v-if="message" type="success" :message="message" />

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

        <SettingsOverview v-if="tab==='overview'" @select="selectTab"/>
        <ConnectionsTab v-else-if="tab==='plex'"/>
        <ServicesTab v-else-if="tab==='services'"/>
        <WebhooksTab v-else-if="tab==='webhooks'"/>
        <NotificationsChannelsTab v-else-if="tab==='notifications-channels'"/>
        <NotificationsRulesTab v-else-if="tab==='notifications-rules'"/>
        <DownloadsTab v-else-if="tab==='downloads'"/>
        <VfUpgradesSettingsTab v-else-if="tab==='vf-upgrades'"/>
        <PlanningMaintenanceTab v-else-if="tab==='scheduled-tasks'"/>
        <AcquisitionsConflictsTab v-else-if="tab==='acquisitions'"/>
        <EmailTemplatesPanel v-else-if="tab==='templates'"/>
        <MessageReasonsPanel v-else-if="tab==='reasons'"/>
        <SystemVersionTab v-else-if="tab==='system-version'"/>
        <DataPrivacyTab v-else/>
      </div>
    </div>

    <FormSaveBar v-if="!standaloneTabs.has(tab)" :dirty="isDirty" :saving="saving" @save="save"/>
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
  </AppPage>
</template><script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { Save } from '@lucide/vue';
import SettingsOverview from '@/components/settings/SettingsOverview.vue';
import ConfirmModal from '@/components/ConfirmModal.vue';
import { useConfirm } from '@/composables/useConfirm';
import { load, save, saving, error, message, isDirty } from '@/settingsForm';
import { settingsSections } from '@/settingsSections';
import { notificationSections } from '@/notificationSections';
import UiButton from '@/components/ui/UiButton.vue';
import { PANEL_PATHS, panelForPath, pathForLegacyTab, type SettingsPanel } from '@/settingsRoutes';
import { SETTINGS_SEARCH_INDEX } from '@/settingsSearchIndex';
import { matchesQuery, normalizeSearchText, provideSettingsSearch } from '@/composables/useSettingsSearch';

const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
const ConnectionsTab = defineAsyncComponent(() => import('@/components/settings/ConnectionsTab.vue'));
const ServicesTab = defineAsyncComponent(() => import('@/components/settings/ServicesTab.vue'));
const WebhooksTab = defineAsyncComponent(() => import('@/components/settings/WebhooksTab.vue'));
const NotificationsChannelsTab = defineAsyncComponent(() => import('@/components/settings/NotificationsChannelsTab.vue'));
const NotificationsRulesTab = defineAsyncComponent(() => import('@/components/settings/NotificationsRulesTab.vue'));
const DownloadsTab = defineAsyncComponent(() => import('@/components/settings/DownloadsTab.vue'));
const VfUpgradesSettingsTab = defineAsyncComponent(() => import('@/components/settings/VfUpgradesSettingsTab.vue'));
const PlanningMaintenanceTab = defineAsyncComponent(() => import('@/components/settings/PlanningMaintenanceTab.vue'));
const AcquisitionsConflictsTab = defineAsyncComponent(() => import('@/components/settings/AcquisitionsConflictsTab.vue'));
const EmailTemplatesPanel = defineAsyncComponent(() => import('@/components/EmailTemplatesPanel.vue'));
const MessageReasonsPanel = defineAsyncComponent(() => import('@/components/settings/MessageReasonsPanel.vue'));
const DataPrivacyTab = defineAsyncComponent(() => import('@/components/settings/DataPrivacyTab.vue'));
const SystemVersionTab = defineAsyncComponent(() => import('@/components/settings/SystemVersionTab.vue'));

const notificationTabDefs = notificationSections.filter((item) => typeof item.to === 'object' && 'path' in item.to && item.to.path === '/settings');
const tabs = [...settingsSections.filter((item) => !item.to), ...notificationTabDefs];
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
const standaloneTabs = new Set(['acquisitions', 'templates', 'overview', 'system-version']);
let settingsLoadPromise: Promise<void> | undefined;
function ensureSettingsLoaded(value = tab.value): Promise<void> {
  if (standaloneTabs.has(value)) return Promise.resolve();
  if (!settingsLoadPromise) settingsLoadPromise = load().catch((err) => {
    settingsLoadPromise = undefined;
    throw err;
  });
  return settingsLoadPromise;
}
const currentTabLabel = computed(() => tabs.find((item) => item.key === tab.value)?.label || "Vue d'ensemble");
function selectTab(value: string): void {
  router.push(PANEL_PATHS[value as SettingsPanel] || '/settings');
}
function warnUnsaved(event: BeforeUnloadEvent): void { if (!isDirty.value) return; event.preventDefault(); event.returnValue = ''; }
onBeforeRouteLeave(() => !isDirty.value || askConfirm({ title: 'Quitter sans enregistrer ?', message: 'Des modifications ne sont pas enregistrées. Quitter cette page ?', confirmLabel: 'Quitter', danger: true }));
onBeforeRouteUpdate(() => !isDirty.value || askConfirm({ title: 'Changer de section sans enregistrer ?', message: 'Des modifications ne sont pas enregistrées. Changer de section ?', confirmLabel: 'Continuer', danger: true }));
onMounted(() => window.addEventListener('beforeunload', warnUnsaved));
onUnmounted(() => window.removeEventListener('beforeunload', warnUnsaved));

watch(tab, (value) => ensureSettingsLoaded(value).catch(() => {}));
onMounted(() => ensureSettingsLoaded().catch(() => {}));

// Redirection des anciens liens `/settings?tab=...` vers leur chemin canonique.
function redirectLegacyTab(): void {
  const legacy = pathForLegacyTab(route.query.tab as string | undefined);
  if (legacy && legacy !== route.path) router.replace(legacy);
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
