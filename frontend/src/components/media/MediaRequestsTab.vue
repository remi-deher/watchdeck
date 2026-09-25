<template>
  <section class="drawer-section">
    <div v-if="admin" class="add-requester-row">
      <span class="add-requester-label">Co-demandeur</span>
      <div class="inline-row compact">
        <UiSelect :model-value="newRequesterId" :disabled="!addableUsers.length" @update:model-value="$emit('update:newRequesterId', $event)" :options="[{ value: '', label: String(addableUsers.length ? 'Sélectionnez un utilisateur' : 'Tous les utilisateurs sont déjà demandeurs') }, ...(addableUsers).map((u) => ({ value: u.plex_user_id, label: String(u.custom_name || u.display_name || u.plex_user_id) }))]" />
        <UiButton variant="primary" size="sm" :disabled="busy || !newRequesterId" @click="$emit('add-requester')"><template #icon><PlusCircle/></template>Ajouter</UiButton>
      </div>
    </div>
    <article v-for="row in requests || []" :key="row.id" class="detail-row request-detail-row">
      <div>
        <div class="request-detail-top">
          <strong v-if="requesterName(row)">{{ requesterName(row) }}</strong>
          <span class="badge status-tag" :class="row.status">{{ requestStatusLabel(row.status) }}</span>
        </div>

        <div class="origin-line">
          <span class="badge tiny">{{ row.origin_label || 'Demande utilisateur' }}</span>
          <small>{{ row.operational_status_label }}</small>
        </div>
        <p v-if="row.waiting_reason" class="waiting-reason">{{ row.waiting_reason }}</p>

        <RequestStatusStepper v-if="!['failed','rejected'].includes(row.status)" :row="row" />

        <CollapsibleRoot v-if="row.media_type === 'show' && row.seasons?.length" class="mail-history-details" :unmount-on-hide="false">
          <CollapsibleTrigger class="collapsible-trigger">Detail par saison ({{ seasonsSummary(row.seasons) }})</CollapsibleTrigger><CollapsibleContent class="collapsible-content">
          <div v-for="season in row.seasons" :key="season.season_number" class="inline-row compact" style="justify-content: space-between; margin-bottom: 4px;">
            <span>Saison {{ season.season_number }}</span>
            <span class="badge" :class="season.status">{{ season.episodes_available_count }}/{{ season.episodes_total_count }}</span>
          </div>
        </CollapsibleContent></CollapsibleRoot>

        <RequestMailHistory :row="row" />
        <RequesterList
          :row="row"
          :admin="admin"
          :busy="busy"
          @notify-user="(...args) => $emit('notify-user', ...args)"
          @promote-requester="(...args) => $emit('promote-requester', ...args)"
          @remove-requester="(...args) => $emit('remove-requester', ...args)"
        />
      </div>
      <CollapsibleRoot v-if="admin" class="request-admin-actions" :unmount-on-hide="false">
        <CollapsibleTrigger class="collapsible-trigger">Administration</CollapsibleTrigger><CollapsibleContent class="collapsible-content">
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
    <article v-if="!requests?.length && detail?.in_library" class="detail-row plex-origin-card">
      <div>
        <strong>Disponible directement dans Plex</strong>
        <p>Ce media ne possede aucune demande utilisateur liee. Son point d'entree operationnel est Plex.</p>
        <div class="status-stepper">
          <span class="step done">Detecte dans Plex</span>
          <span class="step current">Disponible</span>
        </div>
      </div>
    </article>
    <UiEmptyState v-else-if="!requests?.length" title="Aucune demande liée" compact />
  </section>
</template>

<script setup lang="ts">
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui';
import UiSelect from '@/components/ui/UiSelect.vue';
import { requestStatusLabel } from '@/utils/labels';
import { requesterName } from '@/utils/userLabels';
import { Ban, Check, CheckCheck, Mail, MailCheck, PlusCircle, RotateCcw, Search, Trash2, Users, XCircle } from '@lucide/vue';
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

withDefaults(
  defineProps<{
    requests?: any[];
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
.add-requester-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.add-requester-label {
  font-size: var(--fs-sm);
  color: var(--muted);
  white-space: nowrap;
}
.add-requester-row .inline-row {
  flex: 1;
}
.add-requester-row select {
  flex: 1;
  min-width: 0;
}

.request-detail-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.auto-import-choice { display: grid; gap: 4px; margin-top: var(--space-3); }
.auto-import-choice > span { color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.request-admin-actions {
  align-self: start;
  min-width: 130px;
}
.request-admin-actions .collapsible-trigger {
  cursor: pointer;
  color: var(--muted);
  font-size: var(--fs-sm);
  font-weight: 600;
  text-align: right;
}
.request-admin-actions .actions {
  justify-content: flex-end;
  margin-top: 8px;
}
:deep(.request-detail-row .mail-history) {
  display: block;
  color: var(--muted);
}

:deep(.status-stepper) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
  margin: 6px 0;
}
.origin-line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: 6px;
  color: var(--muted);
}
.waiting-reason {
  margin: 6px 0;
  color: var(--muted);
  font-size: var(--fs-sm);
}
.plex-origin-card p {
  margin: 6px 0;
  color: var(--muted);
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

:deep(.mail-history-[data-state]) {
  margin-top: 4px;
}
:deep(.mail-history-[data-state] .collapsible-trigger) {
  cursor: pointer;
  font-size: var(--fs-xs);
  color: var(--muted);
  user-select: none;
}
:deep(.mail-history-[data-state] small) {
  display: block;
}

:deep(.requester-breakdown) {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
}

:deep(.requester-line) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--fs-sm);
}

:deep(.requester-name) {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

:deep(.badge.tiny) {
  min-height: auto;
  padding: 0 6px;
  font-size: var(--fs-xs);
}

:deep(.notif-dot) {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
:deep(.notif-dot.ok) {
  background: var(--green);
}
:deep(.notif-dot.pending) {
  background: var(--muted);
}

:deep(.requester-menu-wrap) {
  position: relative;
}
:deep(.requester-menu) {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 200px;
  padding: 6px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
}
:deep(.requester-menu button) {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 8px;
  border: 0;
  background: transparent;
  color: var(--text);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--fs-sm);
  text-align: left;
}
:deep(.requester-menu button:hover:not(:disabled)) {
  background: rgb(var(--ink) / 0.06);
}
:deep(.requester-menu button.danger) {
  color: var(--red-text);
}
</style>
