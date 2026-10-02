<template>
  <div class="profile-tab">
    <SettingsSection v-if="account" title="Compte">
      <SettingsRow label="Nom affiché" description="Visible sur vos demandes. Seul un administrateur peut le changer.">
        <span class="profile-value">{{ account.display_name }}</span>
      </SettingsRow>
      <SettingsRow :label="account.source === 'local' ? 'Identifiant' : 'Compte Plex'" :description="account.plex_email || ''">
        <span class="profile-value">{{ account.plex_user_id }}</span>
      </SettingsRow>
      <SettingsRow v-if="account.created_at" label="Membre depuis">
        <span class="profile-value">{{ formatDateLong(account.created_at) }}</span>
      </SettingsRow>
    </SettingsSection>
    <p v-else class="profile-hint">
      Ce compte a été créé par l’assistant d’installation et n’est rattaché à aucun utilisateur : son mot de passe se change depuis cet assistant.
    </p>

    <SettingsSection title="Cet appareil" subtitle="Réglages propres à ce navigateur.">
      <SettingsRow label="Thème">
        <UiSegmentedControl v-model="themeChoice" :options="themeOptions" ariaLabel="Thème de l’interface" />
      </SettingsRow>
      <SettingsRow label="Application Watchdeck" :description="installDescription">
        <span v-if="isInstalled" class="profile-installed">Installée</span>
        <UiButton v-else-if="canInstall" @click="promptInstall"><template #icon><Download /></template>Installer</UiButton>
        <UiButton v-else-if="isIos" @click="showIosGuide = !showIosGuide">Comment faire ?</UiButton>
      </SettingsRow>
      <ol v-if="showIosGuide" class="profile-ios">
        <li>Touchez <strong>Partager</strong> (le carré avec une flèche vers le haut).</li>
        <li>Choisissez <strong>Sur l’écran d’accueil</strong>.</li>
        <li>Confirmez avec <strong>Ajouter</strong>.</li>
      </ol>
    </SettingsSection>

    <SettingsSection v-if="account" title="Mes données">
      <SettingsRow label="Exporter mes données" description="Vos demandes, les notifications reçues et vos réglages, dans un fichier JSON.">
        <UiButton href="/api/me/data-export" download><template #icon><FileDown /></template>Télécharger</UiButton>
      </SettingsRow>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Download, FileDown } from '@lucide/vue';
import SettingsRow from '@/components/settings/SettingsRow.vue';
import SettingsSection from '@/components/settings/SettingsSection.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import { usePwaInstall } from '@/composables/usePwaInstall';
import { useTheme } from '@/composables/useTheme';
import { formatDateLong } from '@/utils/format';

defineProps<{
  account: {
    display_name: string;
    plex_user_id: string;
    plex_email?: string | null;
    source?: string | null;
    created_at?: string | null;
  } | null;
}>();

const { choice: themeChoice } = useTheme();
const themeOptions = [
  { value: 'system', label: 'Système' },
  { value: 'dark', label: 'Sombre' },
  { value: 'light', label: 'Clair' },
];

const { canInstall, isInstalled, isIos, promptInstall } = usePwaInstall();
const showIosGuide = ref(false);
const installDescription = computed(() => {
  if (isInstalled.value) return 'Watchdeck s’ouvre en plein écran depuis votre écran d’accueil.';
  if (canInstall.value || isIos.value) return 'Plein écran et icône sur l’écran d’accueil, sans passer par un store.';
  return 'Depuis le menu du navigateur : « Installer l’application » ou « Ajouter à l’écran d’accueil ».';
});
</script>

<style scoped lang="scss">
.profile-tab { max-width: 860px; }
.profile-value { color: var(--text); font-size: var(--fs-sm); text-align: right; overflow-wrap: anywhere; }
.profile-hint { color: var(--muted); font-size: var(--fs-sm); }
.profile-installed { color: var(--green-text, var(--green)); font-size: var(--fs-xs); font-weight: 600; }
.profile-ios { margin: 0 0 var(--space-3); padding: 10px 14px 10px 2em; border-radius: var(--inset-radius); background: var(--surface-2); font-size: var(--fs-sm); line-height: 1.6; }
</style>
