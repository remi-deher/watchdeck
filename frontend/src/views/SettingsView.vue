<template>
  <AppPage hide-search title="Paramètres">
    <template #actions>
      <UiButton v-if="['plex','services','webhooks','notifications-channels','notifications-rules','downloads','vf-upgrades','scheduled-tasks','data'].includes(tab)" variant="primary" :loading="saving" @click="save"><template #icon><Save/></template>{{ saving ? 'Enregistrement...' : 'Enregistrer' }}</UiButton>
    </template>
    <div class="settings-layout">
      <SettingsNav :sections="tabs" :active="tab" @select="selectTab" />

      <div class="settings-panel">
        <UiFeedback v-if="error" type="error" title="Enregistrement impossible" :message="error" />
        <UiFeedback v-if="message" type="success" :message="message" />

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
import SettingsNav from '@/components/settings/SettingsNav.vue';

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
const DataPrivacyTab = defineAsyncComponent(() => import('@/components/settings/DataPrivacyTab.vue'));
const SystemVersionTab = defineAsyncComponent(() => import('@/components/settings/SystemVersionTab.vue'));

const notificationTabDefs = notificationSections.filter((item) => typeof item.to === 'object' && 'path' in item.to && item.to.path === '/settings');
const tabs = [...settingsSections.filter((item) => !item.to), ...notificationTabDefs];
const route = useRoute(), router = useRouter();
const tab = computed(() => tabs.some((item) => item.key === route.query.tab) ? route.query.tab as string : 'overview');
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
  router.replace({ path: '/settings', query: { tab: value } });
}
function warnUnsaved(event: BeforeUnloadEvent): void { if (!isDirty.value) return; event.preventDefault(); event.returnValue = ''; }
onBeforeRouteLeave(() => !isDirty.value || askConfirm({ title: 'Quitter sans enregistrer ?', message: 'Des modifications ne sont pas enregistrées. Quitter cette page ?', confirmLabel: 'Quitter', danger: true }));
onBeforeRouteUpdate(() => !isDirty.value || askConfirm({ title: 'Changer de section sans enregistrer ?', message: 'Des modifications ne sont pas enregistrées. Changer de section ?', confirmLabel: 'Continuer', danger: true }));
onMounted(() => window.addEventListener('beforeunload', warnUnsaved));
onUnmounted(() => window.removeEventListener('beforeunload', warnUnsaved));

watch(tab, (value) => ensureSettingsLoaded(value).catch(() => {}));
onMounted(() => ensureSettingsLoaded().catch(() => {}));
</script>
<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.settings-layout { display: grid; gap: var(--space-4); min-width: 0; }
.settings-panel { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }

/* La colonne de navigation n'apparait qu'une fois la place disponible : plus bas,
   SettingsNav se replie de lui-meme au-dessus du panneau. */
@include bp.from(shell-expanded) {
  .settings-layout { grid-template-columns: 232px minmax(0, 1fr); gap: var(--space-5); align-items: start; }
}
</style>
