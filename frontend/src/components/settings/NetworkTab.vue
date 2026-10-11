<template>
  <ConfigureTemplate :sections="sections" v-bind="page.bind.value" @save="page.save" @cancel="page.cancel">
    <template #section-verdict>
      <p class="security-verdict" role="status">{{ warnCount ? warnLabels : 'Adresse publique, proxies, jeton API et double authentification sont en ordre.' }}</p>
    </template>

    <template #section-address>
      <ConfigureField
        label="URL publique de l'application"
        help="Utilisée pour le lien vers la politique de confidentialité dans le pied de page des emails ; laisser vide pour ne pas l'afficher."
        for-id="public-base-url"
      >
        <input id="public-base-url" v-model="form.public_base_url" type="url" placeholder="https://watchdeck.mondomaine.fr" autocomplete="off" spellcheck="false">
      </ConfigureField>
    </template>

    <template #section-proxies>
      <ConfigureField
        label="Proxies de confiance"
        help="IP ou réseaux (CIDR) séparés par des virgules. Seules ces adresses peuvent indiquer l'IP du visiteur (X-Forwarded-For) ; sans proxy déclaré, l'anti-bruteforce voit toutes les tentatives venir du proxy. N'indiquez que l'adresse de votre proxy."
        for-id="trusted-proxies"
      >
        <input id="trusted-proxies" v-model="form.trusted_proxies" placeholder="172.16.0.0/12, 192.168.1.10" autocomplete="off" spellcheck="false">
      </ConfigureField>
      <ConfigureField label="IP détectée" :help="clientIpDescription">
        <UiButton @click="clientIpQuery.refetch()" :disabled="clientIpQuery.isFetching.value"><RefreshCw/>Vérifier</UiButton>
      </ConfigureField>
      <p v-if="clientIp?.forwarded_for && clientIp.client_ip === clientIp.connection_ip" class="hint network-hint">
        Votre proxy transmet <code>{{ clientIp.forwarded_for }}</code> : ajoutez <code>{{ clientIp.connection_ip }}</code> aux proxies de confiance puis enregistrez.
      </p>
    </template>

    <template #section-token><ApiTokenTab /></template>

    <template #section-account>
      <ConfigureField :label="totpRow.label" :help="totpRow.detail">
        <UiButton :variant="totpRow.state === 'warn' ? 'primary' : 'secondary'" to="/profile">{{ totpRow.action }}</UiButton>
      </ConfigureField>
    </template>
  </ConfigureTemplate>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { Globe, KeyRound, Network, RefreshCw, ShieldCheck, Smartphone } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import { api } from '@/api';
import { form } from '@/settingsForm';
import { useSession } from '@/composables/useSession';
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';
import { useSettingsPage } from '@/composables/useSettingsPage';
import ApiTokenTab from './ApiTokenTab.vue';
import { securityCheckRows } from './securityChecks';

const page = useSettingsPage();

const clientIpQuery = useQuery({
  queryKey: ['settings', 'client-ip'],
  queryFn: () => api<{ connection_ip: string | null; client_ip: string; forwarded_for: string | null }>('/api/settings/client-ip').catch(() => null),
});
const clientIp = computed(() => clientIpQuery.data.value);
const tokenQuery = useQuery({ queryKey: ['settings', 'api-token'], queryFn: () => api<any>('/api/settings/token').catch(() => ({})) });
// Le compte de l'assistant d'installation n'a pas d'id : rien à demander à /api/me.
const { session } = useSession();
const meQuery = useQuery({
  queryKey: ['me'],
  queryFn: () => api<{ has_local_password?: boolean; totp_enabled?: boolean }>('/api/me'),
  enabled: computed(() => Boolean(session.value?.id)),
});
const checks = computed(() => securityCheckRows({
  publicBaseUrl: String(form.public_base_url || ''),
  trustedProxies: String(form.trusted_proxies || ''),
  clientIp: clientIp.value ?? null,
  tokenActive: Boolean(tokenQuery.data.value?.active),
  account: meQuery.data.value ?? null,
}));
const warnings = computed(() => checks.value.filter((check) => check.state === 'warn'));
const warnCount = computed(() => warnings.value.length);
const warnLabels = computed(() => warnings.value.map((check) => check.label).join(', '));

/* Une section par bloc ; le verdict ouvre la page. `/settings/security/api` ouvre le jeton :
   la page y descend. */
const sections = computed(() => [
  { key: 'verdict', title: warnCount.value ? `${warnCount.value} point${warnCount.value > 1 ? 's' : ''} à vérifier` : 'Instance correctement protégée', description: 'Cette instance est-elle exposée correctement ?', icon: ShieldCheck, keywords: ['sécurité', 'protection'], dirty: false },
  { key: 'address', title: 'Adresse publique', description: 'L\'adresse sous laquelle les utilisateurs atteignent Watchdeck depuis l\'extérieur.', icon: Globe, keywords: ['url', 'domaine', 'https'] },
  { key: 'proxies', title: 'Reverse-proxy', description: 'Adresse IP réelle des visiteurs derrière Nginx Proxy Manager, Traefik ou Caddy.', icon: Network, keywords: ['proxy', 'ip', 'cidr', 'forwarded', 'bruteforce'] },
  { key: 'token', title: 'Jeton API', description: 'Accès à l\'API Watchdeck (création de demandes, lecture des utilisateurs…), à passer en en-tête Authorization: Bearer …', icon: KeyRound, keywords: ['api', 'bearer', 'token', 'curl'] },
  { key: 'account', title: 'Double authentification', description: 'Elle protège la connexion par mot de passe local, et se règle dans votre profil.', icon: Smartphone, keywords: ['2fa', 'totp', 'mot de passe'] },
]);
const route = useRoute();
onMounted(() => {
  if (route.path.endsWith('/api') || route.query.section === 'token') void nextTick(() => document.getElementById('configure-token')?.scrollIntoView({ block: 'start' }));
});
const totpRow = computed(() => {
  const check = checks.value.find((entry) => entry.key === 'totp');
  if (!check) return { label: 'Connexion avec Plex', detail: 'Votre compte se connecte par Plex : la double authentification ne s’applique pas.', action: 'Ouvrir le profil', state: 'ok' };
  return { label: `${check.label} : ${check.badge.toLowerCase()}`, detail: check.detail, action: check.action.label, state: check.state };
});
const clientIpDescription = computed(() => {
  const ip = clientIp.value;
  if (!ip) return 'Adresse vue par Watchdeck pour ce navigateur.';
  return `Connexion depuis ${ip.connection_ip || '?'}, IP retenue pour ce navigateur : ${ip.client_ip}.`;
});
</script>

<style scoped lang="scss">
.network-hint { margin: 8px 0 0; }
.security-verdict { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
</style>
