<template>
    <AppPage title="Utilisateurs" v-model:query="query" placeholder="Filtrer par nom, identifiant ou email" has-filters :active-count="activeFilterCount" :filters-open="filtersOpen" @toggle-filters="toggleFilters">

      <!-- Seer n'apparait que s'il est reellement actif : la page proposait
           « Synchroniser Seer » meme Seer desactive, et employait « synchroniser » en
           mode observateur, ou Seer est justement lu sans etre pilote (meme vocabulaire
           que les Reglages : « Observateur — Seer n'est qu'une source d'information »). -->
      <template #tools>
        <UiMenu align="end">
          <template #trigger><UiButton :loading="busy"><template #icon><RefreshCw/></template>Synchroniser<template #trailing><ChevronDown/></template></UiButton></template>
          <UiMenuItem @select="syncPlex"><RefreshCw/> Synchroniser Plex</UiMenuItem>
          <UiMenuItem v-if="seerEnabled" :title="seerHint" @select="syncSeer"><RefreshCw/> {{ seerActionLabel(seerEnabled, seerMode) }}</UiMenuItem>
        </UiMenu>
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
        <FilterGroup label="Origine">
          <UiChipGroup label="Origine" :options="[{ value: '', label: 'Toutes les origines' }, ...sources.map((value) => ({ value, label: sourceLabel(value) }))]" v-model="source" />
        </FilterGroup>
      </FilterSidebar>
      <div class="psh-main">
    <!-- Une seule rangée pour les situations à traiter : elle remplace les tuiles et le filtre
         « Situation » du panneau, qui faisaient le même travail deux fois. -->
    <UiChipGroup class="user-situations-filter" label="Situations à traiter" :options="situationOptions" v-model="attention" />
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
import { computed, onMounted, ref } from 'vue';
import { ChevronDown, RefreshCw, UserPlus } from '@lucide/vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import UsersTable from '@/components/users/UsersTable.vue';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import ConfirmModal from '@/components/ConfirmModal.vue';
import { useConfirmedAction } from '@/composables/useConfirmedAction';
import { useFiltersDrawer } from '@/composables/useFiltersDrawer';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { queryKeys } from '@/queryKeys';
import { humanizeError } from '@/utils/apiError';
import UiButton from '@/components/ui/UiButton.vue';
import UiMenu from '@/components/ui/UiMenu.vue';
import UiMenuItem from '@/components/ui/UiMenuItem.vue';
import { matchesSituation, situationCounts } from '@/components/users/userSituations';
import { accountName, seerActionLabel, sourceLabel } from '@/utils/userLabels';

const route = useRoute(), router = useRouter();
const query = ref(''), status = ref(''), role = ref(''), attention = ref(''), source = ref('');
const queryClient = useQueryClient();
const usersQuery = useQuery({
  queryKey: queryKeys.users.list,
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
const { dialog: confirmDialog, resolveConfirm, runConfirmed, askConfirm } = useConfirmedAction({ busy, error: actionError });

const { filtersOpen, activeCount: activeFilterCount, toggle: toggleFilters, close: closeFilters, reset: resetFilters } = useFiltersDrawer(
  { query, status, role, attention, source },
  { query: '', status: '', role: '', attention: '', source: '' },
  { memoriser: 'utilisateurs' }
);


const sources = computed(() => [...new Set(users.value.map(x => x.source).filter(Boolean))]);
/* Les compteurs et les lignes viennent de la même règle (`userSituations`) : la puce ne peut
   pas annoncer un nombre que le tableau ne montre pas. */
const counts = computed(() => situationCounts(users.value));
const situationOptions = computed(() => [
  { value: '', label: `Tous · ${users.value.length}` },
  { value: 'pending', label: `Approbations · ${counts.value.pending}` },
  { value: 'missing_email', label: `Sans email · ${counts.value.missing_email}` },
  { value: 'notification_error', label: `Échec d’envoi · ${counts.value.notification_error}` },
]);
const filtered = computed(() => users.value.filter(user =>
  /* Le pseudo du service d'origine (`display_name`) etait exclu de la recherche des
     qu'un nom personnalise existait : chercher « GachaBlock » ne trouvait pas Romain. */
  (!query.value || `${displayName(user)} ${user.display_name || ''} ${user.plex_user_id} ${user.plex_email || ''} ${user.notification_email || ''}`.toLowerCase().includes(query.value.toLowerCase())) &&
  (!status.value || (status.value === 'enabled') === Boolean(user.enabled)) &&
  (!role.value || user.role === role.value) &&
  matchesSituation(user, attention.value) &&
  (!source.value || user.source === source.value)
).sort((a, b) => displayName(a).localeCompare(displayName(b), 'fr')));
/* Ordre de depart par nom ; les en-tetes du tableau trient ensuite chaque colonne. */

/* `accountName` est partage avec la table et la fiche : le nom affiche, celui qui sert
   au tri et celui que cherche la recherche ne peuvent plus diverger. */
const displayName = (user) => accountName(user || {});

/** Relit la liste apres une action ; `invalidateQueries` attend la nouvelle reponse. */
async function load() { actionError.value = ''; await queryClient.invalidateQueries({ queryKey: queryKeys.users.all }); }
/* La fiche d'un compte s'ouvre dans la feuille, avec sa propre adresse (voir
   UserDetailView) : la liste reste derriere, et retour y ramene. */
function openUser(id) { ouvrirFiche(router, `/users/${id}`, route.fullPath); }
function openCreate() { ouvrirFiche(router, '/users/new', route.fullPath); }
async function toggle(user) { try { await api(`/api/users/${user.id}/enabled`, { method: 'PUT', body: JSON.stringify({ enabled: !user.enabled }) }); await load(); } catch (e) { actionError.value = e.message; } }
async function syncSeer() { busy.value = true; try { await api('/api/seer/sync', { method: 'POST' }); message.value = 'Synchronisation Seer terminee.'; await load(); } catch (e) { actionError.value = e.message; } finally { busy.value = false; } }
async function syncPlex() { busy.value = true; try { const result = await api('/api/plex/sync/users', { method: 'POST' }); message.value = `Synchronisation Plex terminée : ${result.created || 0} ajouté(s), ${result.updated || 0} mis à jour.`; await load(); } catch (e) { actionError.value = e.message; } finally { busy.value = false; } }
async function bulkStatus(enabled) { const ids = tableRef.value.selectedIds; await api('/api/users/bulk/status', { method: 'PUT', body: JSON.stringify({ user_ids: ids, enabled }) }); tableRef.value.clearSelection(); await load(); }
/* Les comptes cochés, nommés dans la confirmation : « 8 comptes » ne dit pas lesquels. */
function selectedItems() {
  const ids = new Set(tableRef.value.selectedIds.map(String));
  return users.value.filter((user) => ids.has(String(user.id))).map((user) => ({
    key: user.id,
    label: displayName(user),
    detail: `${user.stats?.total ?? user.request_count ?? 0} demande${(user.stats?.total ?? user.request_count ?? 0) > 1 ? 's' : ''}`,
  }));
}
const accounts = (count) => `${count} compte${count > 1 ? 's' : ''}`;
/* Au-delà de trois comptes, supprimer demande de taper leur nombre : un clic de trop ne suffit plus. */
const TYPED_THRESHOLD = 3;
async function bulkDelete() {
  const items = selectedItems();
  const ids = tableRef.value.selectedIds;
  await runConfirmed(async () => { await api('/api/users/bulk/delete', { method: 'POST', body: JSON.stringify({ user_ids: ids }) }); tableRef.value.clearSelection(); await load(); }, {
    title: `Supprimer ${accounts(ids.length)} ?`,
    message: 'Leurs demandes et leur historique sont supprimés avec eux. Cette action est définitive.',
    confirmLabel: `Supprimer ${accounts(ids.length)}`,
    danger: true,
    items,
    typeToConfirm: ids.length > TYPED_THRESHOLD ? String(ids.length) : '',
  }, { reload: false });
}
async function bulkNotify(field, value) {
  const ids = tableRef.value.selectedIds;
  try { await api('/api/users/bulk/notifications', { method: 'PUT', body: JSON.stringify({ user_ids: ids, [field]: value }) }); message.value = 'Notifications mises a jour.'; tableRef.value.clearSelection(); await load(); }
  catch (e) { actionError.value = e.message; }
}
/* Donner le rôle administrateur ou bloquer la connexion change ce que les gens peuvent faire :
   on le dit avant, en nommant les comptes. Les autres changements de droits partent directement. */
function permissionConfirmation(payload, count) {
  if (payload.role === 'admin') {
    return { title: `Donner le rôle administrateur à ${accounts(count)} ?`, message: 'Ils pourront modifier les réglages, voir tous les comptes et approuver les demandes.', confirmLabel: 'Appliquer le rôle', danger: false };
  }
  if (payload.can_login === false) {
    return { title: `Bloquer la connexion de ${accounts(count)} ?`, message: 'Ils ne pourront plus se connecter tant que la connexion n’est pas autorisée à nouveau. Leurs demandes en cours ne changent pas.', confirmLabel: 'Bloquer la connexion', danger: true };
  }
  return null;
}
async function bulkPermissions(payload) {
  const ids = tableRef.value.selectedIds;
  const confirmation = permissionConfirmation(payload, ids.length);
  if (confirmation && !await askConfirm({ ...confirmation, items: selectedItems() })) return;
  try {
    await api('/api/users/bulk/permissions', { method: 'PUT', body: JSON.stringify({ user_ids: ids, ...payload }) });
    message.value = 'Permissions mises à jour.';
    tableRef.value.clearSelection();
    await load();
  } catch (e) { actionError.value = e.message; }
}

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
.user-situations-filter { margin-bottom: var(--space-3); }
</style>
