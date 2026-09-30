<template>
  <section class="drawer-section requests-tab">
    <article v-for="(row, index) in requests || []" :key="row.id" class="request-block">
      <!-- 1. Parcours : état en une phrase, puis frise datée. -->
      <section class="journey-card" :aria-labelledby="`journey-title-${row.id}`">
        <div class="journey-head">
          <div class="journey-heading">
            <span class="journey-eyebrow">Parcours de la demande</span>
            <h2 :id="`journey-title-${row.id}`" class="journey-title">{{ journeyHeadline(row) }}</h2>
            <p v-if="journeySubtitle(row)" class="journey-subtitle">{{ journeySubtitle(row) }}</p>
          </div>
          <div class="journey-badges">
            <UiBadge pill :tone="statusTone(row.status)">{{ requestStatusLabel(row.status) }}</UiBadge>
            <span class="journey-origin">{{ originLabel(row) }}</span>
          </div>
        </div>
        <RequestStatusStepper :row="row" />
        <div v-if="row.media_type === 'show' && row.seasons?.length" class="journey-seasons">
          <span class="journey-seasons-title">Par saison · {{ seasonsSummary(row.seasons) }}</span>
          <ul class="journey-season-list">
            <li v-for="season in row.seasons" :key="season.season_number" :class="['journey-season', `is-${season.status}`]">
              <span>Saison {{ season.season_number }}</span>
              <strong>{{ season.episodes_available_count }}/{{ season.episodes_total_count }}</strong>
            </li>
          </ul>
        </div>
      </section>

      <!-- 2. Demandeurs, administration et journal, chacun sur toute la largeur. -->
      <div class="request-grid">
        <RequesterList
          :row="row"
          :admin="admin"
          :busy="busy"
          @notify-user="(...args) => $emit('notify-user', ...args)"
          @promote-requester="(...args) => $emit('promote-requester', ...args)"
          @remove-requester="(...args) => $emit('remove-requester', ...args)"
        >
          <form v-if="admin && index === 0" class="add-requester" @submit.prevent="submitAdd">
            <label :for="addFieldId" class="add-requester-label">Ajouter une personne</label>
            <div class="add-requester-controls">
              <UiSelect
                :id="addFieldId"
                :model-value="newRequesterId"
                :disabled="!addableUsers.length"
                :options="userOptions"
                @update:model-value="$emit('update:newRequesterId', $event)"
              />
              <UiButton type="submit" :disabled="busy || !newRequesterId"><template #icon><UserPlus /></template>Ajouter</UiButton>
            </div>
            <small class="add-requester-help">Il suivra cette demande et recevra les prochains mails. Aucun mail ne part sans confirmation.</small>
          </form>
        </RequesterList>

        <div class="request-side">
          <section v-if="admin" class="admin-card request-admin-actions" :aria-labelledby="`admin-title-${row.id}`">
            <h3 :id="`admin-title-${row.id}`">Administration</h3>

            <div class="admin-groups">
              <div class="admin-group" role="group" :aria-labelledby="`admin-mails-${row.id}`">
                <span :id="`admin-mails-${row.id}`" class="admin-group-title">Mails à tous les demandeurs</span>
                <UiButton :disabled="busy" @click="$emit('resend-mail', row.id, 'request')"><template #icon><Mail /></template>Renvoyer le mail de demande</UiButton>
                <UiButton v-if="row.status === 'available'" :disabled="busy" @click="$emit('resend-mail', row.id, 'available')"><template #icon><MailCheck /></template>Renvoyer le mail de disponibilité</UiButton>
                <UiButton v-if="hasUnnotified(row)" :disabled="busy" @click="$emit('catch-up-all', row)"><template #icon><Users /></template>Prévenir ceux qui ne l'ont pas reçu</UiButton>
              </div>

              <div v-if="hasFollowActions(row)" class="admin-group" role="group" :aria-labelledby="`admin-follow-${row.id}`">
                <span :id="`admin-follow-${row.id}`" class="admin-group-title">Suivi</span>
                <UiButton v-if="row.status === 'pending_approval'" :disabled="busy" @click="$emit('approve', row.id)"><template #icon><Check /></template>Approuver la demande</UiButton>
                <UiButton v-if="row.status === 'pending_approval'" :disabled="busy" @click="$emit('reject', row)"><template #icon><Ban /></template>Refuser la demande</UiButton>
                <UiButton v-if="row.arr_id" @click="$emit('open-release', row.id)"><template #icon><Search /></template>Rechercher une release</UiButton>
                <UiButton v-if="row.status === 'failed'" @click="$emit('retry', row.id)"><template #icon><RotateCcw /></template>Relancer</UiButton>
                <UiButton v-if="canClose(row)" :disabled="busy" @click="$emit('close-request', row)"><template #icon><CheckCheck /></template>Clôturer la demande</UiButton>
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
                  @update:model-value="onAutoImportChange(row, $event)"
                />
              </div>
            </div>

            <div class="admin-danger">
              <UiButton variant="danger" title="Annuler la demande (supprime aussi de Sonarr/Radarr)" :disabled="busy" @click="$emit('withdraw-request', row)"><template #icon><XCircle /></template>Annuler la demande</UiButton>
              <UiButton variant="danger" @click="$emit('delete-request', row.id)"><template #icon><Trash2 /></template>Supprimer</UiButton>
            </div>
          </section>

          <RequestMailHistory :row="row" />
        </div>
      </div>
    </article>

    <!-- 3. Aucune demande : le média est arrivé sans passer par un demandeur. -->
    <template v-if="!requests?.length">
      <section v-if="detail?.in_library" class="journey-card plex-origin-card" aria-labelledby="journey-title-direct">
        <div class="journey-head">
          <div class="journey-heading">
            <span class="journey-eyebrow">Parcours</span>
            <h2 id="journey-title-direct" class="journey-title">{{ directHeadline }}</h2>
            <p v-if="directSubtitle" class="journey-subtitle">{{ directSubtitle }}</p>
          </div>
          <div class="journey-badges">
            <UiBadge pill tone="success">Disponible</UiBadge>
          </div>
        </div>
      </section>

      <section class="nobody-card">
        <span class="nobody-icon" aria-hidden="true"><UserPlus /></span>
        <h3>Personne n'a demandé {{ mediaNoun }}</h3>
        <p v-if="admin">
          Ajoutez les personnes qui l'attendaient : une demande sera créée à leur nom.
          Aucun mail ne part sans confirmation.
        </p>
        <p v-else>Ce média a été ajouté sans demande utilisateur.</p>
        <form v-if="admin" class="add-requester is-empty" @submit.prevent="submitAdd">
          <label :for="addFieldId" class="visually-hidden">Personne à ajouter</label>
          <div class="add-requester-controls">
            <UiSelect
              :id="addFieldId"
              :model-value="newRequesterId"
              :disabled="!addableUsers.length"
              :options="userOptions"
              @update:model-value="$emit('update:newRequesterId', $event)"
            />
            <UiButton type="submit" variant="primary" :disabled="busy || !newRequesterId"><template #icon><UserPlus /></template>Ajouter comme demandeur</UiButton>
          </div>
        </form>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import { Ban, Check, CheckCheck, Mail, MailCheck, RotateCcw, Search, Trash2, UserPlus, Users, XCircle } from '@lucide/vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import { requestStatusLabel } from '@/utils/labels';
import RequestMailHistory from './RequestMailHistory.vue';
import RequestStatusStepper from './RequestStatusStepper.vue';
import RequesterList from './RequesterList.vue';
import {
  arrName,
  canClose,
  hasUnnotified,
  journeyHeadline,
  journeySubtitle,
  originLabel,
  seasonsSummary,
  shortDate,
  statusTone,
} from './requestRules';

const props = withDefaults(
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

const hasFollowActions = (row: any): boolean =>
  row.status === 'pending_approval' || Boolean(row.arr_id) || row.status === 'failed' || canClose(row);

const addFieldId = `add-requester-${useId()}`;

const userOptions = computed(() => [
  { value: '', label: props.addableUsers.length ? 'Choisir un utilisateur…' : 'Tous les utilisateurs sont déjà demandeurs' },
  ...props.addableUsers.map((u: any) => ({ value: u.plex_user_id, label: String(u.custom_name || u.display_name || u.plex_user_id) })),
]);

function submitAdd(): void {
  if (props.busy || !props.newRequesterId) return;
  emit('add-requester');
}

/* Trois états, pas deux : « suivre le réglage global » n'est pas « désactivé ». */
const AUTO_IMPORT_OPTIONS = [
  { value: 'inherit', label: 'Suivre le réglage global' },
  { value: 'on', label: 'Automatique pour ce média' },
  { value: 'off', label: 'Toujours manuel pour ce média' },
];
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

/* Sans demande : d'où vient le média, d'après ce que la fiche sait. */
const mediaNoun = computed(() => {
  const type = props.detail?.media_type;
  if (type === 'movie') return 'ce film';
  if (type === 'show') return 'cette série';
  return 'ce média';
});
const directHeadline = computed(() =>
  props.detail?.arr_id ? `Ajouté directement dans ${arrName(props.detail)}` : 'Ajouté directement dans Plex'
);
const directSubtitle = computed(() => {
  const parts: string[] = [];
  const added = shortDate(props.detail?.added_at);
  if (added) parts.push(`Dans Plex depuis le ${added}`);
  if (props.detail?.has_vf === true) parts.push('VF présente');
  else if (props.detail?.has_vf === false) parts.push('VF absente');
  return parts.join(' · ');
});
</script>

<style scoped lang="scss">
.requests-tab {
  container: demandes / inline-size;
  gap: var(--space-5);
}
.request-block {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.request-block + .request-block {
  padding-top: var(--space-5);
  border-top: 1px solid var(--border);
}

/* ----- Carte « Parcours » ----- */
.journey-card {
  container: parcours / inline-size;
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: var(--space-5) 28px;
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
}
.journey-head {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3) var(--space-4);
}
.journey-heading {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.journey-eyebrow {
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.journey-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-2xl);
  font-weight: 600;
  line-height: 1.2;
}
.journey-subtitle {
  margin: 0;
  color: var(--muted);
  font-size: var(--fs-md);
}
.journey-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.journey-origin {
  padding: 3px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  color: var(--muted);
  font-size: var(--fs-sm);
}
.journey-seasons {
  display: grid;
  gap: var(--space-2);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}
.journey-seasons-title {
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.journey-season-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.journey-season {
  display: inline-flex;
  gap: var(--space-2);
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  font-size: var(--fs-sm);
}
.journey-season.is-available {
  border-color: color-mix(in srgb, var(--green) 45%, transparent);
  color: var(--green-text);
}
.journey-season.is-partially_available {
  border-color: color-mix(in srgb, var(--amber) 45%, transparent);
  color: var(--amber-text);
}

/* ----- Demandeurs, administration et journal en pleine largeur ----- */
.request-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
}
.request-side {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
  align-items: start;
  min-width: 0;
}

/* ----- Ajout d'une personne ----- */
.add-requester {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
}
.add-requester-label {
  font-size: var(--fs-md);
  font-weight: 600;
  white-space: nowrap;
}
.add-requester-controls {
  display: flex;
  flex: 1 1 260px;
  gap: var(--space-3);
  min-width: 0;
}
.add-requester,
.add-requester > * {
  min-width: 0;
}
.add-requester-controls > :deep(:first-child) {
  flex: 1 1 0;
  min-width: 0;
}
.add-requester-controls :deep(.ui-select-trigger),
.add-requester-controls :deep(.ui-button) {
  min-height: var(--touch-target);
  min-width: 0;
}
.add-requester-controls :deep(.ui-select-trigger) {
  width: 100%;
}
.add-requester-controls :deep(.ui-button) {
  flex: none;
}
.add-requester-help {
  flex-basis: 100%;
  color: var(--muted);
  font-size: var(--fs-xs);
}

/* ----- Carte « Administration » ----- */
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

/* ----- Aucune demande ----- */
.nobody-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: var(--space-6);
  border: 1px dashed var(--border-strong);
  border-radius: var(--panel-radius);
  background: var(--surface);
  text-align: center;
}
.nobody-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--muted);
}
.nobody-icon svg {
  width: 26px;
  height: 26px;
}
.nobody-card h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-xl);
  font-weight: 600;
}
.nobody-card p {
  max-width: 520px;
  margin: 0;
  color: var(--muted);
  font-size: var(--fs-md);
  line-height: 1.55;
}
.add-requester.is-empty {
  width: 100%;
  max-width: 520px;
  margin-top: 6px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* Téléphone : cartes plus serrées, boutons à 44 px. */
@container demandes (max-width: 560px) {
  .journey-card {
    gap: 14px;
    padding: 18px;
  }
  .journey-title {
    font-size: var(--fs-xl);
  }
  /* Comme la maquette mobile : seule la pastille de statut, en haut à droite. */
  .journey-badges {
    position: absolute;
    top: -3px;
    right: 0;
  }
  .journey-origin {
    display: none;
  }
  .journey-eyebrow {
    padding-right: 110px;
  }
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
  .add-requester {
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: stretch;
  }
  .add-requester-controls {
    flex-basis: auto;
  }
  .add-requester.is-empty .add-requester-controls {
    flex-direction: column;
  }
  .add-requester-help {
    flex-basis: auto;
  }
  .nobody-card {
    padding: var(--space-5) 18px;
  }
}
</style>
