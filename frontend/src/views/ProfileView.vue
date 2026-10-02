<template>
  <AppPage hide-search
    title="Profil"
    :error="error"
    :success="message"
    @dismiss-success="message = ''"
  >

    <div class="settings-rows profile-sections">
        <SettingsSection title="Compte" subtitle="Identité et mot de passe de connexion.">
          <div class="profile-section-body">
            <div class="account-summary">
              <div>
                <strong>{{ displayName }}</strong>
                <span class="badge">{{ roleLabel }}</span>
                <p>{{ identity?.notification_email || identity?.plex_email || 'Aucun email renseigné' }}</p>
                <code v-if="identity?.plex_user_id">{{ identity.plex_user_id }}</code>
              </div>
            </div>
            <template v-if="canManageSecurity">
              <UiField v-if="identity?.has_local_password" label="Mot de passe actuel" hint="Requis pour confirmer qu'il s'agit bien de vous." v-slot="field">
                <input :id="field.id" v-model="currentPassword" type="password" autocomplete="current-password" :aria-describedby="field.describedBy">
              </UiField>
              <UiField v-else-if="totpEnabled" label="Code à 6 chiffres" hint="Code de votre application d'authentification, pour confirmer qu'il s'agit bien de vous." v-slot="field">
                <input :id="field.id" v-model="passwordOtp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456" :aria-describedby="field.describedBy">
              </UiField>
              <UiField label="Nouveau mot de passe" hint="Laissez ce champ vide si vous ne souhaitez pas changer votre mot de passe actuel." v-slot="field">
                <input :id="field.id" v-model="password" type="password" minlength="8" autocomplete="new-password" placeholder="Au moins 8 caractères" :aria-describedby="field.describedBy">
              </UiField>
              <div class="actions">
                <UiButton variant="primary" :loading="busy" :disabled="password.length < 8" @click="changePassword"><template #icon><KeyRound/></template>Modifier le mot de passe</UiButton>
              </div>
            </template>
            <p v-else class="hint">Ce compte n'est pas lié à un utilisateur Plex : le mot de passe se change depuis l'assistant de configuration initial.</p>
        </div>
        </SettingsSection>

        <template v-if="canManageSecurity">
          <SettingsSection title="Double authentification" subtitle="Exige un code temporaire (TOTP) en plus du mot de passe à la connexion." :status="totpEnabled ? 'active' : 'inactive'">
            <div class="profile-section-body">
              <template v-if="totpEnabled">
                <p class="hint">La double authentification est active sur ce compte. La désactiver supprime cette protection supplémentaire.</p>
                <UiField label="Code à 6 chiffres" hint="Saisissez un code actuel pour confirmer la désactivation." v-slot="field">
                  <input :id="field.id" v-model="totpDisableCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456" :aria-describedby="field.describedBy">
                </UiField>
                <div class="actions">
                  <UiButton variant="danger" :loading="busy" :disabled="totpDisableCode.length !== 6" @click="disableTotp"><template #icon><ShieldCheck/></template>Désactiver le TOTP</UiButton>
                </div>
              </template>
              <template v-else-if="totpSecret">
                <p class="hint">Scannez ce QR code dans votre application d'authentification (Google Authenticator, Authy, Bitwarden…), puis saisissez le code à 6 chiffres qu'elle affiche pour confirmer l'activation.</p>
                <img v-if="totpQr" :src="totpQr" class="totp-qr" alt="QR code TOTP">
                <p>Secret manuel (si le QR code ne fonctionne pas) : <code>{{ totpSecret }}</code></p>
                <UiField label="Code à 6 chiffres" v-slot="field">
                  <input :id="field.id" v-model="totpCode" inputmode="numeric" maxlength="6" placeholder="123456">
                </UiField>
                <div class="actions">
                  <UiButton variant="primary" :loading="busy" :disabled="totpCode.length !== 6" @click="enableTotp"><template #icon><ShieldCheck/></template>Activer</UiButton>
                  <UiButton :disabled="busy" @click="cancelTotpSetup">Annuler</UiButton>
                </div>
              </template>
              <template v-else>
                <p class="hint">Non configurée — n'importe qui connaissant votre mot de passe peut se connecter. Recommandé pour un compte administrateur.</p>
                <div class="actions">
                  <UiButton :loading="busy" @click="setupTotp"><template #icon><ShieldCheck/></template>Configurer</UiButton>
                </div>
              </template>
          </div>
          </SettingsSection>

          <SettingsSection title="Passkeys" subtitle="Connexion sans mot de passe via l'empreinte, le visage ou une clé de sécurité de l'appareil." :status="passkeys.length ? 'active' : 'inactive'">
            <div class="profile-section-body">
              <p v-if="!webAuthnAvailable" class="hint">Ton navigateur ne prend pas en charge les passkeys (WebAuthn).</p>
              <div class="actions">
                <UiButton :loading="busy" :disabled="!webAuthnAvailable" @click="registerPasskey"><template #icon><Fingerprint/></template>Enregistrer une passkey</UiButton>
              </div>
              <div v-for="key in passkeys" :key="key.credential_id" class="inline-row">
                <div>
                  <strong>{{ key.name }}</strong>
                  <span>Ajoutée le {{ formatDate(key.created_at) }}</span>
                </div>
                <UiButton variant="danger" size="sm" icon-only title="Supprimer" aria-label="Supprimer" @click="deletePasskey(key)"><Trash2/></UiButton>
              </div>
              <UiEmptyState v-if="!passkeys.length" title="Aucune passkey enregistrée" compact />
          </div>
          </SettingsSection>
        </template>

        <SettingsSection
          title="Application Mobile (PWA)"
          subtitle="Installez Watchdeck sur votre smartphone ou bureau pour un accès plein écran rapide."
          :status="isInstalled ? 'active' : ''"
          :status-text="isInstalled ? 'Installée' : ''"
        >
          <div class="profile-section-body">
            <div v-if="isInstalled" class="pwa-status-badge">
              <span class="badge available">✓ Application installée en mode autonome</span>
              <p class="hint">Watchdeck s'exécute comme une application native avec son propre écran d'accueil et raccourcis.</p>
            </div>
            <div v-else class="pwa-install-section">
              <p class="hint">
                Watchdeck est compatible PWA (Progressive Web App). Vous pouvez l'ajouter à votre écran d'accueil sans passer par les stores d'applications.
              </p>
              <div class="actions">
                <UiButton v-if="canInstall" variant="primary" :disabled="busy" @click="promptInstall"><template #icon><Download /></template>Installer l'application</UiButton>
                <UiButton v-else-if="isIos" @click="showIosGuide = !showIosGuide"><template #icon><Smartphone /></template>Instructions pour iOS</UiButton>
                <span v-else class="hint">Pour installer Watchdeck, utilisez le menu de votre navigateur (icône Installer dans la barre d'adresse ou « Ajouter à l'écran d'accueil »).</span>
              </div>

              <div v-if="showIosGuide" class="ios-guide-box">
                <strong>Installation sur iPhone / iPad (Safari) :</strong>
                <ol>
                  <li>1. Appuyez sur l'icône de <strong>Partage</strong> (rectangle avec flèche vers le haut).</li>
                  <li>2. Faites défiler et touchez <strong>« Sur l'écran d'accueil »</strong>.</li>
                  <li>3. Confirmez en touchant <strong>Ajouter</strong>.</li>
                </ol>
              </div>
            </div>
        </div>
        </SettingsSection>

        <SettingsSection title="Apparence" subtitle="Thème de l'interface sur cet appareil.">
          <div class="profile-section-body">
            <UiRadioCards v-model="themeChoice" :options="themeCards" label="Thème de l'interface" />
        </div>
        </SettingsSection>

        <p v-if="!canManageSecurity" class="hint">La double authentification et les passkeys nécessitent un compte lié à un utilisateur Plex.</p>
    </div>
  </AppPage>
</template>

<script setup>
import { formatDate } from '@/utils/format';
import { base64UrlToBuffer, bufferToBase64Url } from '@/utils/webauthn';
import { computed, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Fingerprint, KeyRound, ShieldCheck, Smartphone, Download, Trash2 } from '@lucide/vue';
import UiRadioCards from '@/components/ui/UiRadioCards.vue';
import { useTheme } from '@/composables/useTheme';
import QRCode from 'qrcode';
import { api } from '@/api';
import SettingsSection from '@/components/settings/SettingsSection.vue';

const { choice: themeChoice } = useTheme();
const themeCards = [
  { value: 'system', label: 'Système', description: "Suit le réglage clair ou sombre de l'appareil." },
  { value: 'dark', label: 'Sombre', description: 'Fond bleu nuit, idéal le soir et pour les affiches.' },
  { value: 'light', label: 'Clair', description: 'Fond clair, plus lisible en plein jour.' },
];
import { usePwaInstall } from '@/composables/usePwaInstall';
import UiField from '@/components/ui/UiField.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import { useSession } from '@/composables/useSession';

const { canInstall, isInstalled, isIos, promptInstall } = usePwaInstall();
const showIosGuide = ref(false);

const queryClient = useQueryClient();
const { session } = useSession();
const userId = computed(() => session.value?.id || null);
const identityQuery = useQuery({
  queryKey: computed(() => ['users', 'detail', userId.value]),
  queryFn: () => api(`/api/users/${userId.value}`),
  enabled: computed(() => Boolean(userId.value)),
});
const passkeysQuery = useQuery({
  queryKey: computed(() => ['users', 'passkeys', userId.value]),
  queryFn: () => api(`/api/users/${userId.value}/passkeys`),
  enabled: computed(() => Boolean(userId.value)),
});
const identity = computed(() => identityQuery.data.value || session.value);
const password = ref('');
const currentPassword = ref('');
const passwordOtp = ref('');
const totpDisableCode = ref('');
const totpEnabled = ref(false);
const totpSecret = ref('');
const totpCode = ref('');
const totpQr = ref('');
const passkeys = computed(() => passkeysQuery.data.value || []);
const actionError = ref('');
const message = ref('');
const webAuthnAvailable = Boolean(window.PublicKeyCredential && navigator.credentials);

// Le compte admin cree par l'assistant /setup initial n'est pas rattache a un
// PlexUser (voir app/routers/auth.py setup_post) : la session n'a alors pas d'id,
// et /api/users/{id}/... n'a rien a servir — on masque TOTP/passkeys plutot que
// d'afficher des actions qui echoueraient silencieusement.
const canManageSecurity = computed(() => Boolean(identity.value?.id));
const displayName = computed(() => (
  identity.value?.custom_name || identity.value?.display_name || identity.value?.plex_user_id || identity.value?.username || 'Compte'
));
const roleLabel = computed(() => identity.value?.role || '');
const error = computed(() => actionError.value || identityQuery.error.value?.message || passkeysQuery.error.value?.message || '');

function notify(text) { message.value = text; actionError.value = ''; }
const invalidateIdentity = () => queryClient.invalidateQueries({ queryKey: ['users', 'detail', userId.value] });
const invalidatePasskeys = () => queryClient.invalidateQueries({ queryKey: ['users', 'passkeys', userId.value] });

const passwordMutation = useMutation({
  mutationFn: () => api(`/api/users/${userId.value}/password`, {
    method: 'POST',
    body: JSON.stringify({ password: password.value, current_password: currentPassword.value, otp_code: passwordOtp.value }),
  }),
  retry: 0,
});
const setupTotpMutation = useMutation({
  mutationFn: () => api(`/api/users/${userId.value}/totp/setup`, { method: 'POST' }),
  retry: 0,
  gcTime: 0,
});
const enableTotpMutation = useMutation({
  mutationFn: () => api(`/api/users/${userId.value}/totp/enable`, { method: 'POST', body: JSON.stringify({ code: totpCode.value }) }),
  retry: 0,
  onSuccess: invalidateIdentity,
});
const disableTotpMutation = useMutation({
  mutationFn: () => api(`/api/users/${userId.value}/totp`, { method: 'DELETE', body: JSON.stringify({ code: totpDisableCode.value }) }),
  retry: 0,
  onSuccess: invalidateIdentity,
});
const deletePasskeyMutation = useMutation({
  mutationFn: (key) => api(`/api/users/${userId.value}/passkeys/${encodeURIComponent(key.credential_id)}`, { method: 'DELETE' }),
  retry: 0,
  onSuccess: invalidatePasskeys,
});
const busy = computed(() => [passwordMutation, setupTotpMutation, enableTotpMutation, disableTotpMutation, deletePasskeyMutation, registerPasskeyMutation]
  .some((mutation) => mutation.isPending.value));

async function changePassword() {
  try {
    await passwordMutation.mutateAsync();
    password.value = '';
    currentPassword.value = '';
    passwordOtp.value = '';
    notify('Mot de passe modifié.');
  } catch (e) { actionError.value = e.message; }
}

async function setupTotp() {
  try {
    const data = await setupTotpMutation.mutateAsync();
    totpSecret.value = data.secret;
    totpQr.value = await QRCode.toDataURL(data.uri, { width: 220, margin: 1 });
    setupTotpMutation.reset();
  } catch (e) { actionError.value = e.message; setupTotpMutation.reset(); }
}

function cancelTotpSetup() {
  totpSecret.value = '';
  totpCode.value = '';
  totpQr.value = '';
}

async function enableTotp() {
  try {
    await enableTotpMutation.mutateAsync();
    cancelTotpSetup();
    totpEnabled.value = true;
    notify('Double authentification activée.');
  } catch (e) { actionError.value = e.message; }
}

async function disableTotp() {
  try {
    await disableTotpMutation.mutateAsync();
    totpDisableCode.value = '';
    totpEnabled.value = false;
    notify('Double authentification désactivée.');
  } catch (e) { actionError.value = e.message; }
}

async function deletePasskey(key) {
  try {
    await deletePasskeyMutation.mutateAsync(key);
  } catch (e) { actionError.value = e.message; }
}

const registerPasskeyMutation = useMutation({
  retry: 0,
  mutationFn: async () => {
    const options = await api('/api/users/webauthn/register/options', { method: 'POST', body: JSON.stringify({ user_id: identity.value.id }) });
    options.challenge = base64UrlToBuffer(options.challenge);
    options.user.id = base64UrlToBuffer(options.user.id);
    options.excludeCredentials = (options.excludeCredentials || []).map(entry => ({ ...entry, id: base64UrlToBuffer(entry.id) }));
    const credential = await navigator.credentials.create({ publicKey: options });
    const payload = credential.toJSON ? credential.toJSON() : {
      id: credential.id,
      rawId: bufferToBase64Url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64Url(credential.response.clientDataJSON),
        attestationObject: bufferToBase64Url(credential.response.attestationObject),
      },
      clientExtensionResults: credential.getClientExtensionResults(),
    };
    const name = prompt('Nom de la passkey', 'Passkey') || 'Passkey';
    await api('/api/users/webauthn/register/verify', { method: 'POST', body: JSON.stringify({ user_id: identity.value.id, credential: payload, name }) });
  },
  onSuccess: invalidatePasskeys,
});

async function registerPasskey() {
  actionError.value = '';
  try {
    await registerPasskeyMutation.mutateAsync();
    notify('Passkey enregistrée.');
  } catch (e) { actionError.value = e.message; }
}

watch(identity, (value) => { totpEnabled.value = Boolean(value?.totp_enabled); }, { immediate: true });
</script>

<style scoped lang="scss">
.profile-section-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-top: var(--space-3);
}
.profile-section-body :deep(label:not(.check)) {
  display: grid;
  gap: var(--space-2);
  font-size: var(--fs-sm);
  font-weight: 600;
}
.pwa-status-badge {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.pwa-install-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.ios-guide-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border-left: 3px solid var(--accent);
  font-size: var(--fs-xs);
  color: var(--text);
}

.ios-guide-box ol {
  margin: 0;
  padding-left: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
