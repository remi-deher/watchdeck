<template>
  <!-- Deux listes courtes, une par usage. Une ligne dit le libellé (ce que l'administrateur
       choisit) et le message (ce que lit le demandeur) ; on l'ouvre pour la modifier, avec un
       aperçu, au lieu d'éditer chaque carte en place. -->
  <ConfigureTemplate :sections="sections" v-bind="page.bind.value" @save="page.save" @cancel="page.cancel">
    <template v-for="event in EVENTS" :key="event.key" #[`section-${event.key}`]>
      <div class="reason-add"><UiButton size="sm" :disabled="busy" @click="openNew(event.key)"><template #icon><Plus /></template>Ajouter un motif</UiButton></div>
      <p v-if="!reasonsFor(event.key).length && !loading" class="reason-empty">Aucun motif : l’administrateur écrira son message à la main.</p>
      <div class="reason-list" role="list">
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
          <UiButton size="sm" variant="danger" icon-only :aria-label="`Supprimer ${reason.label}`" title="Supprimer" :disabled="busy" @click="remove(reason)"><Trash2 /></UiButton>
        </div>
      </div>
    </template>

    <UiFeedback v-if="error" type="error" :message="error" retry @retry="load" />
    <UiFeedback v-else-if="loading && !reasons.length" type="loading" message="Chargement des motifs…" />
  </ConfigureTemplate>

  <CreateTemplate :open="Boolean(form)" :definition="form?.definition || blank" :mode="form?.reason ? 'edit' : 'create'" :values="form?.reason ? { label: form.reason.label, message: form.reason.message, enabled: form.reason.enabled } : null" @close="form = null" />
  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>

<script setup lang="ts">
import { humanizeError } from '@/utils/apiError';
import { computed, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ChevronDown, ChevronUp, MessageSquareText, Pencil, Plus, Trash2 } from '@lucide/vue';
import { api } from '@/api';
import ConfirmModal from '@/components/ConfirmModal.vue';
import CreateTemplate from '@/components/templates/CreateTemplate.vue';
import type { CreateDefinition } from '@/components/templates/create/types';
import { messageReasonForm, type MessageReasonDraft } from '@/creations/messageReason';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import { useConfirm } from '@/composables/useConfirm';
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import { useSettingsPage } from '@/composables/useSettingsPage';

interface Reason {
  id: number;
  event: string;
  label: string;
  message: string;
  position: number;
  enabled: boolean;
}

/* Un motif d'annulation n'a rien a faire dans une correction : les deux listes sont
   distinctes, et c'est le contexte qui decide laquelle s'affiche. */
const EVENTS = [
  { key: 'cancelled', label: 'Annulation d’une demande', hint: 'Proposés quand un administrateur annule une demande ; le message part avec le mail d’annulation.' },
  { key: 'correction', label: 'Correction sur un média', hint: 'Proposés à l’envoi d’une correction depuis la fiche d’un média.' },
];
const page = useSettingsPage();
const sections = EVENTS.map((event) => ({ key: event.key, title: event.label, description: event.hint, icon: MessageSquareText, keywords: ['motif', 'message', 'annulation', 'correction'] }));
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

/* Ajout et modification : une definition du gabarit Creer (voir creations/messageReason). */
const blank = messageReasonForm('cancelled', '', async () => {});
const form = ref<{ definition: CreateDefinition; reason: Reason | null } | null>(null);
function openForm(event: string, reason: Reason | null): void {
  const label = eventOf(event)?.label || '';
  form.value = {
    reason,
    definition: messageReasonForm(event, label, async (draft: MessageReasonDraft) => {
      const ok = reason
        ? await call(`/api/message-reasons/${reason.id}`, 'PATCH', draft)
        : await call('/api/message-reasons', 'POST', { ...draft, event, position: reasonsFor(event).length });
      if (!ok) throw new Error(actionError.value || 'Enregistrement impossible.');
    }),
  };
}
const openNew = (event: string) => openForm(event, null);
const openEdit = (reason: Reason) => openForm(reason.event, reason);

const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
async function remove(reason: Reason): Promise<void> {
  if (!await askConfirm({
    title: `Supprimer « ${reason.label} » ?`,
    message: 'Le motif disparaît de la liste. Pour le garder sans le proposer, désactivez-le plutôt.',
    confirmLabel: 'Supprimer le motif',
    danger: true,
  })) return;
  await call(`/api/message-reasons/${reason.id}`, 'DELETE');
}
</script>

<style scoped lang="scss">
.reason-list { border: 1px solid var(--border); border-radius: var(--inset-radius); }
.reason-list:empty { display: none; }
.reason-empty { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.reason-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto auto; gap: var(--space-2) var(--space-3); align-items: center; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); }
.reason-row:last-child { border-bottom: 0; }
.reason-row.is-off .reason-row__text { opacity: .6; }
.reason-row__order { display: grid; }
.reason-row__text { display: grid; gap: 2px; min-width: 0; padding: 0; border: 0; background: none; color: inherit; text-align: left; cursor: pointer; }
.reason-row__text small { overflow: hidden; color: var(--muted); font-size: var(--fs-sm); text-overflow: ellipsis; white-space: nowrap; }
</style>
