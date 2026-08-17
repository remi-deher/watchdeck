<template>
  <PageShell
    title="Profil"
    description="Informations, mot de passe et méthodes de connexion."
    eyebrow="Compte"
    :error="error"
    :success="message"
    @dismiss-success="message = ''"
  >

    <div class="settings-grid">
      <div class="settings-cards span-two">
        <SettingsCard title="Compte" subtitle="Identité et mot de passe de connexion." :icon="UserRound" status="active" :collapsible="false">
          <div class="account-summary">
            <div>
              <strong>{{ displayName }}</strong>
              <span class="badge">{{ roleLabel }}</span>
              <p>{{ identity?.notification_email || identity?.plex_email || 'Aucun email renseigné' }}</p>
              <code v-if="identity?.plex_user_id">{{ identity.plex_user_id }}</code>
            </div>
          </div>
          <template v-if="canManageSecurity">
            <UiField label="Nouveau mot de passe" hint="Laisse ce champ vide si tu ne veux pas changer ton mot de passe actuel." v-slot="field">
              <input :id="field.id" v-model="password" type="password" minlength="8" autocomplete="new-password" placeholder="Au moins 8 caractères" :aria-describedby="field.describedBy">
            </UiField>
            <div class="actions">
              <UiButton variant="primary" :loading="busy" :disabled="password.length < 8" @click="changePassword"><template #icon><KeyRound/></template>Modifier le mot de passe</UiButton>
            </div>
          </template>
          <p v-else class="hint">Ce compte n'est pas lié à un utilisateur Plex : le mot de passe se change depuis l'assistant de configuration initial.</p>
        </SettingsCard>

        <template v-if="canManageSecurity">
          <SettingsCard title="Double authentification" subtitle="Exige un code temporaire (TOTP) en plus du mot de passe à la connexion." :icon="ShieldCheck" :status="totpEnabled ? 'active' : 'inactive'" :collapsible="false">
            <template v-if="totpEnabled">
              <p class="hint">La double authentification est active sur ce compte. La désactiver supprime cette protection supplémentaire.</p>
              <div class="actions">
                <UiButton variant="danger" :loading="busy" @click="disableTotp"><template #icon><ShieldCheck/></template>Désactiver le TOTP</UiButton>
              </div>
            </template>
            <template v-else-if="totpSecret">
              <p class="hint">Scanne ce QR code dans ton application d'authentification (Google Authenticator, Authy, Bitwarden...), puis saisis le code à 6 chiffres qu'elle affiche pour confirmer l'activation.</p>
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
              <p class="hint">Non configurée — n'importe qui connaissant ton mot de passe peut se connecter. Recommandé pour un compte administrateur.</p>
              <div class="actions">
                <UiButton :loading="busy" @click="setupTotp"><template #icon><ShieldCheck/></template>Configurer</UiButton>
              </div>
            </template>
          </SettingsCard>

          <SettingsCard title="Passkeys" subtitle="Connexion sans mot de passe via l'empreinte, le visage ou une clé de sécurité de l'appareil." :icon="Fingerprint" :status="passkeys.length ? 'active' : 'inactive'" :collapsible="false">
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
          </SettingsCard>
        </template>

        <SettingsCard
          title="Application Mobile (PWA)"
          subtitle="Installez Watchdeck sur votre smartphone ou bureau pour un accès plein écran rapide."
          :icon="Smartphone"
          :status="isInstalled ? 'active' : 'inactive'"
          :collapsible="false"
        >
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
        </SettingsCard>

        <p v-if="!canManageSecurity" class="hint">La double authentification et les passkeys nécessitent un compte lié à un utilisateur Plex.</p>
      </div>
    </div>
  </PageShell>
</template>

<script setup>
import { formatDate } from '@/utils/format';
import { onMounted, computed, ref } from 'vue';
import { Fingerprint, KeyRound, ShieldCheck, UserRound, Smartphone, Download, Trash2 } from '@lucide/vue';
import QRCode from 'qrcode';
import { api } from '@/api';
import SettingsCard from '@/components/settings/SettingsCard.vue';
import { usePwaInstall } from '@/composables/usePwaInstall';
import UiField from '@/components/ui/UiField.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';

const { canInstall, isInstalled, isIos, promptInstall } = usePwaInstall();
const showIosGuide = ref(false);

const identity = ref(null);
const password = ref('');
const totpEnabled = ref(false);
const totpSecret = ref('');
const totpCode = ref('');
const totpQr = ref('');
const passkeys = ref([]);
const busy = ref(false);
const error = ref('');
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

function notify(text) { message.value = text; error.value = ''; }

async function load() {
  try {
    const session = await api('/api/session');
    identity.value = session?.id ? await api(`/api/users/${session.id}`) : session;
    totpEnabled.value = Boolean(identity.value?.totp_enabled);
  } catch (e) { error.value = e.message; }
  await loadPasskeys();
}

async function loadPasskeys() {
  if (!identity.value?.id) return;
  try { passkeys.value = await api(`/api/users/${identity.value.id}/passkeys`); }
  catch (e) { error.value = e.message; }
}

async function changePassword() {
  busy.value = true;
  try {
    await api(`/api/users/${identity.value.id}/password`, { method: 'POST', body: JSON.stringify({ password: password.value }) });
    password.value = '';
    notify('Mot de passe modifié.');
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}

async function setupTotp() {
  busy.value = true;
  try {
    const data = await api(`/api/users/${identity.value.id}/totp/setup`, { method: 'POST' });
    totpSecret.value = data.secret;
    totpQr.value = await QRCode.toDataURL(data.uri, { width: 220, margin: 1 });
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}

function cancelTotpSetup() {
  totpSecret.value = '';
  totpCode.value = '';
  totpQr.value = '';
}

async function enableTotp() {
  busy.value = true;
  try {
    await api(`/api/users/${identity.value.id}/totp/enable`, { method: 'POST', body: JSON.stringify({ code: totpCode.value }) });
    cancelTotpSetup();
    totpEnabled.value = true;
    notify('Double authentification activée.');
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}

async function disableTotp() {
  busy.value = true;
  try {
    await api(`/api/users/${identity.value.id}/totp`, { method: 'DELETE' });
    totpEnabled.value = false;
    notify('Double authentification désactivée.');
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}

async function deletePasskey(key) {
  try {
    await api(`/api/users/${identity.value.id}/passkeys/${encodeURIComponent(key.credential_id)}`, { method: 'DELETE' });
    await loadPasskeys();
  } catch (e) { error.value = e.message; }
}

function decode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, char => char.charCodeAt(0)).buffer;
}
function encode(value) {
  const bytes = new Uint8Array(value);
  let binary = '';
  bytes.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function registerPasskey() {
  busy.value = true;
  error.value = '';
  try {
    const options = await api('/api/users/webauthn/register/options', { method: 'POST', body: JSON.stringify({ user_id: identity.value.id }) });
    options.challenge = decode(options.challenge);
    options.user.id = decode(options.user.id);
    options.excludeCredentials = (options.excludeCredentials || []).map(entry => ({ ...entry, id: decode(entry.id) }));
    const credential = await navigator.credentials.create({ publicKey: options });
    const payload = credential.toJSON ? credential.toJSON() : {
      id: credential.id,
      rawId: encode(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: encode(credential.response.clientDataJSON),
        attestationObject: encode(credential.response.attestationObject),
      },
      clientExtensionResults: credential.getClientExtensionResults(),
    };
    const name = prompt('Nom de la passkey', 'Passkey') || 'Passkey';
    await api('/api/users/webauthn/register/verify', { method: 'POST', body: JSON.stringify({ user_id: identity.value.id, credential: payload, name }) });
    await loadPasskeys();
    notify('Passkey enregistrée.');
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}

onMounted(load);
</script>

<style scoped lang="scss">
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
