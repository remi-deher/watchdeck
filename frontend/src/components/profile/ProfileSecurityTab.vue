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

    <!-- Les saisies passent par le gabarit Creer (definitions de creations/accountSecurity). -->
    <CreateTemplate :open="passwordOpen" :definition="passwordDefinition" mode="edit" @created="notifyDone" @close="passwordOpen = false" />
    <CreateTemplate :open="totpSetupOpen" :definition="totpSetupDefinition" mode="edit" @created="notifyDone" @close="totpSetupOpen = false" />
    <CreateTemplate :open="totpDisableOpen" :definition="totpDisableDefinition" mode="edit" @created="notifyDone" @close="totpDisableOpen = false" />
    <CreateTemplate :open="passkeyOpen" :definition="passkeyDefinition" mode="edit" @created="notifyDone" @close="passkeyOpen = false" />

    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Check, KeyRound, MonitorSmartphone, Plus } from '@lucide/vue';
import QRCode from 'qrcode';
import { api } from '@/api';
import { formatDate } from '@/utils/format';
import { base64UrlToBuffer, bufferToBase64Url } from '@/utils/webauthn';
import { useConfirm } from '@/composables/useConfirm';
import ConfirmModal from '@/components/ConfirmModal.vue';
import CreateTemplate from '@/components/templates/CreateTemplate.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import { passkeyForm, passwordForm, totpDisableForm, totpSetupForm, type PasswordDraft } from '@/creations/accountSecurity';
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

const passwordOpen = ref(false);
const totpSetupOpen = ref(false);
const totpDisableOpen = ref(false);
const passkeyOpen = ref(false);

const refreshAccount = () => queryClient.invalidateQueries({ queryKey: ['me'] });
const refreshPasskeys = () => Promise.all([
  queryClient.invalidateQueries({ queryKey: ['users', 'passkeys', props.account.id] }),
  refreshAccount(),
]);

const passwordMutation = useMutation({
  retry: 0,
  mutationFn: (draft: PasswordDraft) => api(`/api/users/${props.account.id}/password`, {
    method: 'POST',
    body: JSON.stringify({ password: draft.newPassword, current_password: draft.currentPassword, otp_code: draft.otpCode }),
  }),
  onSuccess: refreshAccount,
});
const setupTotpMutation = useMutation({ retry: 0, gcTime: 0, mutationFn: () => api<{ secret: string; uri: string }>(`/api/users/${props.account.id}/totp/setup`, { method: 'POST' }) });
const enableTotpMutation = useMutation({
  retry: 0,
  mutationFn: (code: string) => api(`/api/users/${props.account.id}/totp/enable`, { method: 'POST', body: JSON.stringify({ code }) }),
  onSuccess: refreshAccount,
});
const disableTotpMutation = useMutation({
  retry: 0,
  mutationFn: (code: string) => api(`/api/users/${props.account.id}/totp`, { method: 'DELETE', body: JSON.stringify({ code }) }),
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
  mutationFn: async (name: string) => {
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
      body: JSON.stringify({ user_id: props.account.id, credential: payload, name }),
    });
  },
  onSuccess: refreshPasskeys,
});

function message(e: unknown): string { return e instanceof Error ? e.message : String(e); }

const passwordDefinition = computed(() => passwordForm(
  { hasPassword: Boolean(props.account.has_local_password), totpEnabled: Boolean(props.account.totp_enabled) },
  (draft) => passwordMutation.mutateAsync(draft).then(() => undefined),
));
const totpSetupDefinition = totpSetupForm(
  async () => {
    try {
      const data = await setupTotpMutation.mutateAsync();
      return { secret: data.secret, qr: await QRCode.toDataURL(data.uri, { width: 220, margin: 1 }) };
    } finally { setupTotpMutation.reset(); }
  },
  (code) => enableTotpMutation.mutateAsync(code).then(() => undefined),
);
const totpDisableDefinition = totpDisableForm((code) => disableTotpMutation.mutateAsync(code).then(() => undefined));
const passkeyDefinition = passkeyForm((name) => registerPasskeyMutation.mutateAsync(name).then(() => undefined));

const openPassword = () => { passwordOpen.value = true; };
const openTotpSetup = () => { totpSetupOpen.value = true; };
const openPasskey = () => { passkeyOpen.value = true; };
const notifyDone = (result: { message: string }) => emit('notify', result.message);

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

@include bp.until(phablet) {
  .profile-check { grid-template-columns: 28px minmax(0, 1fr); }
  .profile-check__actions { grid-column: 2; }
  .profile-passkeys { margin-left: 0; }
}
</style>
