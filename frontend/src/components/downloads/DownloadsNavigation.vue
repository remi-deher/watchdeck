<template>
  <SpaceSidebar :ariaLabel="'Navigation Téléchargements'" :brand-icon="Download" slug="downloads" :is-admin="true" :collapsed="collapsed" @toggle="$emit('toggle')">
    <template #primary-nav>
      <div class="menu-section space-primary-nav">
        <span class="menu-label">Téléchargements</span>
        <RouterLink :to="target('overview')" :class="{ active: section === 'overview' }" active-class=""><LayoutDashboard />Vue d’ensemble</RouterLink>
        <RouterLink :to="target('queue')" :class="{ active: section === 'queue' }" active-class=""><ListOrdered />File d’attente</RouterLink>

        <div class="source-group arr-source-group">
          <div class="source-parent">
            <button type="button" class="source-parent-button" :class="{ active: isArrSection }" :aria-expanded="openGroups.arr" @click="openGroups.arr = !openGroups.arr">
              <Layers3 /><span>ARR</span>
            </button>
            <button type="button" class="source-toggle" aria-label="Afficher les services ARR" :aria-expanded="openGroups.arr" @click="openGroups.arr = !openGroups.arr"><ChevronDown :class="{ rotated: openGroups.arr }" /></button>
          </div>
          <div v-if="openGroups.arr" class="arr-links">
            <div v-for="group in arrGroups" :key="group.key" class="arr-kind">
              <div class="source-parent arr-kind-parent">
                <RouterLink :to="target(group.key, group.items.length === 1 ? group.items[0].id : '')" :class="{ active: section === group.key && (!selectedSourceId || group.items.length === 1) }" active-class=""><component :is="group.icon" />{{ group.label }}<span class="nav-count">{{ group.items.length }}</span></RouterLink>
                <button v-if="group.items.length > 1" type="button" class="source-toggle" :aria-label="`${openGroups[group.key] ? 'Masquer' : 'Afficher'} les instances ${group.label}`" :aria-expanded="openGroups[group.key]" @click="openGroups[group.key] = !openGroups[group.key]"><ChevronDown :class="{ rotated: openGroups[group.key] }" /></button>
                <RouterLink v-else class="source-add" :to="settingsTarget" :aria-label="`Ajouter une instance ${group.label}`" title="Ajouter une instance"><Plus /></RouterLink>
              </div>
              <div v-if="group.items.length > 1 && openGroups[group.key]" class="source-links">
                <RouterLink v-for="item in group.items" :key="item.id" :to="target(group.key, item.id)" :class="{ active: section === group.key && String(selectedSourceId) === String(item.id) }" active-class=""><span class="source-state" />{{ item.name }}</RouterLink>
                <RouterLink class="add-instance" :to="settingsTarget"><Plus />Ajouter une instance</RouterLink>
              </div>
              <div v-else-if="!group.items.length" class="source-empty"><span>Aucune instance</span><RouterLink :to="settingsTarget"><Plus />Configurer</RouterLink></div>
            </div>
          </div>
        </div>

        <div v-for="group in clientGroups" :key="group.key" class="source-group">
          <div class="source-parent">
            <RouterLink
              :to="target(group.key, group.key === 'clients' ? '' : group.items.length === 1 ? group.items[0].id : '')"
              :class="{ active: section === group.key && (!selectedSourceId || group.key === 'clients' && route.query.sub !== 'instances') || section === group.key && group.items.length === 1 && group.key !== 'clients' }"
              active-class=""
            >
              <component :is="group.icon" />{{ group.label }}<span class="nav-count">{{ group.items.length }}</span>
            </RouterLink>
            <button v-if="hasChildLinks(group)" type="button" class="source-toggle" :aria-label="`${openGroups[group.key] ? 'Masquer' : 'Afficher'} les instances ${group.label}`" :aria-expanded="openGroups[group.key]" @click="openGroups[group.key] = !openGroups[group.key]">
              <ChevronDown :class="{ rotated: openGroups[group.key] }" />
            </button>
            <RouterLink v-else-if="group.items.length === 1" class="source-add" :to="settingsTarget" :aria-label="`Ajouter une instance ${group.label}`" title="Ajouter une instance"><Plus /></RouterLink>
          </div>

          <div v-if="hasChildLinks(group) && openGroups[group.key]" class="source-links">
            <RouterLink v-if="group.key === 'clients'" :to="clientTableTarget()" :class="{ active: section === 'clients' && route.query.sub === 'instances' && !selectedSourceId }" active-class="">
              <span class="source-state" />Tous
            </RouterLink>
            <RouterLink v-for="item in group.items" :key="item.id" :to="target(group.key, item.id)" :class="{ active: section === group.key && String(selectedSourceId) === String(item.id) }" active-class="">
              <span class="source-state" />{{ item.name }}
            </RouterLink>
            <RouterLink class="add-instance" :to="settingsTarget"><Plus />Ajouter une instance</RouterLink>
          </div>
          <div v-else-if="!group.items.length && section === group.key" class="source-empty">
            <span>Aucune instance</span><RouterLink :to="settingsTarget"><Plus />Configurer</RouterLink>
          </div>
        </div>
      </div>
    </template>

    <template #mobile-nav>
      <RouterLink :to="target('overview')" :class="{ active: section === 'overview' }" active-class=""><LayoutDashboard /><span>Vue d’ensemble</span></RouterLink>
      <RouterLink :to="target('queue')" :class="{ active: section === 'queue' }" active-class=""><ListOrdered /><span>File</span></RouterLink>
      <RouterLink :to="target(isArrSection ? section : 'radarr')" :class="{ active: isArrSection }" active-class=""><Layers3 /><span>ARR</span></RouterLink>
      <RouterLink :to="target('clients')" :class="{ active: section === 'clients' }" active-class=""><Server /><span>Client torrent</span></RouterLink>
    </template>

    <template #mobile-more-extra>
      <div class="menu-section">
        <span class="menu-label">Sources</span>
        <RouterLink :to="clientTableTarget()"><ListOrdered />Tous les torrents</RouterLink>
        <template v-for="group in sourceGroups" :key="group.key">
          <RouterLink v-for="item in group.items" :key="`${group.key}-${item.id}`" :to="target(group.key, item.id)"><component :is="group.icon" />{{ item.name }}</RouterLink>
        </template>
        <RouterLink :to="settingsTarget"><Plus />Ajouter une instance</RouterLink>
      </div>
    </template>
  </SpaceSidebar>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ChevronDown, Download, Film, Layers3, LayoutDashboard, ListOrdered, Plus, Server, Tv } from '@lucide/vue';
import SpaceSidebar from '@/components/layout/SpaceSidebar.vue';
import { useDownloadSources } from '@/composables/useDownloadSources';

withDefaults(defineProps<{ collapsed?: boolean }>(), { collapsed: false });
defineEmits<{
  (e: 'toggle'): void;
}>();

const route = useRoute();
const { arrInstances, downloadClients: clients, load: loadSources } = useDownloadSources();
const openGroups = reactive<Record<string, boolean>>({ arr: false, radarr: false, sonarr: false, clients: false });
const section = computed(() => ['queue', 'radarr', 'sonarr', 'clients'].includes(String(route.query.view)) ? String(route.query.view) : 'overview');
const selectedSourceId = computed(() => route.query.instance || route.query.client || '');
const enabledArr = computed(() => arrInstances.value.filter((item: any) => item.enabled && ['radarr', 'sonarr'].includes(item.arr_type)));
const enabledClients = computed(() => clients.value.filter((item: any) => item.enabled));
const sourceGroups = computed(() => [
  { key: 'radarr', label: 'Radarr', icon: Film, items: enabledArr.value.filter((item: any) => item.arr_type === 'radarr') },
  { key: 'sonarr', label: 'Sonarr', icon: Tv, items: enabledArr.value.filter((item: any) => item.arr_type === 'sonarr') },
  { key: 'clients', label: 'Clients torrent', icon: Server, items: enabledClients.value },
]);
const arrGroups = computed(() => sourceGroups.value.filter(group => group.key !== 'clients'));
const clientGroups = computed(() => sourceGroups.value.filter(group => group.key === 'clients'));
const isArrSection = computed(() => ['radarr', 'sonarr'].includes(section.value));
const settingsTarget = { path: '/settings', query: { tab: 'services' } };

function target(view: string, id: string | number = '') {
  const query: Record<string, string> = { view };
  if (view === 'clients') query.sub = id ? 'instances' : 'overview';
  if (id) query[view === 'clients' ? 'client' : 'instance'] = String(id);
  return { path: '/downloads', query };
}

function clientTableTarget() { return { path: '/downloads', query: { view: 'clients', sub: 'instances' } }; }
function hasChildLinks(group: { key: string; items: any[] }): boolean { return group.key === 'clients' ? group.items.length > 0 : group.items.length > 1; }

function revealCurrentGroup(): void {
  if (isArrSection.value) openGroups.arr = true;
  if (section.value in openGroups && hasChildLinks(sourceGroups.value.find(group => group.key === section.value) || { key: '', items: [] })) openGroups[section.value] = true;
}

watch([section, selectedSourceId, sourceGroups], revealCurrentGroup, { deep: true });
onMounted(async () => { await loadSources(); revealCurrentGroup(); });
</script>

<style scoped lang="scss">
.source-group{display:grid}.source-parent{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center}.source-parent>a:first-child{min-width:0}.source-parent>a:first-child .nav-count{margin-left:auto}.nav-count{padding:2px 6px;border-radius:var(--radius-pill);background:var(--surface-2);font-size:var(--fs-xs)}.source-toggle,.source-add{display:grid;place-items:center;width:30px;height:30px;margin-left:3px;padding:0;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--muted)}.source-toggle:hover,.source-add:hover{color:var(--text);background:var(--surface-2)}.source-toggle svg,.source-add svg{width:14px}.source-toggle svg{transition:transform .2s}.source-toggle svg.rotated{transform:rotate(180deg)}.source-links{display:grid;gap:2px;margin:3px 0 6px 18px;padding-left:14px;border-left:1px solid var(--border)}.source-links a{min-height:34px;padding:0 9px;font-size:var(--fs-xs)}.source-state{width:7px;height:7px;border-radius:50%;background:var(--success);box-shadow:0 0 8px color-mix(in srgb,var(--success) 70%,transparent)}.source-links .add-instance{color:var(--muted)}.source-links .add-instance svg{width:13px}.source-empty{display:grid;gap:5px;margin:4px 8px 8px 30px;padding:8px;border-left:1px solid var(--border);color:var(--muted);font-size:var(--fs-xs)}.source-empty a{min-height:30px;padding:0;color:var(--accent);font-size:var(--fs-xs)}.source-empty svg{width:13px}
.sidebar.collapsed .source-parent{display:block}.sidebar.collapsed .source-parent>a:first-child{justify-content:center}.sidebar.collapsed .source-toggle,.sidebar.collapsed .source-add,.sidebar.collapsed .source-links,.sidebar.collapsed .source-empty,.sidebar.collapsed .nav-count{display:none}
.source-parent-button{display:flex;align-items:center;gap:var(--space-3);width:100%;min-width:0;min-height:44px;padding:0 var(--space-3);border:0;border-radius:var(--radius-sm);background:transparent;color:var(--muted);font:inherit;font-size:var(--fs-sm);font-weight:600;text-align:left}.source-parent-button:hover,.source-parent-button.active{color:var(--text);background:var(--surface-2)}.source-parent-button.active>svg{color:var(--accent)}.source-parent-button>svg{width:18px}.source-parent-button .nav-count{margin-left:auto}.arr-links{display:grid;gap:3px;margin:3px 0 7px 17px;padding-left:10px;border-left:1px solid var(--border)}.arr-kind-parent>a:first-child{min-height:38px;font-size:var(--fs-xs)}
.sidebar.collapsed .source-parent-button{justify-content:center;padding:0}.sidebar.collapsed .source-parent-button span,.sidebar.collapsed .source-parent-button .nav-count,.sidebar.collapsed .arr-links{display:none}
@media(max-width:1024px) and (min-width:641px){.source-parent{display:block}.source-parent>a:first-child{justify-content:center}.source-toggle,.source-add,.source-links,.source-empty,.nav-count,.source-parent-button span{display:none}.source-parent-button{justify-content:center;padding:0}}
@media(max-width:640px){.mobile-nav-bar a.active{color:var(--accent)}.mobile-nav-bar a.active svg{transform:scale(1.15)}}
</style>
