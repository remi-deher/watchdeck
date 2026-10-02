<template>
  <div class="profile-security">
    <div class="profile-security__score">
      <strong>Protection du compte</strong>
      <span>{{ score.done }} sur {{ score.total }}</span>
    </div>
    <UiProgress :value="score.done" :max="score.total || 1" label="Protection du compte" />

    <ul class="profile-checks">
      <li v-for="check in checks" :key="check.key" class="profile-check">
        <span class="profile-check__mark" :class="check.ok ? 'is-ok' : 'is-todo'" aria-hidden="true">
          <Check v-if="check.ok" /><span v-else>!</span>
        </span>
        <div class="profile-check__text">
          <strong>{{ check.label }}</strong>
          <small>{{ check.detail }}</small>
        </div>
        <div class="profile-check__actions">
          <template v-if="check.key === 'login'">
            <UiButton @click="openPassword">{{ account.has_local_password ? 'Changer…' : 'Définir un mot de passe…' }}</UiButton>
          </template>
          <template v-else-if="check.key === 'totp'">
            <UiButton v-if="account.totp_enabled" variant="ghost" @click="totpDisableOpen = true">Désactiver…</UiButton>
            <UiButton v-else variant="primary" @click="openTotpSetup">Activer</UiButton>
          </template>
          <template v-else-if="check.key === 'passkey'">
            <UiButton :variant="check.ok ? 'secondary' : 'primary'" :disabled="!webAuthnAvailable" @click="openPasskey">
              <template #icon><Plus /></template>Ajouter
            </UiButton>
          </template>
        </div>
      </li>
    </ul>
    <p v-if="!webAuthnAvailable" class="profile-hint">Ce navigateur ne prend pas en charge les passkeys (WebAuthn).</p>

    <ul v-if="passkeys.length" class="profile-passkeys" aria-label="Passkeys enregistrées">
      <li v-for="key in passkeys" :key="key.credential_id">
        <KeyRound aria-hidden="true" />
        <div>
          <strong>{{ key.name }}</strong>
          <small>Ajoutée le {{ formatDate(key.created_at) }}</small>
        </div>
        <UiButton variant="ghost" size="sm" @click="askDeletePasskey(key)">Supprimer</UiButton>
      </li>
    </ul>

    <h3 class="profile-subtitle">Sessions</h3>
    <div class="profile-check">
      <span class="profile-check__mark is-neutral" aria-hidden="true"><MonitorSmartphone /></span>
      <div class="profile-check__text">
        <strong>Ce navigateur</strong>
        <small>Vos autres appareils restent connectés jusqu'à ce que vous les déconnectiez.</small>
      </div>
      <div class="profile-check__actions">
        <UiButton :loading="revokeMutation.isPending.value" @click="askRevokeOthers">Déconnecter les autres appareils</UiButton>
      </div>
    </div>

    <!-- Mot de passe -->
    <ModalShell :open="passwordOpen" :title="account.has_local_password ? 'Changer le mot de passe' : 'Définir un mot de passe'" :error="modalError" :busy="busy" @close="passwordOpen = false">
      <form class="profile-form" @submit.prevent="changePassword">
        <UiField v-if="account.has_local_password" label="Mot de passe actuel" v-slot="field">
          <input :id="field.id" v-model="currentPassword" type="password" autocomplete="current-password">
        </UiField>
        <UiField v-else-if="account.totp_enabled" label="Code à 6 chiffres" hint="Pour confirmer qu'il s'agit bien de vous." v-slot="field">
          <input :id="field.id" v-model="passwordOtp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456" :aria-describedby="field.describedBy">
        </UiField>
        <UiField label="Nouveau mot de passe" hint="Au moins 8 caractères. Vos autres appareils seront déconnectés." v-slot="field">
          <input :id="field.id" v-model="newPassword" type="password" minlength="8" autocomplete="new-password" :aria-describedby="field.describedBy">
        </UiField>
      </form>
      <template #actions>
        <UiButton :disabled="busy" @click="passwordOpen = false">Annuler</UiButton>
        <UiButton variant="primary" :loading="passwordMutation.isPending.value" :disabled="newPassword.length < 8" @click="changePassword">Enregistrer</UiButton>
      </template>
    </ModalShell>

    <!-- Activation de la 2FA -->
    <ModalShell :open="totpSetupOpen" title="Activer la double authentification" subtitle="Trois étapes, environ une minute." :error="modalError" :busy="busy" @close="closeTotpSetup">
      <ol class="profile-steps">
        <li>Ouvrez votre application d'authentification (Google Authenticator, Bitwarden, 1Password…).</li>
        <li>Scannez ce QR code.</li>
        <li>Saisissez le code à 6 chiffres qu'elle affiche.</li>
      </ol>
      <img v-if="totpQr" :src="totpQr" class="profile-qr" alt="QR code de double authentification">
      <UiDisclosure v-if="totpSecret" title="Impossible de scanner ? Afficher la clé à saisir">
        <code class="profile-secret">{{ totpSecret }}</code>
      </UiDisclosure>
      <UiField label="Code à 6 chiffres" v-slot="field">
        <input :id="field.id" v-model="totpCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456">
      </UiField>
      <template #actions>
        <UiButton :disabled="busy" @click="closeTotpSetup">Annuler</UiButton>
        <UiButton variant="primary" :loading="enableTotpMutation.isPending.value" :disabled="totpCode.length !== 6" @click="enableTotp">Activer</UiButton>
      </template>
    </ModalShell>

    <!-- Desactivation de la 2FA -->
    <ModalShell :open="totpDisableOpen" title="Désactiver la double authentification" subtitle="Le mot de passe suffira de nouveau pour se connecter." :error="modalError" :busy="busy" @close="totpDisableOpen = false">
      <UiField label="Code à 6 chiffres" hint="Un code actuel de votre application, pour confirmer." v-slot="field">
        <input :id="field.id" v-model="totpDisableCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456" :aria-describedby="field.describedBy">
      </UiField>
      <template #actions>
        <UiButton :disabled="busy" @click="totpDisableOpen = false">Annuler</UiButton>
        <UiButton variant="danger" :loading="disableTotpMutation.isPending.value" :disabled="totpDisableCode.length !== 6" @click="disableTotp">Désactiver</UiButton>
      </template>
    </ModalShell>

    <!-- Nouvelle passkey -->
    <ModalShell :open="passkeyOpen" title="Ajouter une passkey" subtitle="Votre navigateur va demander votre empreinte, votre visage ou votre clé de sécurité." :error="modalError" :busy="busy" @close="passkeyOpen = false">
      <UiField label="Nom" hint="Pour la reconnaître dans la liste : « iPhone », « 1Password »…" v-slot="field">
        <input :id="field.id" v-model="passkeyName" maxlength="60" :aria-describedby="field.describedBy" @keydown.enter.prevent="registerPasskey">
      </UiField>
      <template #actions>
        <UiButton :disabled="busy" @click="passkeyOpen = false">Annuler</UiButton>
        <UiButton variant="primary" :loading="registerPasskeyMutation.isPending.value" @click="registerPasskey"><template #icon><Fingerprint /></template>Continuer</UiButton>
      </template>
    </ModalShell>

    <ConfirmModal v-bind="confirmDialog" :busy="busy" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Check, Fingerprint, KeyRound, MonitorSmartphone, Plus } from '@lucide/vue';
import QRCode from 'qrcode';
import { api } from '@/api';
import { formatDate } from '@/utils/format';
import { base64UrlToBuffer, bufferToBase64Url } from '@/utils/webauthn';
import { useConfirm } from '@/composables/useConfirm';
import ConfirmModal from '@/components/ConfirmModal.vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDisclosure from '@/components/ui/UiDisclosure.vue';
import UiField from '@/components/ui/UiField.vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import { securityChecks, securityScore, type ProfileAccount } from './profileSecurity';

interface Passkey { credential_id: string; name: string; created_at?: string | null }

const props = defineProps<{ account: ProfileAccount & { id: number } }>();
const emit = defineEmits<{ (e: 'notify', message: string): void }>();

const queryClient = useQueryClient();
const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
const webAuthnAvailable = Boolean(window.PublicKeyCredential && navigator.credentials);

const checks = computed(() => securityChecks(props.account));
const score = computed(() => securityScore(checks.value));

const passkeysQuery = useQuery({
  queryKey: computed(() => ['users', 'passkeys', props.account.id]),
  queryFn: () => api<Passkey[]>(`/api/users/${props.account.id}/passkeys`),
});
const passkeys = computed(() => passkeysQuery.data.value || []);

const modalError = ref('');
const passwordOpen = ref(false);
const currentPassword = ref('');
const passwordOtp = ref('');
const newPassword = ref('');
const totpSetupOpen = ref(false);
const totpSecret = ref('');
const totpQr = ref('');
const totpCode = ref('');
const totpDisableOpen = ref(false);
const totpDisableCode = ref('');
const passkeyOpen = ref(false);
const passkeyName = ref('');

const refreshAccount = () => queryClient.invalidateQueries({ queryKey: ['me'] });
const refreshPasskeys = () => Promise.all([
  queryClient.invalidateQueries({ queryKey: ['users', 'passkeys', props.account.id] }),
  refreshAccount(),
]);

const passwordMutation = useMutation({
  retry: 0,
  mutationFn: () => api(`/api/users/${props.account.id}/password`, {
    method: 'POST',
    body: JSON.stringify({ password: newPassword.value, current_password: currentPassword.value, otp_code: passwordOtp.value }),
  }),
  onSuccess: refreshAccount,
});
const setupTotpMutation = useMutation({ retry: 0, gcTime: 0, mutationFn: () => api<{ secret: string; uri: string }>(`/api/users/${props.account.id}/totp/setup`, { method: 'POST' }) });
const enableTotpMutation = useMutation({
  retry: 0,
  mutationFn: () => api(`/api/users/${props.account.id}/totp/enable`, { method: 'POST', body: JSON.stringify({ code: totpCode.value }) }),
  onSuccess: refreshAccount,
});
const disableTotpMutation = useMutation({
  retry: 0,
  mutationFn: () => api(`/api/users/${props.account.id}/totp`, { method: 'DELETE', body: JSON.stringify({ code: totpDisableCode.value }) }),
  onSuccess: refreshAccount,
});
const deletePasskeyMutation = useMutation({
  retry: 0,
  mutationFn: (key: Passkey) => api(`/api/users/${props.account.id}/passkeys/${encodeURIComponent(key.credential_id)}`, { method: 'DELETE' }),
  onSuccess: refreshPasskeys,
});
const revokeMutation = useMutation({ retry: 0, mutationFn: () => api('/api/me/sessions/revoke-others', { method: 'POST' }) });
const registerPasskeyMutation = useMutation({
  retry: 0,
  mutationFn: async () => {
    const options = await api<any>('/api/users/webauthn/register/options', { method: 'POST', body: JSON.stringify({ user_id: props.account.id }) });
    options.challenge = base64UrlToBuffer(options.challenge);
    options.user.id = base64UrlToBuffer(options.user.id);
    options.excludeCredentials = (options.excludeCredentials || []).map((entry: any) => ({ ...entry, id: base64UrlToBuffer(entry.id) }));
    const credential = await navigator.credentials.create({ publicKey: options }) as any;
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
    await api('/api/users/webauthn/register/verify', {
      method: 'POST',
      body: JSON.stringify({ user_id: props.account.id, credential: payload, name: passkeyName.value.trim() || 'Passkey' }),
    });
  },
  onSuccess: refreshPasskeys,
});

const busy = computed(() => [passwordMutation, setupTotpMutation, enableTotpMutation, disableTotpMutation, deletePasskeyMutation, registerPasskeyMutation, revokeMutation]
  .some((m) => m.isPending.value));

function message(e: unknown): string { return e instanceof Error ? e.message : String(e); }

function openPassword() {
  modalError.value = '';
  currentPassword.value = '';
  passwordOtp.value = '';
  newPassword.value = '';
  passwordOpen.value = true;
}

async function changePassword() {
  if (newPassword.value.length < 8) return;
  modalError.value = '';
  try {
    await passwordMutation.mutateAsync();
    passwordOpen.value = false;
    emit('notify', 'Mot de passe enregistré. Vos autres appareils ont été déconnectés.');
  } catch (e) { modalError.value = message(e); }
}

async function openTotpSetup() {
  modalError.value = '';
  totpCode.value = '';
  totpSetupOpen.value = true;
  try {
    const data = await setupTotpMutation.mutateAsync();
    totpSecret.value = data.secret;
    totpQr.value = await QRCode.toDataURL(data.uri, { width: 220, margin: 1 });
  } catch (e) { modalError.value = message(e); } finally { setupTotpMutation.reset(); }
}

function closeTotpSetup() {
  totpSetupOpen.value = false;
  totpSecret.value = '';
  totpQr.value = '';
  totpCode.value = '';
}

async function enableTotp() {
  modalError.value = '';
  try {
    await enableTotpMutation.mutateAsync();
    closeTotpSetup();
    emit('notify', 'Double authentification activée.');
  } catch (e) { modalError.value = message(e); }
}

async function disableTotp() {
  modalError.value = '';
  try {
    await disableTotpMutation.mutateAsync();
    totpDisableOpen.value = false;
    totpDisableCode.value = '';
    emit('notify', 'Double authentification désactivée.');
  } catch (e) { modalError.value = message(e); }
}

function openPasskey() {
  modalError.value = '';
  passkeyName.value = '';
  passkeyOpen.value = true;
}

async function registerPasskey() {
  modalError.value = '';
  try {
    await registerPasskeyMutation.mutateAsync();
    passkeyOpen.value = false;
    emit('notify', 'Passkey enregistrée.');
  } catch (e) { modalError.value = message(e); }
}

async function askDeletePasskey(key: Passkey) {
  const ok = await askConfirm({
    title: `Supprimer « ${key.name} » ?`,
    message: 'Vous ne pourrez plus vous connecter avec cette passkey.',
    confirmLabel: 'Supprimer',
    danger: true,
  });
  if (!ok) return;
  try {
    await deletePasskeyMutation.mutateAsync(key);
    emit('notify', 'Passkey supprimée.');
  } catch (e) { emit('notify', message(e)); }
}

async function askRevokeOthers() {
  const ok = await askConfirm({
    title: 'Déconnecter vos autres appareils ?',
    message: 'Ce navigateur reste connecté. Les autres devront se reconnecter.',
    confirmLabel: 'Déconnecter',
  });
  if (!ok) return;
  try {
    await revokeMutation.mutateAsync();
    emit('notify', 'Vos autres appareils ont été déconnectés.');
  } catch (e) { emit('notify', message(e)); }
}
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.profile-security { max-width: 780px; }
.profile-security__score { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: var(--space-2); }
.profile-security__score strong { font-size: var(--fs-md); }
.profile-security__score span { color: var(--muted); font-size: var(--fs-xs); }
.profile-checks { list-style: none; margin: var(--space-3) 0 0; padding: 0; }
.profile-check { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: var(--space-3); align-items: center; padding: 14px 0; border-bottom: 1px solid var(--border); }
.profile-checks .profile-check:last-child { border-bottom: 0; }
.profile-check__mark { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; font-weight: 700; font-size: var(--fs-sm); }
.profile-check__mark svg { width: 15px; height: 15px; }
.profile-check__mark.is-ok { background: color-mix(in srgb, var(--green) 16%, transparent); color: var(--green-text, var(--green)); }
.profile-check__mark.is-todo { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); }
.profile-check__mark.is-neutral { background: var(--surface-2); color: var(--muted); }
.profile-check__text strong { display: block; font-size: var(--fs-sm); }
.profile-check__text small { display: block; margin-top: 2px; color: var(--muted); font-size: var(--fs-xs); line-height: 1.45; }
.profile-check__actions { display: flex; gap: var(--space-2); }
.profile-hint { color: var(--muted); font-size: var(--fs-xs); }
.profile-passkeys { list-style: none; margin: 0 0 0 40px; padding: 0; border: 1px solid var(--border); border-radius: var(--inset-radius); }
.profile-passkeys li { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: var(--space-3); align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--border); }
.profile-passkeys li:last-child { border-bottom: 0; }
.profile-passkeys svg { width: 16px; height: 16px; color: var(--muted); }
.profile-passkeys strong { display: block; font-size: var(--fs-sm); }
.profile-passkeys small { color: var(--muted); font-size: var(--fs-xs); }
.profile-subtitle { margin: var(--space-5) 0 0; padding-bottom: var(--space-2); border-bottom: 1px solid var(--border); color: var(--muted); font-size: var(--fs-xs); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.profile-form { display: grid; gap: var(--space-3); }
.profile-steps { margin: 0 0 var(--space-3); padding-left: 1.2em; display: grid; gap: 6px; font-size: var(--fs-sm); line-height: 1.45; }
.profile-qr { display: block; width: 180px; height: 180px; margin: 0 0 var(--space-3); border-radius: var(--radius-sm); background: #fff; }
.profile-secret { word-break: break-all; }

@include bp.until(phablet) {
  .profile-check { grid-template-columns: 28px minmax(0, 1fr); }
  .profile-check__actions { grid-column: 2; }
  .profile-passkeys { margin-left: 0; }
}
</style>
