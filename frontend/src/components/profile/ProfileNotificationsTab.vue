<template>
  <div class="profile-tab">
    <SettingsSection title="Ce que vous recevez" subtitle="Chaque changement est enregistré tout de suite.">
      <SettingsRow v-for="row in toggles" :key="row.key" :label="row.label" :description="row.description">
        <ToggleSwitch
          :model-value="preferences[row.key] !== false"
          :title="row.label"
          :disabled="mutation.isPending.value"
          @update:model-value="(value) => save({ [row.key]: value })"
        />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Où vous écrire" subtitle="Les messages partent par email, si l'administrateur a configuré l'envoi.">
      <SettingsRow label="Email de notification" :description="emailHint" label-for="profile-notification-email">
        <form class="profile-email" @submit.prevent="saveEmail">
          <input id="profile-notification-email" v-model="email" type="email" autocomplete="email" :placeholder="plexEmail || 'vous@exemple.fr'">
          <UiButton type="submit" :loading="mutation.isPending.value" :disabled="email.trim() === (preferences.notification_email || '')">Enregistrer</UiButton>
        </form>
      </SettingsRow>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import SettingsRow from '@/components/settings/SettingsRow.vue';
import SettingsSection from '@/components/settings/SettingsSection.vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import UiButton from '@/components/ui/UiButton.vue';
import type { ProfilePreferences } from './profileSecurity';

const props = defineProps<{ preferences: ProfilePreferences; plexEmail?: string | null }>();
const emit = defineEmits<{ (e: 'notify', message: string): void; (e: 'error', message: string): void }>();
const queryClient = useQueryClient();

type ToggleKey = 'notify_on_available' | 'notify_vf_movie' | 'notify_vf_series' | 'notify_on_request' | 'notify_digest';
const toggles: { key: ToggleKey; label: string; description: string }[] = [
  { key: 'notify_on_available', label: 'Ma demande est disponible', description: 'Quand un titre que vous avez demandé arrive sur Plex.' },
  { key: 'notify_vf_movie', label: 'La VF d’un film est arrivée', description: 'Quand la version française remplace la version originale.' },
  { key: 'notify_vf_series', label: 'La VF d’une série est arrivée', description: 'Même chose pour les épisodes de séries.' },
  { key: 'notify_on_request', label: 'Accusé de réception', description: 'Un message à chaque demande envoyée, pour confirmer qu’elle est bien partie.' },
  { key: 'notify_digest', label: 'Récapitulatif quotidien', description: 'Un seul message par jour avec les nouveautés.' },
];

const email = ref('');
watch(() => props.preferences.notification_email, (value) => { email.value = value || ''; }, { immediate: true });
const emailHint = computed(() => (props.plexEmail
  ? `Vide : l’email de votre compte Plex (${props.plexEmail}).`
  : 'Plusieurs adresses possibles, séparées par des virgules.'));

const mutation = useMutation({
  retry: 0,
  mutationFn: (changes: Partial<ProfilePreferences>) => api('/api/me/preferences', { method: 'PUT', body: JSON.stringify(changes) }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
});

async function save(changes: Partial<ProfilePreferences>, done = 'Préférence enregistrée.') {
  try {
    await mutation.mutateAsync(changes);
    emit('notify', done);
  } catch (e) { emit('error', e instanceof Error ? e.message : String(e)); }
}

function saveEmail() {
  save({ notification_email: email.value.trim() }, 'Email de notification enregistré.');
}
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.profile-tab { max-width: 860px; }
.profile-email { display: flex; gap: var(--space-2); align-items: center; }
.profile-email input { width: 260px; }
@include bp.until(phablet) {
  .profile-email { width: 100%; }
  .profile-email input { flex: 1; width: auto; min-width: 0; }
}
</style>
