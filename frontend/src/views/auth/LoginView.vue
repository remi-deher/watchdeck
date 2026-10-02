<template>
  <AuthLayout title="Connexion" subtitle="Connectez-vous pour accéder à Watchdeck">
    <UiFeedback v-if="error" type="error" :message="error" />

    <form class="auth-form" autocomplete="on" @submit.prevent="submitPassword">
      <UiField label="Nom d'utilisateur" v-slot="{ id }">
        <input :id="id" v-model="username" type="text" name="username" autocomplete="username" required autofocus>
      </UiField>
      <UiField label="Mot de passe" v-slot="{ id }">
        <PasswordInput :id="id" v-model="password" name="password" autocomplete="current-password" required />
      </UiField>
      <UiField label="Code 2FA" hint="Uniquement si l'authentification à deux facteurs est activée." v-slot="{ id, describedBy }">
        <input
          :id="id"
          v-model="otpCode"
          type="text"
          name="otp_code"
          autocomplete="one-time-code"
          inputmode="numeric"
          pattern="[0-9 ]{6,12}"
          placeholder="123456"
          :aria-describedby="describedBy"
        >
      </UiField>
      <UiButton type="submit" variant="primary" class="auth-form__submit" :loading="pending === 'password'" :disabled="Boolean(pending)">
        <template #icon><LogIn aria-hidden="true" /></template>
        Se connecter
      </UiButton>
    </form>

    <div class="auth-separator" role="separator"><span>ou</span></div>

    <div class="auth-alternatives">
      <UiButton class="auth-plex" :loading="pending === 'plex'" :disabled="Boolean(pending)" @click="loginWithPlex">
        <template #icon><Clapperboard aria-hidden="true" /></template>
        Se connecter avec Plex
      </UiButton>
      <UiButton v-if="passkeysSupported" :loading="pending === 'passkey'" :disabled="Boolean(pending)" @click="loginWithPasskey">
        <template #icon><Fingerprint aria-hidden="true" /></template>
        Se connecter avec une passkey
      </UiButton>
      <p class="auth-status" role="status" aria-live="polite">{{ status }}</p>
    </div>

    <template #footer>
      Watchdeck · <RouterLink to="/privacy">Politique de confidentialité</RouterLink>
    </template>
  </AuthLayout>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Clapperboard, Fingerprint, LogIn } from '@lucide/vue';
import { api } from '@/api';
import AuthLayout from '@/components/auth/AuthLayout.vue';
import PasswordInput from '@/components/auth/PasswordInput.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiField from '@/components/ui/UiField.vue';
import { safeNextPath } from '@/utils/safeNextPath';
import { base64UrlToBuffer, bufferToBase64Url } from '@/utils/webauthn';

const PLEX_POLL_MS = 2000;
const PLEX_TIMEOUT_MS = 180_000;

const route = useRoute();
const username = ref('');
const password = ref('');
const otpCode = ref('');
const error = ref('');
const status = ref('');
const pending = ref<'' | 'password' | 'plex' | 'passkey'>('');
const passkeysSupported = typeof window !== 'undefined' && 'PublicKeyCredential' in window;
let plexTimer: ReturnType<typeof setInterval> | null = null;

function nextPath(): string {
  return safeNextPath(typeof route.query.next === 'string' ? route.query.next : '/');
}

/* Rechargement complet volontaire : le shell, la session memoisee et le flux temps reel
   repartent de la nouvelle identite plutot que de celle, vide, de la page de connexion. */
function enter(): void {
  status.value = 'Connecté ! Redirection…';
  window.location.assign(nextPath());
}

async function submitPassword(): Promise<void> {
  error.value = '';
  pending.value = 'password';
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: username.value, password: password.value, otp_code: otpCode.value }),
    });
    enter();
  } catch (e: any) {
    error.value = e.message;
    pending.value = '';
  }
}

function stopPlexPolling(): void {
  if (plexTimer) clearInterval(plexTimer);
  plexTimer = null;
}

async function loginWithPlex(): Promise<void> {
  error.value = '';
  pending.value = 'plex';
  status.value = 'Ouverture de Plex…';
  try {
    const { id, auth_url: authUrl } = await api<{ id: number; auth_url: string }>('/api/auth/plex/pin', { method: 'POST' });
    const popup = window.open(authUrl, 'plexAuth', 'width=600,height=720');
    status.value = 'Validez la connexion dans la fenêtre Plex…';
    const startedAt = Date.now();
    plexTimer = setInterval(async () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed > PLEX_TIMEOUT_MS || (popup?.closed && elapsed > 2 * PLEX_POLL_MS)) {
        stopPlexPolling();
        pending.value = '';
        status.value = popup?.closed ? 'Fenêtre Plex fermée.' : 'Délai dépassé.';
        return;
      }
      try {
        const result = await api<{ authenticated: boolean }>(`/api/auth/plex/check/${id}`);
        if (!result?.authenticated) return;
        stopPlexPolling();
        if (popup && !popup.closed) popup.close();
        enter();
      } catch (e: any) {
        // 403 : compte Plex sans acces ; toute autre erreur est un aleas reseau, on reessaie.
        if (e?.status !== 403) return;
        stopPlexPolling();
        pending.value = '';
        status.value = '';
        error.value = e.message;
      }
    }, PLEX_POLL_MS);
  } catch (e: any) {
    pending.value = '';
    status.value = '';
    error.value = e.message;
  }
}

async function loginWithPasskey(): Promise<void> {
  error.value = '';
  pending.value = 'passkey';
  status.value = 'Attente de la passkey…';
  try {
    const options = await api('/api/webauthn/login/options', { method: 'POST' });
    options.challenge = base64UrlToBuffer(options.challenge);
    options.allowCredentials = (options.allowCredentials || []).map((entry: any) => ({ ...entry, id: base64UrlToBuffer(entry.id) }));
    const assertion = await navigator.credentials.get({ publicKey: options }) as PublicKeyCredential;
    const response = assertion.response as AuthenticatorAssertionResponse;
    await api('/api/webauthn/login/verify', {
      method: 'POST',
      body: JSON.stringify({
        id: assertion.id,
        rawId: bufferToBase64Url(assertion.rawId),
        type: assertion.type,
        response: {
          clientDataJSON: bufferToBase64Url(response.clientDataJSON),
          authenticatorData: bufferToBase64Url(response.authenticatorData),
          signature: bufferToBase64Url(response.signature),
          userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : null,
        },
      }),
    });
    enter();
  } catch (e: any) {
    pending.value = '';
    status.value = '';
    error.value = `Passkey : ${e.message}`;
  }
}

onBeforeUnmount(stopPlexPolling);
</script>

<style scoped lang="scss">
.auth-form { display: grid; gap: var(--space-4); }
.auth-form input { width: 100%; }
.auth-form__submit { width: 100%; margin-top: var(--space-2); }
.auth-separator { display: flex; align-items: center; gap: var(--space-3); color: var(--muted); font-size: var(--fs-xs); text-transform: uppercase; }
.auth-separator::before,.auth-separator::after { content: ''; flex: 1; height: 1px; background: var(--border); }
.auth-alternatives { display: grid; gap: var(--space-2); }
.auth-alternatives :deep(.ui-button) { width: 100%; }
/* Seule l'icone porte la couleur Plex : en fond plein, elle se confondait avec l'accent ambre
   du bouton principal, et l'ecran proposait deux actions principales. */
.auth-alternatives :deep(.auth-plex svg) { color: var(--plex); }
.auth-status { margin: 0; color: var(--muted); font-size: var(--fs-sm); text-align: center; }
</style>
