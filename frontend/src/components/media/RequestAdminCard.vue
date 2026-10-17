<template>
  <!-- Carte « Administration » d'une demande : mails, suivi, rapprochement des imports,
       puis les actions destructrices à part. -->
  <section class="admin-card request-admin-actions" :aria-labelledby="`admin-title-${row.id}`">
    <h3 :id="`admin-title-${row.id}`">Administration</h3>

    <div class="admin-groups">
      <div class="admin-group" role="group" :aria-labelledby="`admin-mails-${row.id}`">
        <span :id="`admin-mails-${row.id}`" class="admin-group-title">Mails à tous les demandeurs</span>
        <UiButton :disabled="busy" @click="emit('resend-mail', row.id, 'request')"><template #icon><Mail /></template>Renvoyer le mail de demande</UiButton>
        <UiButton v-if="row.status === 'available'" :disabled="busy" @click="emit('resend-mail', row.id, 'available')"><template #icon><MailCheck /></template>Renvoyer le mail de disponibilité</UiButton>
        <UiButton v-if="hasUnnotified(row)" :disabled="busy" @click="emit('catch-up-all', row)"><template #icon><Users /></template>Prévenir ceux qui ne l'ont pas reçu</UiButton>
      </div>

      <div v-if="hasFollowActions(row)" class="admin-group" role="group" :aria-labelledby="`admin-follow-${row.id}`">
        <span :id="`admin-follow-${row.id}`" class="admin-group-title">Suivi</span>
        <UiButton v-if="row.status === 'pending_approval'" :disabled="busy" @click="emit('approve', row.id)"><template #icon><Check /></template>Approuver la demande</UiButton>
        <UiButton v-if="row.status === 'pending_approval'" :disabled="busy" @click="emit('reject', row)"><template #icon><Ban /></template>Refuser la demande</UiButton>
        <UiButton v-if="row.arr_id" @click="emit('open-release', row.id)"><template #icon><Search /></template>Rechercher une release</UiButton>
        <UiButton v-if="row.status === 'failed'" @click="emit('retry', row.id)"><template #icon><RotateCcw /></template>Relancer</UiButton>
        <UiButton v-if="canClose(row)" :disabled="busy" @click="emit('close-request', row)"><template #icon><CheckCheck /></template>Clôturer la demande</UiButton>
      </div>

      <!-- Un média dont les releases se rattachent mal peut rester en manuel sans
           qu'on désactive le réglage pour tous les autres, et inversement. -->
      <div class="admin-group auto-import-choice">
        <label :for="`auto-import-${row.id}`" class="admin-group-title">Rapprochement des imports bloqués</label>
        <UiSelect
          :id="`auto-import-${row.id}`"
          :model-value="autoImportValue(row)"
          :disabled="busy"
          :options="AUTO_IMPORT_OPTIONS"
          @update:model-value="emit('set-auto-import', row, autoImportFromChoice(String($event)))"
        />
      </div>
    </div>

    <div class="admin-danger">
      <UiButton variant="danger" title="Annuler la demande (supprime aussi de Sonarr/Radarr)" :disabled="busy" @click="emit('withdraw-request', row)"><template #icon><XCircle /></template>Annuler la demande</UiButton>
      <UiButton variant="danger" @click="emit('delete-request', row.id)"><template #icon><Trash2 /></template>Supprimer</UiButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Ban, Check, CheckCheck, Mail, MailCheck, RotateCcw, Search, Trash2, Users, XCircle } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import { canClose, hasUnnotified } from './requestRules';
import { AUTO_IMPORT_OPTIONS, autoImportFromChoice, autoImportValue, hasFollowActions } from './requestTabRules';

withDefaults(defineProps<{ row: any; busy?: boolean }>(), { busy: false });

const emit = defineEmits<{
  (e: 'resend-mail', rowId: any, type: string): void;
  (e: 'catch-up-all', row: any): void;
  (e: 'approve', rowId: any): void;
  (e: 'reject', row: any): void;
  (e: 'open-release', rowId: any): void;
  (e: 'retry', rowId: any): void;
  (e: 'close-request', row: any): void;
  (e: 'set-auto-import', row: any, value: boolean | null): void;
  (e: 'withdraw-request', row: any): void;
  (e: 'delete-request', rowId: any): void;
}>();
</script>

<style scoped lang="scss">
/* Les groupes d'actions en colonnes plutôt qu'empilés : la carte reste basse et le
   journal, souvent court, ne laisse plus de grand vide à côté d'elle. */
.admin-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 22px;
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
}
.admin-card h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-lg);
  font-weight: 600;
}
.admin-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  align-items: start;
  gap: 14px var(--space-5);
}
.admin-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.admin-group-title {
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.admin-group :deep(.ui-button),
.admin-danger :deep(.ui-button) {
  min-height: 40px;
  padding-block: var(--space-2);
  font-weight: 500;
  line-height: 1.3;
  white-space: normal;
}
.admin-group :deep(.ui-button) {
  justify-content: flex-start;
  width: 100%;
  text-align: left;
}
.admin-group :deep(.ui-button svg),
.admin-danger :deep(.ui-button svg) {
  flex: none;
}
.admin-danger {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}
.admin-danger :deep(.ui-button) {
  flex: 0 1 auto;
  padding-inline: 12px;
  background: transparent;
}

/* Téléphone (conteneur de l'onglet Demandes) : carte plus serrée, boutons à 44 px. */
@container demandes (max-width: 560px) {
  .admin-card {
    padding: 16px 18px;
  }
  .admin-danger :deep(.ui-button) {
    flex: 1 1 auto;
  }
  .admin-group :deep(.ui-button),
  .admin-danger :deep(.ui-button) {
    min-height: var(--touch-target);
  }
}
</style>
