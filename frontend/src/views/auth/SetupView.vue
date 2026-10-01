<template>
  <AuthLayout :title="step === 'welcome' ? 'Bienvenue !' : 'Créer votre compte administrateur'" :subtitle="step === 'welcome' ? 'Première connexion détectée : créons votre compte administrateur.' : ''">
    <template #before>
      <ol class="setup-steps" aria-label="Étapes">
        <li :class="step === 'welcome' ? 'is-active' : 'is-done'" :aria-current="step === 'welcome' ? 'step' : undefined">1</li>
        <li :class="{ 'is-active': step === 'account' }" :aria-current="step === 'account' ? 'step' : undefined">2</li>
        <li><Check aria-hidden="true" /><span class="sr-only">Terminé</span></li>
      </ol>
    </template>

    <template v-if="step === 'welcome'">
      <ul class="setup-features">
        <li><ShieldCheck aria-hidden="true" />Accès sécurisé par mot de passe</li>
        <li><Clapperboard aria-hidden="true" />Watchlists Plex et gestion de bibliothèque</li>
        <li><Server aria-hidden="true" />Orchestration Sonarr / Radarr / Seerr</li>
        <li><Bell aria-hidden="true" />Notifications automatiques</li>
      </ul>
      <UiButton variant="primary" class="setup-full" @click="step = 'account'">
        Commencer la configuration
        <template #trailing><ArrowRight aria-hidden="true" /></template>
      </UiButton>
      <UiButton variant="ghost" class="setup-full" :aria-expanded="restoreOpen" aria-controls="setup-restore" @click="restoreOpen = !restoreOpen">
        <template #icon><UploadCloud aria-hidden="true" /></template>
        Restaurer une sauvegarde à la place
      </UiButton>
      <div v-if="restoreOpen" id="setup-restore" class="setup-restore">
        <p>
          Archive complète produite par Réglages → Données → Reprise après sinistre (dump PostgreSQL,
          clé de chiffrement et configuration). Le compte administrateur de la sauvegarde revient tel
          quel : ne créez pas de compte ici, connectez-vous ensuite avec les identifiants d'origine.
        </p>
        <UiField label="Code d'installation" :hint="setupCodeHint" v-slot="{ id }">
          <input :id="id" v-model="setupCode" type="text" name="setup_code" autocomplete="off" spellcheck="false" placeholder="ex. 1A2B-3C4D-5E6F">
        </UiField>
        <UiField label="Archive de sauvegarde (.zip)" v-slot="{ id }">
          <input :id="id" type="file" accept=".zip" @change="onRestoreFile">
        </UiField>
        <UiFeedback v-if="restoreMessage" :type="restoreState" :message="restoreMessage" />
        <UiButton variant="danger" class="setup-full" :loading="restoreState === 'loading'" :disabled="restoreState === 'success'" @click="submitRestore">
          <template #icon><ShieldAlert aria-hidden="true" /></template>
          Restaurer et redémarrer
        </UiButton>
      </div>
    </template>

    <form v-else class="setup-form" autocomplete="off" novalidate @submit.prevent="submitAccount">
      <UiFeedback v-if="error" type="error" :message="error" />
      <UiField label="Code d'installation" :hint="setupCodeHint" v-slot="{ id }">
        <input :id="id" v-model="setupCode" type="text" name="setup_code" autocomplete="off" spellcheck="false" placeholder="ex. 1A2B-3C4D-5E6F" required>
      </UiField>
      <UiField label="Nom d'utilisateur" v-slot="{ id }">
        <input :id="id" v-model="username" type="text" name="username" autocomplete="username" placeholder="ex. admin" spellcheck="false" required autofocus>
      </UiField>
      <UiField label="Mot de passe" v-slot="{ id }">
        <PasswordInput :id="id" v-model="password" name="password" autocomplete="new-password" required aria-describedby="setup-strength" />
        <div class="setup-strength" :data-level="strength.level" aria-hidden="true"><span :style="{ width: `${strength.score}%` }" /></div>
        <p id="setup-strength" class="setup-strength__label" :data-level="strength.level">{{ strength.label }}</p>
      </UiField>
      <UiField label="Confirmer le mot de passe" v-slot="{ id }">
        <PasswordInput :id="id" v-model="passwordConfirm" name="password_confirm" autocomplete="new-password" required />
      </UiField>
      <ul class="setup-checks">
        <li v-for="check in checks" :key="check.label" :class="{ 'is-valid': check.ok }">
          <CheckCircle2 v-if="check.ok" aria-hidden="true" /><Circle v-else aria-hidden="true" />
          {{ check.label }}<span class="sr-only">{{ check.ok ? ' (fait)' : ' (à faire)' }}</span>
        </li>
      </ul>
      <UiButton type="submit" variant="primary" class="setup-full" :loading="submitting" :disabled="!formValid">
        <template #icon><UserCheck aria-hidden="true" /></template>
        Créer le compte
      </UiButton>
      <UiButton variant="ghost" class="setup-full" @click="step = 'welcome'">
        <template #icon><ArrowLeft aria-hidden="true" /></template>
        Retour
      </UiButton>
    </form>
  </AuthLayout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ArrowLeft, ArrowRight, Bell, Check, CheckCircle2, Circle, Clapperboard, Server, ShieldAlert, ShieldCheck,
  UploadCloud, UserCheck,
} from '@lucide/vue';
import { api } from '@/api';
import AuthLayout from '@/components/auth/AuthLayout.vue';
import PasswordInput from '@/components/auth/PasswordInput.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiField from '@/components/ui/UiField.vue';
import { passwordStrength } from '@/utils/passwordStrength';

const RESTART_REDIRECT_MS = 8000;

const step = ref<'welcome' | 'account'>('welcome');
/* Code ecrit dans les journaux du conteneur au demarrage : prouve que la personne qui
   installe a la main sur le serveur, et pas seulement acces a la page. */
const setupCode = ref('');
const setupCodeHint = "Affiché dans les journaux du conteneur (docker logs watchdeck-api) et dans data/.setup_code.";
const username = ref('');
const password = ref('');
const passwordConfirm = ref('');
const error = ref('');
const submitting = ref(false);

const strength = computed(() => passwordStrength(password.value));
const checks = computed(() => [
  { label: 'Au moins 8 caractères', ok: password.value.length >= 8 },
  { label: 'Les mots de passe correspondent', ok: passwordConfirm.value.length > 0 && password.value === passwordConfirm.value },
  { label: "Nom d'utilisateur renseigné", ok: username.value.trim().length > 0 },
  { label: "Code d'installation saisi", ok: setupCode.value.trim().length > 0 },
]);
const formValid = computed(() => checks.value.every((check) => check.ok));

async function submitAccount(): Promise<void> {
  if (!formValid.value) return;
  error.value = '';
  submitting.value = true;
  try {
    const result = await api<{ redirect: string }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({
        username: username.value,
        password: password.value,
        password_confirm: passwordConfirm.value,
        setup_code: setupCode.value.trim(),
      }),
    });
    // Rechargement complet : le shell doit demarrer avec la session qui vient d'etre ouverte.
    window.location.assign(result.redirect || '/');
  } catch (e: any) {
    error.value = e.message;
    submitting.value = false;
  }
}

const restoreOpen = ref(false);
const restoreFile = ref<File | null>(null);
const restoreState = ref<'info' | 'loading' | 'success' | 'error'>('info');
const restoreMessage = ref('');

function onRestoreFile(event: Event): void {
  restoreFile.value = (event.target as HTMLInputElement).files?.[0] ?? null;
  restoreMessage.value = '';
}

async function submitRestore(): Promise<void> {
  if (!restoreFile.value) {
    restoreState.value = 'error';
    restoreMessage.value = 'Sélectionnez une archive .zip.';
    return;
  }
  restoreState.value = 'loading';
  restoreMessage.value = 'Restauration en cours…';
  const body = new FormData();
  body.append('file', restoreFile.value);
  body.append('setup_code', setupCode.value.trim());
  try {
    // fetch direct : le corps multipart doit garder l'en-tete Content-Type pose par le navigateur.
    const response = await fetch('/api/auth/setup/restore', { method: 'POST', credentials: 'same-origin', body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
    restoreState.value = 'success';
    restoreMessage.value = "Restauration terminée, l'application redémarre. Redirection dans quelques secondes…";
    window.setTimeout(() => window.location.assign('/login'), RESTART_REDIRECT_MS);
  } catch (e: any) {
    restoreState.value = 'error';
    restoreMessage.value = e.message || 'Échec de la restauration.';
  }
}
</script>

<style scoped lang="scss">
.setup-steps { display: flex; align-items: center; justify-content: center; margin: 0 0 var(--space-5); padding: 0; list-style: none; }
.setup-steps li {
  position: relative;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--surface);
  color: var(--muted);
  font-size: var(--fs-sm);
  font-weight: 700;
  svg { width: 16px; height: 16px; }
}
.setup-steps li + li { margin-left: var(--space-6); }
.setup-steps li + li::before { content: ''; position: absolute; top: 50%; right: 100%; width: var(--space-6); height: 1px; background: var(--border); }
.setup-steps li.is-active { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }
.setup-steps li.is-done { border-color: var(--accent); color: var(--accent); }
.setup-features { display: grid; gap: var(--space-3); margin: 0; padding: 0; list-style: none; font-size: var(--fs-sm); }
.setup-features li { display: flex; align-items: center; gap: var(--space-3); }
.setup-features svg { flex: none; width: 18px; height: 18px; color: var(--accent); }
.setup-full { width: 100%; }
.setup-restore { display: grid; gap: var(--space-3); }
.setup-restore p { margin: 0; color: var(--muted); font-size: var(--fs-sm); line-height: 1.5; }
.setup-form { display: grid; gap: var(--space-4); }
.setup-form input { width: 100%; }
.setup-strength { height: 4px; overflow: hidden; border-radius: var(--radius-pill); background: var(--surface-3); }
.setup-strength span { display: block; height: 100%; background: var(--muted); transition: width var(--motion-duration-fast) var(--motion-ease-standard); }
.setup-strength[data-level="weak"] span { background: var(--red); }
.setup-strength[data-level="fair"] span { background: var(--amber); }
.setup-strength[data-level="good"] span { background: var(--accent); }
.setup-strength[data-level="strong"] span { background: var(--green); }
.setup-strength__label { margin: 0; color: var(--muted); font-size: var(--fs-xs); }
.setup-strength__label[data-level="weak"] { color: var(--red-text); }
.setup-strength__label[data-level="fair"] { color: var(--amber-text); }
.setup-strength__label[data-level="strong"] { color: var(--green-text); }
.setup-checks { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; color: var(--muted); font-size: var(--fs-sm); }
.setup-checks li { display: flex; align-items: center; gap: var(--space-2); }
.setup-checks svg { flex: none; width: 16px; height: 16px; }
.setup-checks li.is-valid { color: var(--green-text); }
</style>
