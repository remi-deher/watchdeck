<template>
  <!-- Deux listes courtes, une par usage. Une ligne dit le libellé (ce que l'administrateur
       choisit) et le message (ce que lit le demandeur) ; on l'ouvre pour la modifier, avec un
       aperçu, au lieu d'éditer chaque carte en place. -->
  <div class="settings-rows">
    <UiFeedback v-if="error" type="error" :message="error" retry @retry="load" />
    <UiFeedback v-else-if="loading && !reasons.length" type="loading" message="Chargement des motifs…" />

    <SettingsItemList
      v-for="event in EVENTS"
      :key="event.key"
      :title="event.label"
      :subtitle="event.hint"
      :count="reasonsFor(event.key).filter((reason) => reason.enabled).length"
      :empty="!reasonsFor(event.key).length && !loading"
    >
      <template #actions>
        <UiButton size="sm" :disabled="busy" @click="openNew(event.key)"><template #icon><Plus /></template>Ajouter un motif</UiButton>
      </template>
      <template #empty>Aucun motif : l’administrateur écrira son message à la main.</template>

      <div
        v-for="(reason, index) in reasonsFor(event.key)"
        :key="reason.id"
        class="reason-row"
        :class="{ 'is-off': !reason.enabled }"
        role="listitem"
      >
        <!-- L'ordre est celui dans lequel l'administrateur voit les motifs au moment de choisir. -->
        <div class="reason-row__order">
          <UiButton size="sm" variant="ghost" icon-only :aria-label="`Monter ${reason.label}`" :disabled="busy || index === 0" @click="move(event.key, index, -1)"><ChevronUp /></UiButton>
          <UiButton size="sm" variant="ghost" icon-only :aria-label="`Descendre ${reason.label}`" :disabled="busy || index === reasonsFor(event.key).length - 1" @click="move(event.key, index, 1)"><ChevronDown /></UiButton>
        </div>
        <button type="button" class="reason-row__text" @click="openEdit(reason)">
          <strong>{{ reason.label }}</strong>
          <small>« {{ reason.message }} »</small>
        </button>
        <ToggleSwitch
          :model-value="reason.enabled"
          :disabled="busy"
          :title="reason.enabled ? `Ne plus proposer ${reason.label}` : `Proposer ${reason.label}`"
          @update:model-value="(value: boolean) => patch(reason, { enabled: value })"
        />
        <UiButton size="sm" :aria-label="`Modifier ${reason.label}`" @click="openEdit(reason)"><template #icon><Pencil /></template>Modifier</UiButton>
      </div>
    </SettingsItemList>

    <ModalShell
      :open="editing !== null"
      :title="editing?.id ? 'Modifier le motif' : 'Nouveau motif'"
      :subtitle="eventOf(editing?.event)?.label"
      :error="editError"
      :busy="busy"
      @close="editing = null"
    >
      <form v-if="editing" class="reason-form" @submit.prevent="submit">
        <label>Libellé
          <input v-model="editing.label" type="text" maxlength="80" required>
          <small>Ce que voit l’administrateur pour choisir.</small>
        </label>
        <label>Message envoyé
          <textarea v-model="editing.message" rows="4" required></textarea>
          <small>Ce que lit le demandeur.</small>
        </label>
        <UiCheckboxField v-model="editing.enabled" label="Proposer ce motif" />
        <div class="reason-preview" aria-live="polite">
          <span>Aperçu</span>
          <strong>{{ editing.event === 'cancelled' ? 'Votre demande « Dune » a été annulée' : 'Une correction a été apportée à « Dune »' }}</strong>
          <p>{{ editing.message || '…' }}</p>
        </div>
      </form>
      <template #actions>
        <UiButton v-if="editing?.id" variant="danger" :disabled="busy" @click="removeEditing"><template #icon><Trash2 /></template>Supprimer…</UiButton>
        <span class="reason-form__spacer" />
        <UiButton :disabled="busy" @click="editing = null">Annuler</UiButton>
        <UiButton variant="primary" :loading="busy" :disabled="!canSave" @click="submit"><template #icon><Save /></template>Enregistrer</UiButton>
      </template>
    </ModalShell>
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
  </div>
</template>

<script setup lang="ts">
import { humanizeError } from '@/utils/apiError';
import { computed, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ChevronDown, ChevronUp, Pencil, Plus, Save, Trash2 } from '@lucide/vue';
import { api } from '@/api';
import ConfirmModal from '@/components/ConfirmModal.vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import { useConfirm } from '@/composables/useConfirm';
import SettingsItemList from './SettingsItemList.vue';

interface Reason {
  id: number;
  event: string;
  label: string;
  message: string;
  position: number;
  enabled: boolean;
}
type Draft = Omit<Reason, 'id' | 'position'> & { id?: number };

/* Un motif d'annulation n'a rien a faire dans une correction : les deux listes sont
   distinctes, et c'est le contexte qui decide laquelle s'affiche. */
const EVENTS = [
  { key: 'cancelled', label: 'Annulation d’une demande', hint: 'Proposés quand un administrateur annule une demande ; le message part avec le mail d’annulation.' },
  { key: 'correction', label: 'Correction sur un média', hint: 'Proposés à l’envoi d’une correction depuis la fiche d’un média.' },
];
const eventOf = (key?: string) => EVENTS.find((event) => event.key === key);

const reasons = ref<Reason[]>([]);
const actionError = ref('');
const queryClient = useQueryClient();
const reasonsQuery = useQuery({ queryKey: ['settings', 'message-reasons'], queryFn: () => api<{ items?: Reason[] }>('/api/message-reasons') });
watch(() => reasonsQuery.data.value, (payload) => { if (payload) reasons.value = (payload.items || []).map((reason) => ({ ...reason })); }, { immediate: true });
const loading = computed(() => reasonsQuery.isFetching.value);
const busy = computed(() => reasonMutation.isPending.value);
const error = computed(() => actionError.value || (reasonsQuery.error.value ? humanizeError(reasonsQuery.error.value) : ''));

const reasonsFor = (event: string) =>
  reasons.value.filter((reason) => reason.event === event).sort((a, b) => a.position - b.position || a.id - b.id);

async function load(): Promise<void> {
  actionError.value = '';
  await reasonsQuery.refetch();
}

const reasonMutation = useMutation({
  mutationFn: ({ path, method, body }: { path: string; method: string; body?: any }) => api(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
  retry: 0,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'message-reasons'] }),
});
async function call(path: string, method: string, body?: any): Promise<boolean> {
  actionError.value = '';
  try {
    await reasonMutation.mutateAsync({ path, method, body });
    return true;
  } catch (e) {
    actionError.value = humanizeError(e);
    return false;
  }
}

async function patch(reason: Reason, changes: Partial<Reason>): Promise<void> {
  Object.assign(reason, changes);
  await call(`/api/message-reasons/${reason.id}`, 'PATCH', changes);
}

/* Monter ou descendre échange deux positions ; les positions sont renumérotées pour que
   des valeurs égales (anciennes données) ne bloquent pas le déplacement. */
async function move(event: string, index: number, delta: number): Promise<void> {
  const list = reasonsFor(event);
  const target = index + delta;
  if (target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
  const changed = list.map((reason, position) => ({ reason, position })).filter(({ reason, position }) => reason.position !== position);
  changed.forEach(({ reason, position }) => { reason.position = position; });
  for (const { reason, position } of changed) {
    if (!await call(`/api/message-reasons/${reason.id}`, 'PATCH', { position })) break;
  }
}

/* Édition dans une fenêtre, avec aperçu : Annuler ne laisse aucune trace. */
const editing = ref<Draft | null>(null);
const editError = ref('');
const canSave = computed(() => Boolean(editing.value?.label.trim() && editing.value?.message.trim()));
function openNew(event: string): void {
  editError.value = '';
  editing.value = { event, label: '', message: '', enabled: true };
}
function openEdit(reason: Reason): void {
  editError.value = '';
  editing.value = { id: reason.id, event: reason.event, label: reason.label, message: reason.message, enabled: reason.enabled };
}
async function submit(): Promise<void> {
  const draft = editing.value;
  if (!draft || !canSave.value) return;
  const body = { label: draft.label.trim(), message: draft.message.trim(), enabled: draft.enabled };
  const ok = draft.id
    ? await call(`/api/message-reasons/${draft.id}`, 'PATCH', body)
    : await call('/api/message-reasons', 'POST', { ...body, event: draft.event, position: reasonsFor(draft.event).length });
  if (ok) editing.value = null;
  else editError.value = actionError.value;
}

const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
async function removeEditing(): Promise<void> {
  const draft = editing.value;
  if (!draft?.id) return;
  if (!await askConfirm({
    title: `Supprimer « ${draft.label} » ?`,
    message: 'Le motif disparaît de la liste. Pour le garder sans le proposer, décochez plutôt « Proposer ce motif ».',
    confirmLabel: 'Supprimer le motif',
    danger: true,
  })) return;
  if (await call(`/api/message-reasons/${draft.id}`, 'DELETE')) editing.value = null;
}
</script>

<style scoped lang="scss">
.reason-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: var(--space-2) var(--space-3); align-items: center; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); }
.reason-row:last-child { border-bottom: 0; }
.reason-row.is-off .reason-row__text { opacity: .6; }
.reason-row__order { display: grid; }
.reason-row__text { display: grid; gap: 2px; min-width: 0; padding: 0; border: 0; background: none; color: inherit; text-align: left; cursor: pointer; }
.reason-row__text small { overflow: hidden; color: var(--muted); font-size: var(--fs-sm); text-overflow: ellipsis; white-space: nowrap; }
.reason-form { display: grid; gap: var(--space-3); }
.reason-form label { display: grid; gap: 4px; }
.reason-form small { color: var(--muted); font-size: var(--fs-xs); }
.reason-form textarea { resize: vertical; }
.reason-form__spacer { flex: 1; }
.reason-preview { display: grid; gap: 4px; padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--inset-radius); background: var(--surface-2); }
.reason-preview > span { color: var(--muted); font-size: var(--fs-xs); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.reason-preview p { margin: 0; white-space: pre-line; }
</style>
