<template>
  <SettingsSection
    title="Motifs de message"
    description="Les explications proposées à l’annulation d’une demande ou à l’envoi d’une correction. Le libellé sert à choisir, le message est ce que lit le demandeur."
  >
    <UiFeedback v-if="error" type="error" :message="error" retry @retry="load" />
    <UiFeedback v-else-if="loading && !reasons.length" type="loading" message="Chargement des motifs…" />

    <div v-for="event in EVENTS" :key="event.key" class="reason-group">
      <header class="reason-group__head">
        <h3>{{ event.label }}</h3>
        <UiButton size="sm" @click="addReason(event.key)"><template #icon><Plus /></template>Ajouter un motif</UiButton>
      </header>
      <p class="reason-group__hint">{{ event.hint }}</p>

      <article v-for="reason in reasonsFor(event.key)" :key="reason.id" class="panel reason-card" :class="{ disabled: !reason.enabled }">
        <div class="reason-card__row">
          <label class="reason-card__label">
            <span>Libellé</span>
            <input v-model="reason.label" type="text" :disabled="busy" @change="save(reason)">
          </label>
          <label class="reason-card__toggle check">
            <input v-model="reason.enabled" type="checkbox" :disabled="busy" @change="save(reason)">
            <span>Proposé</span>
          </label>
          <UiButton size="sm" variant="ghost" icon-only title="Supprimer ce motif" :disabled="busy" @click="remove(reason)"><Trash2 /></UiButton>
        </div>
        <label class="reason-card__message">
          <span>Message envoyé</span>
          <textarea v-model="reason.message" rows="3" :disabled="busy" @change="save(reason)"></textarea>
        </label>
      </article>

      <p v-if="!reasonsFor(event.key).length && !loading" class="empty">Aucun motif pour l’instant.</p>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Plus, Trash2 } from '@lucide/vue';
import { api } from '@/api';
import SettingsSection from '@/components/settings/SettingsSection.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';

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
  {
    key: 'cancelled',
    label: 'Annulation d’une demande',
    hint: 'Proposés quand un administrateur annule une demande. Le message part avec le mail d’annulation.',
  },
  {
    key: 'correction',
    label: 'Correction sur un média',
    hint: 'Proposés à l’envoi d’une correction depuis la fiche d’un média.',
  },
];

const reasons = ref<Reason[]>([]);
const loading = ref(false);
const busy = ref(false);
const error = ref('');

const reasonsFor = (event: string) => reasons.value.filter((reason) => reason.event === event);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const payload = await api<{ items?: Reason[] }>('/api/message-reasons');
    reasons.value = payload.items || [];
  } catch (e: any) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

/* Chaque champ s'enregistre en le quittant : un bouton « Enregistrer » global obligerait
   a suivre quels motifs ont bouge parmi une dizaine de cartes. */
async function save(reason: Reason): Promise<void> {
  if (!reason.label.trim() || !reason.message.trim()) return;
  busy.value = true;
  try {
    await api(`/api/message-reasons/${reason.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ label: reason.label, message: reason.message, enabled: reason.enabled }),
    });
  } catch (e: any) {
    error.value = e?.message || String(e);
  } finally {
    busy.value = false;
  }
}

async function addReason(event: string): Promise<void> {
  busy.value = true;
  try {
    const created = await api<Reason>('/api/message-reasons', {
      method: 'POST',
      body: JSON.stringify({
        event,
        label: 'Nouveau motif',
        message: 'Message envoyé au demandeur.',
        position: reasonsFor(event).length,
      }),
    });
    reasons.value = [...reasons.value, created];
  } catch (e: any) {
    error.value = e?.message || String(e);
  } finally {
    busy.value = false;
  }
}

async function remove(reason: Reason): Promise<void> {
  busy.value = true;
  try {
    await api(`/api/message-reasons/${reason.id}`, { method: 'DELETE' });
    reasons.value = reasons.value.filter((row) => row.id !== reason.id);
  } catch (e: any) {
    error.value = e?.message || String(e);
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<style scoped lang="scss">
.reason-group { margin-top: var(--space-5); }
.reason-group:first-of-type { margin-top: var(--space-2); }
.reason-group__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.reason-group__head h3 { margin: 0; font-size: var(--fs-md); }
.reason-group__hint { margin: 4px 0 var(--space-3); color: var(--muted); font-size: var(--fs-xs); }

.reason-card { display: grid; gap: var(--space-3); padding: var(--space-4); margin-bottom: var(--space-3); }
.reason-card.disabled { opacity: .6; }
.reason-card__row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: var(--space-3); align-items: end; }
.reason-card__label, .reason-card__message { display: grid; gap: 4px; min-width: 0; }
.reason-card__label > span, .reason-card__message > span { color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.reason-card__toggle { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.reason-card textarea { resize: vertical; }

@media (max-width: 620px) {
  .reason-card__row { grid-template-columns: minmax(0, 1fr) auto; }
}
</style>
