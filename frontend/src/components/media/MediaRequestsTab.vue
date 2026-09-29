<template>
  <section class="drawer-section request-tab">
    <!-- Plusieurs demandes (rare) : l'ajout vaut pour toutes, il reste donc au-dessus. -->
    <div v-if="admin && rows.length > 1" class="request-block">
      <h4 class="request-block-title">Ajouter un demandeur à toutes les demandes</h4>
      <AddRequesterForm :users="addableUsers" :model-value="newRequesterId" :busy="busy" @update:model-value="$emit('update:newRequesterId', $event)" @add="$emit('add-requester')" />
    </div>

    <article v-for="row in rows" :key="row.id" class="request-card">
      <header class="request-card-head">
        <div class="request-card-title">
          <strong>{{ row.origin_label || 'Demande utilisateur' }}</strong>
          <small v-if="row.operational_status_label">{{ row.operational_status_label }}</small>
        </div>
        <span class="badge status-tag" :class="row.status">{{ requestStatusLabel(row.status) }}</span>
      </header>
      <p v-if="row.waiting_reason" class="waiting-reason">{{ row.waiting_reason }}</p>

      <div v-if="!['failed', 'rejected'].includes(row.status)" class="request-block">
        <h4 class="request-block-title">Progression</h4>
        <RequestStatusStepper :row="row" />
      </div>

      <div class="request-block">
        <h4 class="request-block-title">
          Demandeurs
          <span v-if="(row.requester_ids || []).length" class="request-block-count">{{ row.requester_ids.length }}</span>
        </h4>
        <RequesterList
          :row="row"
          :admin="admin"
          :busy="busy"
          @notify-user="(...args) => $emit('notify-user', ...args)"
          @promote-requester="(...args) => $emit('promote-requester', ...args)"
          @remove-requester="(...args) => $emit('remove-requester', ...args)"
        />
        <AddRequesterForm
          v-if="admin && rows.length === 1"
          :users="addableUsers"
          :model-value="newRequesterId"
          :busy="busy"
          @update:model-value="$emit('update:newRequesterId', $event)"
          @add="$emit('add-requester')"
        />
      </div>

      <CollapsibleRoot v-if="row.media_type === 'show' && row.seasons?.length" class="request-collapsible" :unmount-on-hide="false">
        <CollapsibleTrigger class="collapsible-trigger"><ChevronRight class="chevron" aria-hidden="true" />Détail par saison <small>({{ seasonsSummary(row.seasons) }})</small></CollapsibleTrigger><CollapsibleContent class="collapsible-content">
          <div v-for="season in row.seasons" :key="season.season_number" class="season-line">
            <span>Saison {{ season.season_number }}</span>
            <span class="badge" :class="season.status">{{ season.episodes_available_count }}/{{ season.episodes_total_count }}</span>
          </div>
        </CollapsibleContent>
      </CollapsibleRoot>

      <RequestMailHistory :row="row" />

      <CollapsibleRoot v-if="admin" class="request-collapsible request-admin-actions" :unmount-on-hide="false">
        <CollapsibleTrigger class="collapsible-trigger"><ChevronRight class="chevron" aria-hidden="true" />Administration</CollapsibleTrigger><CollapsibleContent class="collapsible-content">
        <div class="actions">
          <UiButton icon-only v-if="row.status === 'pending_approval'" class="success" title="Approuver" aria-label="Approuver" :disabled="busy" @click="$emit('approve', row.id)"><Check /></UiButton>
          <UiButton variant="danger" icon-only v-if="row.status === 'pending_approval'" title="Refuser" aria-label="Refuser" :disabled="busy" @click="$emit('reject', row)"><Ban /></UiButton>
          <UiButton icon-only v-if="row.arr_id" title="Rechercher une release" aria-label="Rechercher une release" @click="$emit('open-release', row.id)"><Search /></UiButton>
          <UiButton icon-only v-if="row.status === 'failed'" title="Relancer" aria-label="Relancer" @click="$emit('retry', row.id)"><RotateCcw /></UiButton>
          <UiButton icon-only v-if="hasUnnotified(row)" title="Rattraper tout le monde (notifier les demandeurs pas encore prevenus)" aria-label="Rattraper tout le monde (notifier les demandeurs pas encore prevenus)" :disabled="busy" @click="$emit('catch-up-all', row)"><Users /></UiButton>
          <UiButton icon-only :title="(row.requester_ids || []).length > 1 ? 'Renvoyer le mail de demande a tous' : 'Renvoyer email de demande'" :aria-label="(row.requester_ids || []).length > 1 ? 'Renvoyer le mail de demande a tous' : 'Renvoyer email de demande'" :disabled="busy" @click="$emit('resend-mail', row.id, 'request')"><Mail /></UiButton>
          <UiButton icon-only v-if="row.status === 'available'" :title="(row.requester_ids || []).length > 1 ? 'Renvoyer le mail de disponibilite a tous' : 'Renvoyer email de disponibilite'" :aria-label="(row.requester_ids || []).length > 1 ? 'Renvoyer le mail de disponibilite a tous' : 'Renvoyer email de disponibilite'" :disabled="busy" @click="$emit('resend-mail', row.id, 'available')"><MailCheck /></UiButton>
          <UiButton icon-only v-if="canClose(row)" title="Cloturer la demande" aria-label="Cloturer la demande" :disabled="busy" @click="$emit('close-request', row)"><CheckCheck /></UiButton>
          <UiButton variant="danger" icon-only title="Annuler la demande (supprime aussi de Sonarr/Radarr)" aria-label="Annuler la demande" :disabled="busy" @click="$emit('withdraw-request', row)"><XCircle /></UiButton>
          <UiButton variant="danger" icon-only title="Supprimer" aria-label="Supprimer" @click="$emit('delete-request', row.id)"><Trash2 /></UiButton>
        </div>
        <!-- Un media dont les releases se rattachent mal peut rester en manuel sans
             qu'on desactive le reglage pour tous les autres, et inversement. -->
        <label class="auto-import-choice">
          <span>Rapprochement des imports bloques</span>
          <UiSelect :model-value="autoImportValue(row)" :disabled="busy" @update:model-value="onAutoImportChange(row, $event)" :options="[{ value: 'inherit', label: 'Suivre le reglage global' }, { value: 'on', label: 'Automatique pour ce media' }, { value: 'off', label: 'Toujours manuel pour ce media' }]" />
        </label>
      </CollapsibleContent></CollapsibleRoot>
    </article>

    <article v-if="!rows.length && detail?.in_library" class="request-card plex-origin-card">
      <header class="request-card-head">
        <div class="request-card-title">
          <strong>Disponible directement dans Plex</strong>
          <small>Ce media ne possede aucune demande utilisateur liee. Son point d'entree operationnel est Plex.</small>
        </div>
      </header>
      <div class="status-stepper">
        <span class="step done">Detecte dans Plex</span>
        <span class="step current">Disponible</span>
      </div>
    </article>
    <UiEmptyState v-else-if="!rows.length" title="Aucune demande liée" compact />

    <!-- Sans demande, ajouter un demandeur en crée une (déjà disponible) côté serveur. -->
    <div v-if="admin && !rows.length" class="request-block">
      <h4 class="request-block-title">Demandeurs</h4>
      <AddRequesterForm :users="addableUsers" :model-value="newRequesterId" :busy="busy" @update:model-value="$emit('update:newRequesterId', $event)" @add="$emit('add-requester')" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui';
import UiSelect from '@/components/ui/UiSelect.vue';
import { requestStatusLabel } from '@/utils/labels';
import { Ban, Check, CheckCheck, ChevronRight, Mail, MailCheck, RotateCcw, Search, Trash2, Users, XCircle } from '@lucide/vue';
import AddRequesterForm from './AddRequesterForm.vue';
import RequestMailHistory from './RequestMailHistory.vue';
import RequestStatusStepper from './RequestStatusStepper.vue';
import RequesterList from './RequesterList.vue';
import { canClose, hasUnnotified, seasonsSummary } from './requestRules';

/* Trois etats, pas deux : « suivre le reglage global » n'est pas « desactive ». */
const autoImportValue = (row: any): string =>
  row.auto_import_reconciliation === null || row.auto_import_reconciliation === undefined
    ? 'inherit'
    : row.auto_import_reconciliation
      ? 'on'
      : 'off';
const autoImportFromChoice = (value: string): boolean | null => (value === 'inherit' ? null : value === 'on');
function onAutoImportChange(row: any, choice: string): void {
  emit('set-auto-import', row, autoImportFromChoice(choice));
}
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';

const props = withDefaults(
  defineProps<{
    requests?: any[] | null;
    detail?: any;
    admin?: boolean;
    busy?: boolean;
    addableUsers?: any[];
    newRequesterId?: string;
  }>(),
  {
    requests: () => [],
    detail: () => ({}),
    admin: false,
    busy: false,
    addableUsers: () => [],
    newRequesterId: '',
  }
);

const rows = computed(() => props.requests || []);

const emit = defineEmits<{
  (e: 'update:newRequesterId', value: string): void;
  (e: 'add-requester'): void;
  (e: 'open-release', rowId: any): void;
  (e: 'retry', rowId: any): void;
  (e: 'catch-up-all', row: any): void;
  (e: 'resend-mail', rowId: any, type: string): void;
  (e: 'close-request', row: any): void;
  (e: 'delete-request', rowId: any): void;
  (e: 'withdraw-request', row: any): void;
  (e: 'set-auto-import', row: any, value: boolean | null): void;
  (e: 'notify-user', rowId: any, uid: any, types: string[]): void;
  (e: 'promote-requester', row: any, uid: any): void;
  (e: 'remove-requester', row: any, uid: any): void;
  (e: 'approve', rowId: any): void;
  (e: 'reject', row: any): void;
}>();
</script>

<style scoped lang="scss">
.request-tab {
  display: grid;
  gap: var(--space-3);
}

/* Une demande = une carte lue de haut en bas : état, progression, demandeurs,
   puis les volets repliables (saisons, historique, administration). */
.request-card {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.request-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}
.request-card-title {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.request-card-title strong {
  color: var(--text);
}
.request-card-title small {
  color: var(--muted);
  font-size: var(--fs-sm);
}
.request-block {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}
.request-block-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.request-block-count {
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--text);
  letter-spacing: 0;
}
.waiting-reason {
  margin: 0;
  color: var(--muted);
  font-size: var(--fs-sm);
}
.season-line {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}
.auto-import-choice { display: grid; gap: 4px; margin-top: var(--space-3); }
.auto-import-choice > span { color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.request-admin-actions .actions {
  margin-top: 8px;
}

:deep(.request-collapsible),
:deep(.mail-history-details) {
  padding-top: var(--space-2);
  border-top: 1px solid var(--border);
}
:deep(.request-collapsible .collapsible-trigger),
:deep(.mail-history-details .collapsible-trigger) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: var(--muted);
  font-size: var(--fs-sm);
  font-weight: 600;
  user-select: none;
}
:deep(.collapsible-trigger .chevron) {
  width: 14px;
  height: 14px;
  transition: transform var(--motion-duration-instant) var(--motion-ease-standard);
}
:deep(.collapsible-trigger[data-state='open'] .chevron) {
  transform: rotate(90deg);
}
:deep(.mail-history-details .collapsible-content) {
  display: grid;
  gap: 2px;
  margin-top: 6px;
}
:deep(.mail-history-details small) {
  display: block;
  color: var(--muted);
}

:deep(.status-stepper) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
}
:deep(.status-stepper .step) {
  font-size: var(--fs-xs);
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  color: var(--muted);
  background: var(--surface-2);
}
:deep(.status-stepper .step.done) {
  border-color: color-mix(in srgb, var(--green) 45%, transparent);
  color: var(--green-text);
}
:deep(.status-stepper .step.current) {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
:deep(.badge.tiny) {
  min-height: auto;
  padding: 0 6px;
  font-size: var(--fs-xs);
}
</style>
