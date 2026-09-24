<template>
  <BulkActionBar :count="selectedIds.length" singular="utilisateur sélectionné" plural="utilisateurs sélectionnés" @clear="clear">
    <UiButton size="sm" @click="$emit('bulk-status',true)"><template #icon><Power/></template>Activer</UiButton>
    <UiButton size="sm" @click="$emit('bulk-status',false)"><template #icon><PowerOff/></template>Désactiver</UiButton>
    <select v-model="bulkNotifyField" aria-label="Type de notification à modifier"><option v-for="f in bulkNotifyFields" :key="f.value" :value="f.value">{{ f.label }}</option></select>
    <UiButton size="sm" @click="$emit('bulk-notify',bulkNotifyField,true)"><template #icon><Bell/></template>Activer</UiButton>
    <UiButton size="sm" @click="$emit('bulk-notify',bulkNotifyField,false)"><template #icon><BellOff/></template>Désactiver</UiButton>
    <select v-model="bulkRole" aria-label="Rôle à appliquer"><option value="user">Utilisateur</option><option value="moderator">Modérateur</option><option value="admin">Administrateur</option></select>
    <UiButton size="sm" @click="$emit('bulk-permissions',{role:bulkRole})"><template #icon><Shield/></template>Appliquer le rôle</UiButton>
    <UiButton size="sm" @click="$emit('bulk-permissions',{can_login:true})"><template #icon><LogIn/></template>Autoriser la connexion</UiButton>
    <UiButton size="sm" @click="$emit('bulk-permissions',{can_login:false})"><template #icon><LogOut/></template>Bloquer la connexion</UiButton>
    <UiButton variant="danger" size="sm" @click="$emit('bulk-delete')"><template #icon><Trash2/></template>Supprimer</UiButton>
  </BulkActionBar>

  <UiDataTable
    class="panel users-table"
    label="Tableau des utilisateurs"
    :rows="rows"
    :columns="columns"
    :row-key="(user: AppUser) => user.id"
    :row-label="(user: AppUser) => accountName(user)"
    :row-class="(user: AppUser) => ({ 'is-disabled': !user.enabled })"
    selectable
    v-model:selection="selectedIds"
  >
    <template #empty><UiEmptyState v-if="!loading" title="Aucun utilisateur" compact /></template>
    <!-- L'identite passe devant : un visage, un nom, puis le pseudo sous lequel la personne
         se reconnait. La ligne montrait jusqu'ici le nom surmontant un hachage opaque
         (`86dd231816e161be`), et jamais le pseudo reel. -->
    <template #cell-person="{ row: user }">
      <button class="text-button user-identity" @click="$emit('open',user.id)">
        <span class="user-avatar" :class="{ 'is-off': !user.enabled }" aria-hidden="true">
          <img v-if="user.avatar_url" :src="user.avatar_url" alt="">
          <span v-else>{{ accountInitials(user) }}</span>
        </span>
        <span class="user-identity-text">
          <strong>{{ accountName(user) }}</strong>
          <small v-if="accountHandle(user)">{{ accountHandle(user) }}</small>
          <small v-if="!user.enabled" class="user-off">Compte désactivé</small>
        </span>
      </button>
    </template>
    <template #cell-notifications="{ row: user }">
      <div class="user-notification-cell">
        <span :class="['status-dot',notificationState(user)]"></span>
        <div>{{ notificationTarget(user) }}<small v-if="user.has_notification_error">Échec récent</small></div>
      </div>
    </template>
    <!-- Libelles lisibles, et surtout plus d'invention : l'origine absente etait rendue
         « plex », ce qui presentait une supposition comme une donnee. -->
    <template #cell-source="{ row: user }">
      <span class="user-source">{{ sourceLabel(resolveSource(user)) }}</span>
      <small v-if="user.seer_user_id" class="user-seer-link">{{ seerLinkLabel(user) }}</small>
    </template>
    <template #cell-role="{ row: user }">
      <span class="badge" :class="user.role==='admin'?'available':user.role==='moderator'?'sent_to_arr':'pending'">{{ roleLabel(user.role) }}</span>
    </template>
    <template #cell-requests="{ row: user }"><strong>{{ user.stats?.total??user.request_count??0 }}</strong><small v-if="user.stats?.pending_approval" class="pending-copy">{{ user.stats.pending_approval }} à approuver</small></template>
    <template #cell-last="{ row: user }">{{ formatDate(user.last_requested_at) }}<small v-if="!user.can_login" class="blocked-copy">Connexion bloquée</small></template>
    <template #cell-actions="{ row: user }">
      <button class="icon-button" :title="`Modifier ${accountName(user)}`" :aria-label="`Modifier ${accountName(user)}`" @click="$emit('open',user.id)"><Pencil/></button>
      <button class="icon-button" :title="user.enabled?`Désactiver ${accountName(user)}`:`Activer ${accountName(user)}`" :aria-label="user.enabled?`Désactiver ${accountName(user)}`:`Activer ${accountName(user)}`" @click="$emit('toggle',user)"><Power/></button>
    </template>
  </UiDataTable>
</template>

<script setup lang="ts">
import { formatDateShort } from '@/utils/format';
import { ref, watch } from 'vue';
import { Bell, BellOff, LogIn, LogOut, Pencil, Power, PowerOff, Shield, Trash2 } from '@lucide/vue';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import BulkActionBar from '@/components/ui/BulkActionBar.vue';
import {
  accountHandle,
  accountInitials,
  accountName,
  resolveSource,
  roleLabel,
  seerLinkLabel,
  sourceLabel,
  type AccountLike,
} from '@/utils/userLabels';

export interface AppUser extends AccountLike {
  id: number | string;
  notify_admin?: boolean;
  has_notification_error?: boolean;
  can_login?: boolean;
  last_requested_at?: string;
  stats?: { total?: number; pending_approval?: number };
  request_count?: number;
}

const props = withDefaults(
  defineProps<{
    rows?: AppUser[];
    loading?: boolean;
  }>(),
  { rows: () => [], loading: false }
);
defineEmits<{
  (e: 'open', id: number | string): void;
  (e: 'toggle', user: AppUser): void;
  (e: 'bulk-status', active: boolean): void;
  (e: 'bulk-notify', field: string, active: boolean): void;
  (e: 'bulk-permissions', permissions: Record<string, any>): void;
  (e: 'bulk-delete'): void;
}>();

const columns: UiColumn<AppUser>[] = [
  { key: 'person', label: 'Personne', card: 'title', className: 'user-identity-cell' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'source', label: 'Origine du compte' },
  { key: 'role', label: 'Rôle' },
  { key: 'requests', label: 'Demandes' },
  { key: 'last', label: 'Dernière activité' },
  { key: 'actions', label: 'Actions', card: 'actions' },
];
const selectedIds = ref<Array<string | number>>([]);
function clear(): void { selectedIds.value = []; }
// Une ligne disparue (suppression, filtre) ne reste pas selectionnee en silence.
watch(() => props.rows, (rows) => {
  const presents = new Set(rows.map((user) => user.id));
  if (selectedIds.value.some((id) => !presents.has(id))) selectedIds.value = selectedIds.value.filter((id) => presents.has(id));
});
const bulkNotifyField = ref('notify_on_request');
const bulkRole = ref('user');
/* Libelles completes : « Notif. demande », « Digest » et « VF series » etaient abreges
   ou sans accent, dans un menu ou l'on choisit ce qu'on va modifier en masse. */
const bulkNotifyFields = [
  { value: 'notify_on_request', label: 'Accusé de demande' },
  { value: 'notify_on_available', label: 'Avis de disponibilité' },
  { value: 'notify_digest', label: 'Résumé quotidien' },
  { value: 'notify_admin', label: "Copie à l'administrateur" },
  { value: 'notify_vf_movie', label: 'VF des films' },
  { value: 'notify_vf_series', label: 'VF des séries' },
];

function notificationState(user: AppUser): string {
  return user.has_notification_error ? 'error' : user.notification_email || user.plex_email || user.notify_admin ? 'active' : 'missing';
}

/** Adresse reellement utilisee pour joindre ce compte, ou la raison de son absence. */
function notificationTarget(user: AppUser): string {
  const address = user.notification_email || user.plex_email;
  if (address) return address;
  if (user.notify_admin) return 'Alertes vers l’administrateur';
  return 'Aucun destinataire';
}
const formatDate = (value?: string) => formatDateShort(value, 'Aucune');
// UsersView lit la selection pour ses actions groupees et la vide apres coup.
defineExpose({ selectedIds, clearSelection: clear });
</script>
<style scoped lang="scss">
.user-notification-cell{display:flex;align-items:center;gap: var(--space-2)}.user-notification-cell>div{display:grid;gap: var(--space-1)}.user-notification-cell small,.card-title small,td>small{display:block;color:var(--muted);font-size:var(--fs-xs)}.status-dot{width:7px;height:7px;border-radius:50%;background:var(--muted)}.status-dot.active{background:var(--success)}.status-dot.error{background:var(--danger)}.status-dot.missing{background:var(--accent)}.pending-copy{color:var(--accent)}.blocked-copy{color:var(--danger)}

/* Un compte desactive reste lisible mais recule visuellement : la seule mention
   textuelle se perdait au milieu de six colonnes. */
.users-table tbody tr.is-disabled { opacity: .62; }

.user-identity {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  text-align: left;
}

.user-avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 34px;
  height: 34px;
  overflow: hidden;
  border-radius: 50%;
  background: var(--surface-2, var(--surface));
  color: var(--muted);
  font-size: .72rem;
  font-weight: 700;

  img { width: 100%; height: 100%; object-fit: cover; }
  &.is-off { filter: grayscale(1); }
}

.user-identity-text {
  display: flex;
  min-width: 0;
  flex-direction: column;

  strong, small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}

.user-off { color: var(--accent); }
.user-seer-link { display: block; color: var(--muted); font-size: var(--fs-xs); }
</style>
