<template>
  <!-- Notifications : deux besoins, deux gabarits. La file d'attente (gabarit Gérer) : que
       faut-il envoyer, marquer ou supprimer ? Le journal (gabarit Comprendre) : que s'est-il
       passé, et à quoi ressemblait l'email ? Les sections viennent de la zone Notifications
       de l'Administration ; l'état de l'envoi automatique et sa suspension sont dans la
       capsule (barre de commande). La recherche et les filtres ne servent qu'au journal. -->
  <PageTemplate
    title="Notifications"
    :sections="sections"
    :active-section="tab"
    v-model:query="history.search.value"
    :search="isHistory ? { placeholder: 'Filtrer par média, destinataire ou événement', scope: 'Notifications', kind: 'filter' } : null"
    :filter-count="isHistory ? history.filterCount.value : 0"
    :state="error ? 'error' : 'ready'"
    :error="error"
    @retry="invalidate"
    @reset-filters="history.reset"
  >
    <template v-if="isHistory" #filters>
      <FilterGroup label="Type">
        <UiChipGroup label="Type" multiple :options="NOTIFICATION_TYPES" v-model="history.types.value" />
      </FilterGroup>
      <FilterGroup label="Utilisateur">
        <UiCombobox label="Utilisateur" multiple placeholder="Tous les utilisateurs" :options="history.userOptions.value" v-model="history.selectedUsers.value" />
      </FilterGroup>
    </template>

    <template #tools><NotificationsCommandBar part="state" /></template>
    <template #quick-action><NotificationsCommandBar part="hold" /></template>

    <UnderstandTemplate
      v-if="isHistory"
      v-model:outcome="outcome"
      :outcomes="HISTORY_OUTCOMES"
      :events="history.events.value"
      :detail="history.detail.value"
      :open-key="history.openKey.value"
      :loading="history.pending.value"
      :has-more="history.hasMore.value"
      :loading-more="history.loadingMore.value"
      :exportable="false"
      empty-title="Aucun envoi"
      empty-message="Aucune notification ne correspond à ces filtres."
      @open="history.openKey.value = $event.key"
      @close="history.openKey.value = ''"
      @action="history.resend"
      @load-more="history.loadMore"
    >
      <!-- Les envois sans confirmation restent bloqués : ce suivi sert à les vérifier. -->
      <template #after>
        <UiDisclosure title="Suivi des envois" description="Les envois sans confirmation restent bloqués pour vérification. Un Message-ID SMTP ne garantit pas à lui seul l'absence de doublon." @open="deliveries.open()">
          <UiDataTable label="Suivi des envois" :rows="deliveries.rows.value" :columns="DELIVERY_COLUMNS" :row-key="(delivery: any) => delivery.send_key">
            <template #empty>Aucun envoi enregistré dans le nouveau suivi.</template>
            <template #cell-request="{ row: delivery }">#{{ delivery.req_id }}</template>
            <template #cell-state="{ row: delivery }">{{ DELIVERY_STATE_LABELS[delivery.state] || delivery.state }}<small>{{ delivery.detail }}</small></template>
            <template #cell-send_key="{ row: delivery }"><code>{{ delivery.send_key }}</code></template>
          </UiDataTable>
        </UiDisclosure>
      </template>
    </UnderstandTemplate>

    <ManageTemplate
      v-else
      label="Tableau des notifications en attente"
      :rows="queue.rows.value"
      :columns="PENDING_COLUMNS"
      :row-key="(row: NotificationRow) => row.id"
      :row-label="notificationName"
      :loading="queue.loading.value"
      :labels="{ singular: 'notification sélectionnée', plural: 'notifications sélectionnées', empty: 'Aucune notification en attente' }"
      :bulk-actions="PENDING_BULK_ACTIONS"
      :global-actions="queue.rows.value.length ? PENDING_GLOBAL_ACTIONS : []"
      :row-actions="pendingRowActions"
      :has-more="queue.hasMore.value"
      :loading-more="queue.loadingMore.value"
      @action="queue.run"
      @load-more="queue.loadMore"
    >
      <template #cell-date="{ row }">{{ formatDateTimeShort(row.created_at) }}</template>
      <template #cell-event="{ row }">
        <strong>{{ notificationName(row) }}</strong>
        <small class="notification-note">{{ notificationContext(row) }}</small>
      </template>
      <template #cell-media="{ row }">{{ row.media_title || '-' }}</template>
      <template #cell-recipients="{ row }">{{ notificationRecipients(row) || '-' }}</template>
      <template #cell-state="{ row }">
        <UiBadge :tone="notificationFailed(row) ? 'danger' : 'neutral'">{{ row.success === false ? 'Erreur' : row.valid === false ? 'Invalide' : 'En attente' }}</UiBadge>
        <small v-if="row.error_msg" class="notification-note is-error">{{ row.error_msg }}</small>
      </template>
    </ManageTemplate>
  </PageTemplate>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { sectionsFor } from '@/navigation';
import { useInvalidateNotifications, useNotificationDeliveries, useNotificationHistory, useNotificationQueue } from '@/composables/useNotifications';
import { useNotificationHold } from '@/composables/useNotificationHold';
import { formatDateTimeShort } from '@/utils/format';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import ManageTemplate from '@/components/templates/ManageTemplate.vue';
import UnderstandTemplate from '@/components/templates/UnderstandTemplate.vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import UiCombobox from '@/components/ui/UiCombobox.vue';
import UiDataTable from '@/components/ui/UiDataTable.vue';
import UiDisclosure from '@/components/ui/UiDisclosure.vue';
import { useErrorToast } from '@/composables/useErrorToast';
import NotificationsCommandBar from '@/components/notifications/NotificationsCommandBar.vue';
import {
  DELIVERY_COLUMNS, DELIVERY_STATE_LABELS, HISTORY_OUTCOMES, NOTIFICATION_TYPES, PENDING_BULK_ACTIONS, PENDING_COLUMNS, PENDING_GLOBAL_ACTIONS,
  notificationContext, notificationFailed, notificationName, notificationRecipients, pendingRowActions, type NotificationRow,
} from '@/components/notifications/notificationDefinitions';

const route = useRoute();
/* La section vient de l'adresse : les onglets de la zone changent `?tab=`. */
const tab = computed(() => (route.query.tab === 'pending' ? 'pending' : 'history'));
const isHistory = computed(() => tab.value === 'history');

const invalidate = useInvalidateNotifications();
const queue = useNotificationQueue(invalidate, computed(() => !isHistory.value));
const history = useNotificationHistory(invalidate, isHistory);
const deliveries = useNotificationDeliveries();
useErrorToast(() => deliveries.error.value, { title: 'Suivi des envois indisponible' });
const { pendingCount } = useNotificationHold();

/* L'état filtre le journal au-dessus de la liste ; « Tout » est la valeur vide du filtre. */
const outcome = computed({
  get: () => history.state.value || 'all',
  set: (value: string) => { history.state.value = value === 'all' ? '' : value; },
});
const error = computed(() => (isHistory.value ? history.error.value : queue.error.value));

/* Les sections sont celles de la zone Notifications de l'Administration : une seule liste,
   pour la page comme pour le menu. Cette page n'est ouverte qu'aux administrateurs. Le
   compteur d'attente ne décrit que la file. */
const sections = computed(() =>
  sectionsFor('admin-notifications', { isAdmin: true, canModerate: true, arrInstances: [], downloadClients: [] }).map((section) => ({
    key: section.key,
    label: section.label,
    to: section.to,
    icon: section.icon,
    group: section.group,
    count: section.key === 'pending' && pendingCount.value ? pendingCount.value : null,
  })),
);
</script>

<style scoped lang="scss">
.notification-note { display: block; color: var(--muted); font-size: var(--fs-xs); }
.notification-note.is-error { color: var(--red-text); }
</style>
