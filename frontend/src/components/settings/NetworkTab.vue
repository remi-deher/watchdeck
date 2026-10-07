<template>
  <div class="settings-rows">
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

    <SettingsSection
      title="Langue"
      subtitle="Langue de l'interface pour qui n'a pas choisi la sienne."
      status="active"
    >
      <SettingsRow
        label="Langue par défaut"
        description="Appliquée aux nouveaux comptes et aux pages publiques. Chaque utilisateur peut ensuite choisir la sienne."
      >
        <UiSelect v-model="locale" :options="LOCALE_OPTIONS" aria-label="Langue par défaut" />
      </SettingsRow>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { RefreshCw } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import { api } from '@/api';
import { form } from '@/settingsForm';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';

/* Les langues que le serveur sait servir (`SUPPORTED_LOCALES`, app/i18n.py). */
const LOCALE_OPTIONS = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];
// Sans choix enregistre, le serveur retombe sur le francais : on l'affiche tel quel.
const locale = computed({
  get: () => form.default_locale || 'fr',
  set: (value: string) => { form.default_locale = value; },
});

const clientIpQuery = useQuery({
  queryKey: ['settings', 'client-ip'],
  queryFn: () => api<{ connection_ip: string | null; client_ip: string; forwarded_for: string | null }>('/api/settings/client-ip').catch(() => null),
});
const clientIp = computed(() => clientIpQuery.data.value);
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
</style>
