<template>
  <BulkActionBar :count="selectedIds.length" singular="utilisateur sélectionné" plural="utilisateurs sélectionnés" @clear="clear">
    <UiButton size="sm" @click="$emit('bulk-status',true)"><template #icon><Power/></template>Activer</UiButton>
    <UiButton size="sm" @click="$emit('bulk-status',false)"><template #icon><PowerOff/></template>Désactiver</UiButton>
    <select v-model="bulkNotifyField"><option v-for="f in bulkNotifyFields" :key="f.value" :value="f.value">{{ f.label }}</option></select>
    <UiButton size="sm" @click="$emit('bulk-notify',bulkNotifyField,true)"><template #icon><Bell/></template>Activer</UiButton>
    <UiButton size="sm" @click="$emit('bulk-notify',bulkNotifyField,false)"><template #icon><BellOff/></template>Désactiver</UiButton>
    <select v-model="bulkRole"><option value="user">Utilisateur</option><option value="moderator">Modérateur</option><option value="admin">Administrateur</option></select>
    <UiButton size="sm" @click="$emit('bulk-permissions',{role:bulkRole})"><template #icon><Shield/></template>Appliquer le rôle</UiButton>
    <UiButton size="sm" @click="$emit('bulk-permissions',{can_login:true})"><template #icon><LogIn/></template>Autoriser la connexion</UiButton>
    <UiButton size="sm" @click="$emit('bulk-permissions',{can_login:false})"><template #icon><LogOut/></template>Bloquer la connexion</UiButton>
    <UiButton variant="danger" size="sm" @click="$emit('bulk-delete')"><template #icon><Trash2/></template>Supprimer</UiButton>
  </BulkActionBar>

  <section class="panel table-wrap table-cards rich" tabindex="0" role="region" aria-label="Tableau des utilisateurs, défilement horizontal">
    <table>
      <thead>
        <tr><th><label class="select-tag"><input type="checkbox" :checked="allSelected" aria-label="Selectionner tous les utilisateurs" @change="toggleAll"></label></th><th>Utilisateur</th><th>Notifications</th><th>Source</th><th>Role</th><th>Demandes</th><th>Dernière activité</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="user in rows" :key="user.id">
          <td class="card-select"><label class="select-tag"><input type="checkbox" :checked="isSelected(user)" :aria-label="`Selectionner ${displayName(user)}`" @change="toggle(user)"></label></td>
          <td class="card-title"><button class="text-button" @click="$emit('open',user.id)"><strong>{{ displayName(user) }}</strong><small>{{ user.plex_user_id }} · {{ user.enabled?'Actif':'Désactivé' }}</small></button></td>
          <td data-label="Notifications"><div class="user-notification-cell"><span :class="['status-dot',notificationState(user)]"></span><div>{{ user.notification_email||user.plex_email||user.notify_admin?'Via administrateur':'Aucun destinataire' }}<small v-if="user.has_notification_error">Échec récent</small></div></div></td>
          <td data-label="Source">{{ user.source||'plex' }}</td>
          <td data-label="Role"><span class="badge" :class="user.role==='admin'?'available':user.role==='moderator'?'sent_to_arr':'pending'">{{ user.role }}</span></td>
          <td data-label="Demandes"><strong>{{ user.stats?.total??user.request_count??0 }}</strong><small v-if="user.stats?.pending_approval" class="pending-copy">{{ user.stats.pending_approval }} à approuver</small></td>
          <td data-label="Dernière activité">{{ formatDate(user.last_requested_at) }}<small>{{ user.can_login?'Connexion autorisée':'Connexion bloquée' }}</small></td>
          <td class="card-actions"><button class="icon-button" :title="user.enabled?'Desactiver':'Activer'" :aria-label="user.enabled?'Desactiver':'Activer'" @click="$emit('toggle',user)"><Power/></button></td>
        </tr>
      </tbody>
    </table>
    <UiEmptyState v-if="!loading&&!rows.length" title="Aucun utilisateur" compact />
  </section>
</template>

<script setup lang="ts">
import { formatDateShort } from '@/utils/format';
import { ref } from 'vue';
import { Bell, BellOff, LogIn, LogOut, Power, PowerOff, Shield, Trash2 } from '@lucide/vue';
import { useTableSelection } from '@/composables/useTableSelection';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import BulkActionBar from '@/components/ui/BulkActionBar.vue';

export interface AppUser {
  id: number | string;
  plex_user_id?: string;
  custom_name?: string;
  display_name?: string;
  enabled?: boolean;
  role?: string;
  source?: string;
  notification_email?: string;
  plex_email?: string;
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

const { selectedIds, allSelected, isSelected, toggle, toggleAll, clear } = useTableSelection(() => props.rows);
const bulkNotifyField = ref('notify_on_request');
const bulkRole = ref('user');
const bulkNotifyFields = [
  { value: 'notify_on_request', label: 'Notif. demande' },
  { value: 'notify_on_available', label: 'Notif. disponibilite' },
  { value: 'notify_digest', label: 'Digest' },
  { value: 'notify_admin', label: "Copie à l'administrateur" },
  { value: 'notify_vf_movie', label: 'VF films' },
  { value: 'notify_vf_series', label: 'VF series' },
];

function displayName(user: AppUser): string { return user?.custom_name || user?.display_name || user?.plex_user_id || ''; }
function notificationState(user: AppUser): string {
  return user.has_notification_error ? 'error' : user.notification_email || user.plex_email || user.notify_admin ? 'active' : 'missing';
}
const formatDate = (value?: string) => formatDateShort(value, 'Aucune');
// UsersView lit la selection pour ses actions groupees et la vide apres coup.
defineExpose({ selectedIds, clearSelection: clear });
</script>
<style scoped lang="scss">
.user-notification-cell{display:flex;align-items:center;gap: var(--space-2)}.user-notification-cell>div{display:grid;gap: var(--space-1)}.user-notification-cell small,.card-title small,td>small{display:block;color:var(--muted);font-size:var(--fs-xs)}.status-dot{width:7px;height:7px;border-radius:50%;background:var(--muted)}.status-dot.active{background:var(--success)}.status-dot.error{background:var(--danger)}.status-dot.missing{background:var(--accent)}.pending-copy{color:var(--accent)}
</style>
