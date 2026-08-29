<!--
  Espace Paramètres. Contrairement aux espaces déclaratifs de spaces.js, sa navigation a
  deux modes (liste des catégories à la racine /settings, entrées du groupe courant une
  fois dedans) : elle reste donc écrite ici, dans les slots de SpaceSidebar, qui fournit
  la coquille commune (marque, repli, popover compte, barre et feuille mobiles).
-->
<template>
  <SpaceSidebar
    :ariaLabel="'Navigation Paramètres'"
    :brand-icon="Settings"
    slug="settings"
    app-link-to="/users"
    app-link-label="Administration"
    :app-link-icon="Users"
    :collapsed="collapsed"
    @toggle="$emit('toggle')"
  >
    <template #primary-nav>
      <div class="menu-section settings-home-nav">
        <RouterLink to="/dashboard" title="Accueil"><House /><span>Accueil</span></RouterLink>
      </div>

      <!-- Mode A : vue d'ensemble et liste des catégories, à la racine /settings -->
      <template v-if="isGlobalOverview">
        <div class="menu-section settings-global-nav">
          <span class="menu-label">Paramètres</span>
          <RouterLink :to="{ path: '/settings', query: { tab: 'overview' } }" class="router-link-active" title="Vue d’ensemble">
            <ServerCog /><span>Vue d’ensemble</span>
          </RouterLink>
        </div>

        <div class="menu-section settings-categories-nav">
          <span class="menu-label">Catégories</span>
          <RouterLink v-for="group in settingsGroups" :key="group.label" :to="getItemRoute(group.items[0])" :title="group.label">
            <component :is="group.items[0].icon" /><span>{{ group.label }}</span>
          </RouterLink>
        </div>
      </template>

      <!-- Mode B : entrées du groupe courant, précédées du retour -->
      <template v-else>
        <div class="menu-section settings-back-nav">
          <RouterLink :to="{ path: '/settings', query: { tab: 'overview' } }" class="back-settings-link" title="Retour aux paramètres">
            <ArrowLeft /><span>Paramètres</span>
          </RouterLink>
        </div>

        <div class="menu-section settings-primary-nav">
          <span class="menu-label">{{ activeGroupLabel }}</span>
          <RouterLink
            v-for="item in activeGroupItems"
            :key="item.key"
            :to="getItemRoute(item)"
            :class="{ 'router-link-active': isItemActive(item) }"
            :title="item.label"
          >
            <component :is="item.icon" /><span>{{ item.label }}</span>
          </RouterLink>
        </div>
      </template>
    </template>

    <template #mobile-nav>
      <template v-if="isGlobalOverview">
        <RouterLink :to="{ path: '/settings', query: { tab: 'overview' } }" class="router-link-active">
          <ServerCog /><span>Aperçu</span>
        </RouterLink>
        <RouterLink v-for="group in settingsGroups" :key="group.label" :to="getItemRoute(group.items[0])">
          <component :is="group.items[0].icon" />
          <span>{{ group.label === 'Bibliothèque & acquisition' ? 'Bibliothèque' : group.label }}</span>
        </RouterLink>
      </template>
      <template v-else>
        <RouterLink :to="{ path: '/settings', query: { tab: 'overview' } }"><ArrowLeft /><span>Retour</span></RouterLink>
        <RouterLink
          v-for="item in activeGroupItems"
          :key="item.key"
          :to="getItemRoute(item)"
          :class="{ 'router-link-active': isItemActive(item) }"
        >
          <component :is="item.icon" /><span>{{ item.mobileLabel || item.label }}</span>
        </RouterLink>
      </template>
    </template>

  </SpaceSidebar>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { ArrowLeft, House, ServerCog, Settings, Users } from '@lucide/vue';
import SpaceSidebar from '@/components/layout/SpaceSidebar.vue';
import { settingsSections, type SettingsSectionConfig } from '@/settingsSections';

withDefaults(defineProps<{ collapsed?: boolean }>(), { collapsed: false });
defineEmits<{
  (e: 'toggle'): void;
}>();

const route = useRoute();

const settingsGroups = computed(() => {
  const groups: Array<{ label: string; items: SettingsSectionConfig[] }> = [];
  for (const item of settingsSections) {
    if (!item.group) continue;
    let group = groups.find(g => g.label === item.group);
    if (!group) { group = { label: item.group, items: [] }; groups.push(group); }
    group.items.push(item);
  }
  return groups;
});

const isGlobalOverview = computed(() =>
  route.path === '/settings' && (!route.query.tab || route.query.tab === 'overview'));

const activeItem = computed(() => settingsSections.find(item => {
  if (item.to) return route.path === item.to || route.path.startsWith(item.to);
  const currentTab = route.query.tab || 'overview';
  return route.path === '/settings' && currentTab === item.key;
}) || settingsSections[0]);

const activeGroupLabel = computed(() => (isGlobalOverview.value ? '' : activeItem.value?.group || 'Services'));

const activeGroupItems = computed(() => (activeGroupLabel.value
  ? settingsSections.filter(item => item.group === activeGroupLabel.value)
  : []));

function getItemRoute(item: SettingsSectionConfig) {
  return item.to || { path: '/settings', query: { tab: item.key } };
}

function isItemActive(item: SettingsSectionConfig): boolean {
  if (item.to) return route.path === item.to;
  const currentTab = route.query.tab || 'overview';
  return route.path === '/settings' && currentTab === item.key;
}
</script>

<style scoped lang="scss">
/* Marque, repli, popover compte et surfaces mobiles viennent de SpaceSidebar : ne reste
   ici que l'espacement propre aux sections des deux modes, et le lien de retour. */
.settings-home-nav { margin-top: var(--space-2); }
.settings-global-nav { margin-top: var(--space-2); }
.settings-categories-nav { margin-top: var(--space-3); }
.settings-back-nav { margin-top: var(--space-2); }
.settings-primary-nav { margin-top: var(--space-2); }

.back-settings-link {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: var(--fs-sm);
  font-weight: 600;
  transition: color 0.15s ease, background 0.15s ease;
}
.back-settings-link:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.04);
}
</style>
