<template>
  <div class="settings-rows">
    <!-- Le verdict avant le détail : l'instance est-elle exposée correctement ? -->
    <section class="security-verdict" :class="warnCount ? 'is-warn' : 'is-good'" aria-labelledby="security-verdict-title">
      <h3 id="security-verdict-title">{{ warnCount ? `${warnCount} point${warnCount > 1 ? 's' : ''} à vérifier` : 'Instance correctement protégée' }}</h3>
      <p>{{ warnCount ? warnLabels : 'Adresse publique, proxies, jeton API et double authentification sont en ordre.' }}</p>
    </section>

    <SettingsItemList title="Contrôles">
      <SettingsItem
        v-for="check in checks"
        :key="check.key"
        :title="check.label"
        :subtitle="check.detail"
        :status="check.state === 'ok' ? 'active' : 'error'"
        :status-text="check.badge"
      >
        <template #actions>
          <UiButton size="sm" :variant="check.state === 'warn' ? 'primary' : 'secondary'" :to="check.action.to" :href="check.action.href">{{ check.action.label }}</UiButton>
        </template>
      </SettingsItem>
    </SettingsItemList>

    <SettingsSection
      title="Adresse publique"
      subtitle="L'adresse sous laquelle les utilisateurs atteignent Watchdeck depuis l'extérieur."
      :status="form.public_base_url ? 'active' : 'inactive'"
    >
      <SettingsRow
        label="URL publique de l'application"
        description="Utilisée pour le lien vers la politique de confidentialité dans le pied de page des emails ; laisser vide pour ne pas l'afficher."
        label-for="public-base-url"
      >
        <input id="public-base-url" v-model="form.public_base_url" type="url" placeholder="https://watchdeck.mondomaine.fr" autocomplete="off" spellcheck="false">
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      title="Reverse-proxy"
      subtitle="Adresse IP réelle des visiteurs derrière Nginx Proxy Manager, Traefik ou Caddy."
      :status="form.trusted_proxies ? 'active' : 'inactive'"
    >
      <SettingsRow
        label="Proxies de confiance"
        description="IP ou réseaux (CIDR) séparés par des virgules. Seules ces adresses peuvent indiquer l'IP du visiteur (X-Forwarded-For) ; sans proxy déclaré, l'anti-bruteforce voit toutes les tentatives venir du proxy. N'indiquez que l'adresse de votre proxy."
        label-for="trusted-proxies"
      >
        <input id="trusted-proxies" v-model="form.trusted_proxies" placeholder="172.16.0.0/12, 192.168.1.10" autocomplete="off" spellcheck="false">
      </SettingsRow>
      <SettingsRow label="IP détectée" :description="clientIpDescription">
        <UiButton @click="clientIpQuery.refetch()" :disabled="clientIpQuery.isFetching.value"><RefreshCw/>Vérifier</UiButton>
      </SettingsRow>
      <p v-if="clientIp?.forwarded_for && clientIp.client_ip === clientIp.connection_ip" class="hint network-hint">
        Votre proxy transmet <code>{{ clientIp.forwarded_for }}</code> : ajoutez <code>{{ clientIp.connection_ip }}</code> aux proxies de confiance puis enregistrez.
      </p>
    </SettingsSection>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { RefreshCw } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import { api } from '@/api';
import { form } from '@/settingsForm';
import { useSession } from '@/composables/useSession';
import SettingsItem from './SettingsItem.vue';
import SettingsItemList from './SettingsItemList.vue';
import { securityCheckRows } from './securityChecks';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';

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
const clientIpDescription = computed(() => {
  const ip = clientIp.value;
  if (!ip) return 'Adresse vue par Watchdeck pour ce navigateur.';
  return `Connexion depuis ${ip.connection_ip || '?'}, IP retenue pour ce navigateur : ${ip.client_ip}.`;
});
</script>

<style scoped lang="scss">
.settings-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.network-hint { margin: 8px 0 0; }
.security-verdict {
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
}
.security-verdict.is-good { border-color: color-mix(in srgb, var(--green) 45%, var(--border)); background: color-mix(in srgb, var(--green) 7%, var(--surface)); }
.security-verdict.is-warn { border-color: color-mix(in srgb, var(--amber) 45%, var(--border)); background: color-mix(in srgb, var(--amber) 7%, var(--surface)); }
.security-verdict h3 { margin: 0 0 2px; font-size: var(--fs-md); }
.security-verdict p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
</style>
