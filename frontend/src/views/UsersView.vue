<template>
  <!-- Utilisateurs (gabarit Gérer) : qui a accès, et que faut-il régler ? Les situations à
       traiter filtrent la liste, le tableau de contrôle porte les actions. La recherche est
       celle de la barre du haut ; la synchronisation est un outil de page, l'ajout l'action
       du contexte. -->
  <PageTemplate
    title="Utilisateurs"
    v-model:query="query"
    :search="{ placeholder: 'Filtrer par nom, identifiant ou email', scope: 'Utilisateurs', kind: 'filter' }"
    :match-count="filtered.length"
    :total-count="users.length"
    :filter-count="filterCount"
    :state="error ? 'error' : pending ? 'loading' : 'ready'" skeleton="table"
    :error="error"
    @retry="reload"
    @reset-filters="reset"
  >
    <template #filters>
      <FilterGroup label="Statut">
        <UiChipGroup label="Statut" :options="STATUSES" v-model="status" />
      </FilterGroup>
      <FilterGroup label="Rôle">
        <UiChipGroup label="Rôle" :options="ROLES" v-model="role" />
      </FilterGroup>
      <FilterGroup label="Origine">
        <UiChipGroup label="Origine" :options="[{ value: '', label: 'Toutes les origines' }, ...sourceOptions]" v-model="source" />
      </FilterGroup>
    </template>

    <!-- Seer n'apparaît que s'il est réellement actif : « Synchroniser Seer » n'a pas de sens
         Seer désactivé, et « synchroniser » est faux en mode observateur (Seer est lu sans
         être piloté, comme dans les Réglages). -->
    <template #tools>
      <UiMenu align="end">
        <template #trigger><UiButton size="sm" :loading="busy"><template #icon><RefreshCw /></template>Synchroniser<template #trailing><ChevronDown /></template></UiButton></template>
        <UiMenuItem @select="run('sync-plex', [])"><RefreshCw /> Synchroniser Plex</UiMenuItem>
        <UiMenuItem v-if="seerEnabled" :title="seerHint" @select="run('sync-seer', [])"><RefreshCw /> {{ seerLabel }}</UiMenuItem>
      </UiMenu>
    </template>
    <template #quick-action>
      <UiButton @click="openCreate"><template #icon><UserPlus /></template>Ajouter</UiButton>
    </template>

    <ManageTemplate
      v-model:situation="attention"
      label="Tableau des utilisateurs"
      :rows="filtered"
      :total="users.length"
      :columns="USER_COLUMNS"
      :row-key="(user: AppUser) => user.id"
      :row-label="accountName"
      :row-class="(user: AppUser) => (user.enabled ? undefined : 'is-muted')"
      :loading="loading"
      :labels="{ singular: 'utilisateur sélectionné', plural: 'utilisateurs sélectionnés', empty: 'Aucun utilisateur' }"
      :situations="situations"
      :bulk-actions="USER_BULK_ACTIONS"
      :row-actions="userRowActions"
      openable
      @open="openUser"
      @action="onAction"
    >
      <!-- Un visage, un nom, puis le pseudo sous lequel la personne se reconnaît. -->
      <template #cell-person="{ row: user }">
        <div class="user-identity">
          <UiAvatar :person="user" />
          <span class="user-identity__text">
            <strong>{{ accountName(user) }}</strong>
            <small v-if="accountHandle(user)">{{ accountHandle(user) }}</small>
            <small v-if="!user.enabled">Compte désactivé</small>
            <span v-if="userSituations(user).length" class="user-identity__situations">
              <UiBadge v-for="item in userSituations(user)" :key="item.key" pill :tone="item.tone === 'error' ? 'danger' : 'warning'">{{ item.label }}</UiBadge>
            </span>
          </span>
        </div>
      </template>
      <!-- Libellés lisibles, et plus d'invention : l'origine absente était rendue « plex », ce
           qui présentait une supposition comme une donnée. -->
      <template #cell-source="{ row: user }">
        {{ sourceLabel(resolveSource(user)) }}
        <small v-if="user.seer_user_id" class="user-note">{{ seerLinkLabel(user) }}</small>
      </template>
      <template #cell-role="{ row: user }"><UiBadge :tone="ROLE_TONES[String(user.role)] || 'neutral'">{{ roleLabel(user.role) }}</UiBadge></template>
      <template #cell-requests="{ row: user }"><strong>{{ requestCount(user) }}</strong></template>
      <template #cell-last="{ row: user }">
        {{ formatDateShort(user.last_requested_at, 'Aucune') }}
        <small v-if="!user.can_login" class="user-note is-blocked">Connexion bloquée</small>
      </template>
    </ManageTemplate>
  </PageTemplate>
  <CreateTemplate :open="creating" :definition="userCreation" @close="creating = false" @created="reload" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChevronDown, RefreshCw, UserPlus } from '@lucide/vue';
import { useUserAccounts } from '@/composables/useUserAccounts';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import { formatDateShort } from '@/utils/format';
import { accountHandle, accountName, resolveSource, roleLabel, seerLinkLabel, sourceLabel } from '@/utils/userLabels';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import ManageTemplate from '@/components/templates/ManageTemplate.vue';
import CreateTemplate from '@/components/templates/CreateTemplate.vue';
import { userCreation } from '@/creations/user';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import UiAvatar from '@/components/ui/UiAvatar.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import UiMenu from '@/components/ui/UiMenu.vue';
import UiMenuItem from '@/components/ui/UiMenuItem.vue';
import { USER_BULK_ACTIONS, USER_COLUMNS, requestCount, userRowActions, type AppUser } from '@/components/users/userDefinitions';
import { userSituations } from '@/components/users/userSituations';

const route = useRoute();
const router = useRouter();
const {
  users, filtered, pending, loading, error, reload,
  query, status, role, attention, source, sourceOptions, situations, filterCount, reset,
  busy, run, seerEnabled, seerLabel, seerHint,
} = useUserAccounts();

const STATUSES = [{ value: '', label: 'Tous les statuts' }, { value: 'enabled', label: 'Actifs' }, { value: 'disabled', label: 'Désactivés' }];
const ROLES = [{ value: '', label: 'Tous les rôles' }, { value: 'admin', label: 'Administrateurs' }, { value: 'moderator', label: 'Modérateurs' }, { value: 'user', label: 'Utilisateurs' }];
const ROLE_TONES: Record<string, string> = { admin: 'success', moderator: 'info' };

/* La fiche d'un compte s'ouvre dans la feuille, avec sa propre adresse (voir UserDetailView) :
   la liste reste derrière, et retour y ramène. */
const openUser = (user: AppUser) => ouvrirFiche(router, `/users/${user.id}`, route.fullPath);
const creating = ref(false);
const openCreate = () => { creating.value = true; };
function onAction(key: string, targets: AppUser[]): void {
  if (key === 'open') openUser(targets[0]);
  else void run(key, targets);
}
</script>

<style scoped lang="scss">
.user-identity { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.user-identity__text { display: flex; min-width: 0; flex-direction: column; }
.user-identity__text strong, .user-identity__text small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.user-identity__text small, .user-note { display: block; color: var(--muted); font-size: var(--fs-xs); }
.user-identity__situations { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: 2px; }
.user-note.is-blocked { color: var(--red-text); }
</style>
