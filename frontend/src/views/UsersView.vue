<template>
    <AppPage title="Utilisateurs" v-model:query="query" placeholder="Filtrer par nom, identifiant ou email" has-filters :active-count="activeFilterCount" :filters-open="filtersOpen" @toggle-filters="toggleFilters">

      <!-- Seer n'apparait que s'il est reellement actif : la page proposait
           « Synchroniser Seer » meme Seer desactive, et employait « synchroniser » en
           mode observateur, ou Seer est justement lu sans etre pilote (meme vocabulaire
           que les Reglages : « Observateur — Seer n'est qu'une source d'information »). -->
      <template #tools>
        <UiButton :loading="busy" @click="syncPlex"><template #icon><RefreshCw/></template>Synchroniser Plex</UiButton>
        <UiButton v-if="seerEnabled" :loading="busy" :title="seerHint" @click="syncSeer"><template #icon><RefreshCw/></template>{{ seerActionLabel(seerEnabled, seerMode) }}</UiButton>
        <UiButton variant="primary" @click="openCreate"><template #icon><UserPlus/></template>Ajouter</UiButton>
      </template>
    
    <div class="psh-layout">
      <FilterSidebar :open="filtersOpen" :active-count="activeFilterCount" @close="closeFilters" @reset="resetFilters">
        <FilterGroup label="Statut">
          <UiChipGroup label="Statut" :options="[{ value: '', label: 'Tous les statuts' }, { value: 'enabled', label: 'Actifs' }, { value: 'disabled', label: 'Désactivés' }]" v-model="status" />
        </FilterGroup>
        <FilterGroup label="Rôle">
          <UiChipGroup label="Rôle" :options="[{ value: '', label: 'Tous les rôles' }, { value: 'admin', label: 'Administrateurs' }, { value: 'moderator', label: 'Modérateurs' }, { value: 'user', label: 'Utilisateurs' }]" v-model="role" />
        </FilterGroup>
        <FilterGroup label="Situation">
          <UiChipGroup label="Situation" :options="[{ value: '', label: 'Toutes les situations' }, { value: 'pending', label: 'Approbations en attente' }, { value: 'missing_email', label: 'Sans email' }, { value: 'notification_error', label: 'Erreur de notification' }]" v-model="attention" />
        </FilterGroup>
        <FilterGroup label="Origine">
          <UiChipGroup label="Origine" :options="[{ value: '', label: 'Toutes les origines' }, ...sources.map((value) => ({ value, label: sourceLabel(value) }))]" v-model="source" />
        </FilterGroup>
        <FilterGroup label="Tri">
          <UiChipGroup label="Tri" :options="[{ value: 'name', label: 'Nom' }, { value: 'requests', label: 'Demandes' }, { value: 'activity', label: 'Activité récente' }]" v-model="sort" />
        </FilterGroup>
      </FilterSidebar>
      <div class="psh-main">
    <!-- Ces tuiles sont le filtre de la page : `aria-pressed` dit laquelle est active,
         ce que la seule classe CSS ne disait qu'a l'oeil. -->
    <section class="user-metrics" aria-label="Filtres rapides">
      <button
        v-for="metric in metrics"
        :key="metric.key"
        type="button"
        :class="{active:attention===metric.filter}"
        :aria-pressed="attention===metric.filter"
        @click="attention=attention===metric.filter?'':metric.filter"
      >
        <component :is="metric.icon"/>
        <div><span>{{ metric.label }}</span><strong>{{ metric.value }}</strong><small>{{ metric.detail }}</small></div>
      </button>
    </section>
    <UiFeedback v-if="error" type="error" :message="error" retry @retry="load"/><UiFeedback v-if="message" type="success" :message="message" dismissible @dismiss="message=''"/>

    <UsersTable ref="tableRef" :rows="filtered" :loading="loading" @open="openUser" @toggle="toggle" @bulk-status="bulkStatus" @bulk-notify="bulkNotify" @bulk-permissions="bulkPermissions" @bulk-delete="bulkDelete"/>

    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
      </div><!-- .psh-main -->
    </div><!-- .psh-layout -->
  </AppPage>
</template>
<script setup>
import FilterGroup from '@/components/ui/FilterGroup.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import { computed, markRaw, onMounted, ref } from 'vue';
import { BellOff, RefreshCw, ShieldCheck, UserCheck, UserPlus } from '@lucide/vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import UsersTable from '@/components/users/UsersTable.vue';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import ConfirmModal from '@/components/ConfirmModal.vue';
import { useConfirmedAction } from '@/composables/useConfirmedAction';
import { useFiltersDrawer } from '@/composables/useFiltersDrawer';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { humanizeError } from '@/utils/apiError';
import UiButton from '@/components/ui/UiButton.vue';
import { accountName, seerActionLabel, sourceLabel } from '@/utils/userLabels';

const route = useRoute(), router = useRouter();
const query = ref(''), status = ref(''), role = ref(''), attention = ref(''), source = ref(''), sort = ref('name');
const queryClient = useQueryClient();
const usersQuery = useQuery({
  queryKey: ['users', 'list'],
  queryFn: ({ signal }) => api('/api/users', { signal }),
  select: (data) => (Array.isArray(data) ? data : []),
  staleTime: 30_000,
});
const users = computed(() => usersQuery.data.value || []);
const loading = computed(() => usersQuery.isFetching.value);
// Erreurs des actions (bascules, synchronisations, suppressions), distinctes de la lecture.
const actionError = ref('');
const error = computed(() => actionError.value || (usersQuery.error.value ? humanizeError(usersQuery.error.value) : ''));
const busy = ref(false), message = ref('');
const seerEnabled = ref(false), seerMode = ref(null);
const seerHint = computed(() => seerMode.value === 'actor'
  ? 'Seer traite aussi les demandes : la synchronisation est bidirectionnelle.'
  : 'Seer est en mode observateur : ses comptes sont relus, rien ne lui est envoyé.');
const tableRef = ref(null);
const { dialog: confirmDialog, resolveConfirm, runConfirmed } = useConfirmedAction({ busy, error: actionError });

const { filtersOpen, activeCount: activeFilterCount, toggle: toggleFilters, close: closeFilters, reset: resetFilters } = useFiltersDrawer(
  { query, status, role, attention, source, sort },
  { query: '', status: '', role: '', attention: '', source: '', sort: 'name' }
);


const sources = computed(() => [...new Set(users.value.map(x => x.source).filter(Boolean))]);
/* La legende decrit ce que compte la tuile, pas autre chose : « Utilisateurs actifs »
   etait sous-titre « Demandes traitées », et « Sans notification » « Aucun
   destinataire » -- on lisait « 9 utilisateurs actifs / demandes traitées ». */
const metrics=computed(()=>[
  {key:'active',label:'Utilisateurs actifs',value:users.value.filter(user=>user.enabled).length,detail:`sur ${users.value.length} compte${users.value.length>1?'s':''}`,filter:'enabled',icon:markRaw(UserCheck)},
  {key:'pending',label:'Approbations',value:users.value.reduce((sum,user)=>sum+(user.stats?.pending_approval||0),0),detail:'Demandes en attente de validation',filter:'pending',icon:markRaw(ShieldCheck)},
  {key:'email',label:'Sans notification',value:users.value.filter(user=>!user.notification_email&&!user.plex_email&&!user.notify_admin).length,detail:'Comptes sans adresse de contact',filter:'missing_email',icon:markRaw(BellOff)},
  {key:'errors',label:'Échecs récents',value:users.value.filter(user=>user.has_notification_error).length,detail:'Comptes dont le dernier envoi a échoué',filter:'notification_error',icon:markRaw(RefreshCw)},
]);
const filtered = computed(() => users.value.filter(user =>
  /* Le pseudo du service d'origine (`display_name`) etait exclu de la recherche des
     qu'un nom personnalise existait : chercher « GachaBlock » ne trouvait pas Romain. */
  (!query.value || `${displayName(user)} ${user.display_name || ''} ${user.plex_user_id} ${user.plex_email || ''} ${user.notification_email || ''}`.toLowerCase().includes(query.value.toLowerCase())) &&
  (!status.value || (status.value === 'enabled') === Boolean(user.enabled)) &&
  (!role.value || user.role === role.value) &&
  (!attention.value || (attention.value==='enabled'&&user.enabled)||(attention.value==='pending'&&(user.stats?.pending_approval||0)>0)||(attention.value==='missing_email'&&!user.notification_email&&!user.plex_email&&!user.notify_admin)||(attention.value==='notification_error'&&user.has_notification_error)) &&
  (!source.value || user.source === source.value)
).sort((a, b) => sort.value === 'requests' ? (b.stats?.total || 0) - (a.stats?.total || 0) : sort.value==='activity' ? String(b.last_requested_at||'').localeCompare(String(a.last_requested_at||'')) : displayName(a).localeCompare(displayName(b), 'fr')));

/* `accountName` est partage avec la table et la fiche : le nom affiche, celui qui sert
   au tri et celui que cherche la recherche ne peuvent plus diverger. */
const displayName = (user) => accountName(user || {});

/** Relit la liste apres une action ; `invalidateQueries` attend la nouvelle reponse. */
async function load() { actionError.value = ''; await queryClient.invalidateQueries({ queryKey: ['users'] }); }
/* La fiche d'un compte s'ouvre dans la feuille, avec sa propre adresse (voir
   UserDetailView) : la liste reste derriere, et retour y ramene. */
function openUser(id) { ouvrirFiche(router, `/users/${id}`, route.fullPath); }
function openCreate() { ouvrirFiche(router, '/users/new', route.fullPath); }
async function toggle(user) { try { await api(`/api/users/${user.id}/enabled`, { method: 'PUT', body: JSON.stringify({ enabled: !user.enabled }) }); await load(); } catch (e) { actionError.value = e.message; } }
async function syncSeer() { busy.value = true; try { await api('/api/seer/sync', { method: 'POST' }); message.value = 'Synchronisation Seer terminee.'; await load(); } catch (e) { actionError.value = e.message; } finally { busy.value = false; } }
async function syncPlex() { busy.value = true; try { const result = await api('/api/plex/sync/users', { method: 'POST' }); message.value = `Synchronisation Plex terminée : ${result.created || 0} ajouté(s), ${result.updated || 0} mis à jour.`; await load(); } catch (e) { actionError.value = e.message; } finally { busy.value = false; } }
async function bulkStatus(enabled) { const ids = tableRef.value.selectedIds; await api('/api/users/bulk/status', { method: 'PUT', body: JSON.stringify({ user_ids: ids, enabled }) }); tableRef.value.clearSelection(); await load(); }
async function bulkDelete() { const ids = tableRef.value.selectedIds; await runConfirmed(async () => { await api('/api/users/bulk/delete', { method: 'POST', body: JSON.stringify({ user_ids: ids }) }); tableRef.value.clearSelection(); await load(); }, { title: 'Supprimer les utilisateurs sélectionnés ?', message: `${ids.length} utilisateur(s) seront supprimé(s) définitivement.`, confirmLabel: 'Supprimer', danger: true }, { reload: false }); }
async function bulkNotify(field, value) {
  const ids = tableRef.value.selectedIds;
  try { await api('/api/users/bulk/notifications', { method: 'PUT', body: JSON.stringify({ user_ids: ids, [field]: value }) }); message.value = 'Notifications mises a jour.'; tableRef.value.clearSelection(); await load(); }
  catch (e) { actionError.value = e.message; }
}
async function bulkPermissions(payload){const ids=tableRef.value.selectedIds;try{await api('/api/users/bulk/permissions',{method:'PUT',body:JSON.stringify({user_ids:ids,...payload})});message.value='Permissions mises à jour.';tableRef.value.clearSelection();await load()}catch(e){actionError.value=e.message}}

/* L'etat de Seer conditionne l'affichage de ses actions. Lu une fois au chargement :
   la page est reservee aux administrateurs, /api/settings leur est accessible. */
async function loadSeerState() {
  try {
    const settings = await api('/api/settings');
    seerEnabled.value = Boolean(settings.seer_enabled);
    seerMode.value = settings.seer_mode || null;
  } catch {
    /* Etat inconnu : on n'affiche pas d'action Seer plutot que d'en proposer une qui
       echouerait. */
    seerEnabled.value = false;
  }
}

onMounted(loadSeerState);
</script>
<style scoped lang="scss">
.user-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap: var(--space-2)}.user-metrics button{display:flex;align-items:flex-start;gap: var(--space-2);min-height:44px;padding:12px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface);color:var(--text);text-align:left}.user-metrics button:hover,.user-metrics button.active{border-color:var(--accent);background:var(--surface-2)}.user-metrics svg{width:18px;color:var(--muted)}.user-metrics div{display:grid;gap: var(--space-1)}.user-metrics span{color:var(--muted);font-size:var(--fs-xs);}.user-metrics strong{font-size:var(--fs-lg)}.user-metrics small{color:var(--muted);font-size:var(--fs-xs)}@media(max-width:767.98px){.user-metrics{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}.user-metrics button{min-width:150px;scroll-snap-align:start}}
</style>
