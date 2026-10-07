<template>
  <!-- Quatre contrôles au lieu de dix : trois menus rangés par intention, et la suppression
       à part. Les réglages qui changent des droits passent par la vue, qui demande d'abord
       confirmation. -->
  <BulkActionBar :count="selectedIds.length" singular="utilisateur sélectionné" plural="utilisateurs sélectionnés" @clear="clear">
    <UiMenu align="start">
      <template #trigger><UiButton size="sm"><template #icon><Power/></template>Statut<template #trailing><ChevronDown/></template></UiButton></template>
      <UiMenuItem @select="$emit('bulk-status',true)"><Power/> Activer les comptes</UiMenuItem>
      <UiMenuItem @select="$emit('bulk-status',false)"><PowerOff/> Désactiver les comptes</UiMenuItem>
    </UiMenu>
    <UiMenu align="start">
      <template #trigger><UiButton size="sm"><template #icon><Bell/></template>Notifications<template #trailing><ChevronDown/></template></UiButton></template>
      <template v-for="(field, index) in bulkNotifyFields" :key="field.value">
        <UiMenuSeparator v-if="index" />
        <UiMenuItem @select="$emit('bulk-notify',field.value,true)"><Bell/> {{ field.label }} : activer</UiMenuItem>
        <UiMenuItem @select="$emit('bulk-notify',field.value,false)"><BellOff/> {{ field.label }} : désactiver</UiMenuItem>
      </template>
    </UiMenu>
    <UiMenu align="start">
      <template #trigger><UiButton size="sm"><template #icon><Shield/></template>Rôle &amp; connexion<template #trailing><ChevronDown/></template></UiButton></template>
      <UiMenuItem v-for="role in bulkRoles" :key="role.value" @select="$emit('bulk-permissions',{role:role.value})"><Shield/> Rôle : {{ role.label }}</UiMenuItem>
      <UiMenuSeparator />
      <UiMenuItem @select="$emit('bulk-permissions',{can_login:true})"><LogIn/> Autoriser la connexion</UiMenuItem>
      <UiMenuItem @select="$emit('bulk-permissions',{can_login:false})"><LogOut/> Bloquer la connexion</UiMenuItem>
    </UiMenu>
    <UiButton variant="danger" size="sm" @click="$emit('bulk-delete')"><template #icon><Trash2/></template>Supprimer…</UiButton>
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
        <UiAvatar :src="user.avatar_url" :initials="accountInitials(user)" :off="!user.enabled" />
        <span class="user-identity-text">
          <strong>{{ accountName(user) }}</strong>
          <small v-if="accountHandle(user)">{{ accountHandle(user) }}</small>
          <small v-if="!user.enabled" class="user-off">Compte désactivé</small>
          <span v-if="situations(user).length" class="user-situations">
            <span v-for="item in situations(user)" :key="item.key" class="user-situation" :class="`is-${item.tone}`">{{ item.label }}</span>
          </span>
        </span>
      </button>
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
    <template #cell-requests="{ row: user }"><strong>{{ user.stats?.total??user.request_count??0 }}</strong></template>
    <template #cell-last="{ row: user }">{{ formatDate(user.last_requested_at) }}<small v-if="!user.can_login" class="blocked-copy">Connexion bloquée</small></template>
    <template #cell-actions="{ row: user }">
      <UiButton icon-only :title="`Modifier ${accountName(user)}`" :aria-label="`Modifier ${accountName(user)}`" @click="$emit('open',user.id)"><Pencil/></UiButton>
      <UiButton icon-only :title="user.enabled?`Désactiver ${accountName(user)}`:`Activer ${accountName(user)}`" :aria-label="user.enabled?`Désactiver ${accountName(user)}`:`Activer ${accountName(user)}`" @click="$emit('toggle',user)"><Power/></UiButton>
    </template>
  </UiDataTable>
</template>

<script setup lang="ts">
import { formatDateShort } from '@/utils/format';
import { ref, watch } from 'vue';
import { Bell, BellOff, ChevronDown, LogIn, LogOut, Pencil, Power, PowerOff, Shield, Trash2 } from '@lucide/vue';
import UiMenu from '@/components/ui/UiMenu.vue';
import UiMenuItem from '@/components/ui/UiMenuItem.vue';
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue';
import { userSituations as situations } from './userSituations';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
import UiAvatar from '@/components/ui/UiAvatar.vue';
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

/* Toute la liste est chargee : le tableau trie lui-meme, d'un clic sur l'en-tete. Le
   rang du role suit la hierarchie (administrateur, moderateur, utilisateur) plutot que
   l'alphabet. */
const ROLE_RANK: Record<string, number> = { admin: 0, moderator: 1, user: 2 };
const columns: UiColumn<AppUser>[] = [
  { key: 'person', label: 'Personne', card: 'title', className: 'user-identity-cell', sortable: true, sortValue: (user) => accountName(user).toLocaleLowerCase('fr') },
  { key: 'source', label: 'Origine du compte', sortable: true, sortValue: (user) => sourceLabel(resolveSource(user)) },
  { key: 'role', label: 'Rôle', sortable: true, sortValue: (user) => ROLE_RANK[String(user.role)] ?? 3 },
  { key: 'requests', label: 'Demandes', sortable: true, sortValue: (user) => Number(user.stats?.total ?? user.request_count ?? 0) },
  { key: 'last', label: 'Dernière activité', sortable: true, sortValue: (user) => String(user.last_requested_at || '') },
  { key: 'actions', label: 'Actions', card: 'actions' },
];
const selectedIds = ref<Array<string | number>>([]);
function clear(): void { selectedIds.value = []; }
// Une ligne disparue (suppression, filtre) ne reste pas selectionnee en silence.
watch(() => props.rows, (rows) => {
  const presents = new Set(rows.map((user) => user.id));
  if (selectedIds.value.some((id) => !presents.has(id))) selectedIds.value = selectedIds.value.filter((id) => presents.has(id));
});
const bulkRoles = [
  { value: 'user', label: 'Utilisateur' },
  { value: 'moderator', label: 'Modérateur' },
  { value: 'admin', label: 'Administrateur' },
];
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

const formatDate = (value?: string) => formatDateShort(value, 'Aucune');
// UsersView lit la selection pour ses actions groupees et la vide apres coup.
defineExpose({ selectedIds, clearSelection: clear });
</script>
<style scoped lang="scss">
.card-title small,td>small{display:block;color:var(--muted);font-size:var(--fs-xs)}.blocked-copy{color: var(--red-text)}

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

.user-identity-text {
  display: flex;
  min-width: 0;
  flex-direction: column;

  strong, small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}

.user-off { color: var(--accent); }
.user-situations { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: 2px; }
.user-situation { padding: 0 8px; border-radius: var(--radius-pill); background: var(--surface-2); color: var(--muted); font-size: var(--fs-xs); font-weight: 600; white-space: nowrap; }
.user-situation.is-warn { background: color-mix(in srgb, var(--amber) 14%, transparent); color: var(--amber-text); }
.user-situation.is-error { background: color-mix(in srgb, var(--red) 14%, transparent); color: var(--red-text); }
.user-seer-link { display: block; color: var(--muted); font-size: var(--fs-xs); }
</style>
