<template>
  <div class="profile-tab">
    <p v-if="!account" class="profile-hint">
      Ce compte a été créé par l’assistant d’installation et n’est rattaché à aucun utilisateur : son mot de passe se change depuis cet assistant.
    </p>
    <ConfigureTemplate :sections="sections">
      <template #section-account>
        <template v-if="account">
          <ConfigureField label="Nom affiché" help="Visible sur vos demandes. Seul un administrateur peut le changer.">
            <span class="profile-value">{{ account.display_name }}</span>
          </ConfigureField>
          <ConfigureField :label="account.source === 'local' ? 'Identifiant' : 'Compte Plex'" :help="account.plex_email || ''">
            <span class="profile-value">{{ account.plex_user_id }}</span>
          </ConfigureField>
          <ConfigureField v-if="account.created_at" label="Membre depuis">
            <span class="profile-value">{{ formatDateLong(account.created_at) }}</span>
          </ConfigureField>
        </template>
      </template>
      <template #section-device>
        <ConfigureField label="Thème">
          <ThemeSettings />
        </ConfigureField>
        <ConfigureField label="Application Watchdeck" :help="installDescription">
          <span v-if="isInstalled" class="profile-installed">Installée</span>
          <UiButton v-else-if="canInstall" @click="promptInstall"><template #icon><Download /></template>Installer</UiButton>
          <UiButton v-else-if="isIos" @click="showIosGuide = !showIosGuide">Comment faire ?</UiButton>
        </ConfigureField>
        <ol v-if="showIosGuide" class="profile-ios">
          <li>Touchez <strong>Partager</strong> (le carré avec une flèche vers le haut).</li>
          <li>Choisissez <strong>Sur l’écran d’accueil</strong>.</li>
          <li>Confirmez avec <strong>Ajouter</strong>.</li>
        </ol>
      </template>
      <template #section-data>
        <ConfigureField label="Exporter mes données" help="Vos demandes, les notifications reçues et vos réglages, dans un fichier JSON.">
          <UiButton href="/api/me/data-export" download><template #icon><FileDown /></template>Télécharger</UiButton>
        </ConfigureField>
      </template>
    </ConfigureTemplate>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Download, FileDown } from '@lucide/vue';
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';
import UiButton from '@/components/ui/UiButton.vue';
import ThemeSettings from '@/components/ui/ThemeSettings.vue';
import { usePwaInstall } from '@/composables/usePwaInstall';
import { formatDateLong } from '@/utils/format';

const props = defineProps<{
  account: {
    display_name: string;
    plex_user_id: string;
    plex_email?: string | null;
    source?: string | null;
    created_at?: string | null;
  } | null;
}>();

const sections = computed(() => [
  ...(props.account ? [{ key: 'account', title: 'Compte' }] : []),
  { key: 'device', title: 'Cet appareil', description: 'Réglages propres à ce navigateur.' },
  ...(props.account ? [{ key: 'data', title: 'Mes données' }] : []),
]);

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
