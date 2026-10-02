<template>
  <AuthLayout title="Politique de confidentialité" wide>
    <p class="privacy-updated">
      Ce document décrit simplement, en langage clair, quelles données sont traitées par cette instance et
      pourquoi. Dernière mise à jour : 30 juillet 2026.
    </p>
    <p class="privacy-notice">
      Watchdeck est un logiciel auto-hébergé, développé et utilisé à titre strictement personnel, sans
      finalité commerciale. Cette instance est gérée par son administrateur pour un usage personnel ou entre
      proches — elle n'est affiliée ni à Plex Inc., ni à Sonarr/Radarr/Prowlarr, ni à TMDB.
    </p>

    <UiFeedback v-if="loadError" type="error" :message="loadError" />

    <article v-if="policy" class="privacy-body">
      <h2>Responsable de traitement</h2>
      <p v-if="policy.gdpr_contact_email">
        Le responsable du traitement des données sur cette instance est
        <strong v-if="policy.gdpr_contact_name">{{ policy.gdpr_contact_name }}</strong>
        <template v-else>l'administrateur de cette instance</template>, joignable à l'adresse
        <a :href="`mailto:${policy.gdpr_contact_email}`">{{ policy.gdpr_contact_email }}</a> pour toute question
        relative à vos données ou pour exercer les droits décrits plus bas.
      </p>
      <p v-else class="privacy-notice">
        Aucun contact n'a été renseigné par l'administrateur de cette instance (réglages → RGPD).
        Rapprochez-vous de la personne qui vous a invité·e sur ce service pour exercer vos droits.
      </p>

      <h2>Quelles données sont traitées</h2>
      <ul>
        <li>Identifiant et adresse email Plex (pour créer votre compte et vous envoyer les notifications que vous avez demandées)</li>
        <li>Historique de vos demandes de films/séries et leur statut</li>
        <li>Signalements de problème sur un média (nom du rapporteur, description)</li>
        <li>Secrets d'authentification (mot de passe haché, secret d'authentification à deux facteurs, clé publique de passkey) — jamais lisibles en clair, y compris par l'administrateur</li>
        <li>Préférences de notification (canaux activés, granularité VF/VO)</li>
        <li>Journaux techniques (connexions, erreurs) à des fins de diagnostic, avec une durée de conservation limitée et configurable</li>
        <li>
          Adresse IP et horodatage de vos tentatives de connexion, à des fins de sécurité (protection contre les
          tentatives d'accès abusives),
          <template v-if="policy.login_attempt_retention_days">conservées <strong>{{ policy.login_attempt_retention_days }} jour(s)</strong> puis supprimées automatiquement</template>
          <template v-else>conservées jusqu'à purge manuelle par l'administrateur</template>
        </li>
      </ul>

      <h2>Base légale</h2>
      <p>
        Le traitement repose sur l'exécution du service que vous avez explicitement demandé à rejoindre (créer un
        compte pour suivre vos demandes de films/séries) et, à défaut, sur l'intérêt légitime de l'administrateur à
        faire fonctionner correctement et de manière sécurisée un service partagé entre proches. Aucune décision
        automatisée ni profilage n'est réalisé sur vos données.
      </p>

      <h2>Pourquoi</h2>
      <p>
        Uniquement pour faire fonctionner le service : transmettre vos demandes à Sonarr/Radarr, vous notifier quand
        un contenu devient disponible, et diagnostiquer les problèmes techniques. Aucune donnée n'est vendue,
        partagée avec un tiers à des fins commerciales, ou utilisée pour de la publicité.
      </p>

      <h2>Services tiers sollicités</h2>
      <p>Pour fonctionner, cette instance échange des données avec :</p>
      <ul>
        <li><strong>Plex.tv</strong> — authentification de votre compte et lecture de votre liste de suivi</li>
        <li><strong>TMDB</strong> (The Movie Database) — affiches, synopsis et informations des films/séries</li>
        <li><strong>Sonarr / Radarr / Prowlarr</strong> de cette instance — transmission de vos demandes</li>
        <li v-if="policy.active_channels.length">
          <strong>{{ policy.active_channels.join(', ') }}</strong> — canal(aux) de notification activé(s) sur cette instance
        </li>
      </ul>
      <p>
        Ces échanges se font uniquement avec les services que l'administrateur de cette instance a configurés
        ci-dessus — aucune donnée n'est envoyée ailleurs.
      </p>
      <p>
        Plex Inc. et TMDB (The Movie Database) sont des sociétés basées aux États-Unis : les données échangées avec
        ces services (identifiant Plex, recherche d'affiches/synopsis) peuvent donc être traitées hors de l'Union
        européenne, dans le cadre de leur propre politique de confidentialité.
      </p>

      <h2>Cookies</h2>
      <p>
        Cette instance dépose un unique cookie de session, strictement nécessaire pour vous garder connecté·e (aucun
        cookie de mesure d'audience ou de publicité). Il expire à la déconnexion ou après une période d'inactivité
        et n'est jamais transmis à un tiers.
      </p>

      <h2>Combien de temps</h2>
      <p>
        Sur cette instance, les journaux de notification sont conservés <strong>{{ retention(policy.notification_retention_days) }}</strong>,
        l'historique des tâches planifiées <strong>{{ retention(policy.poll_history_retention_days) }}</strong>,
        et les journaux d'audit et de diagnostic (actions admin, événements techniques)
        <strong>{{ retention(policy.audit_log_retention_days) }}</strong>
        (réglages visibles et modifiables par l'administrateur dans les paramètres de l'application).
        Vos données de compte et vos demandes sont conservées tant que votre compte existe.
      </p>

      <h2>Sécurité</h2>
      <p>
        Les jetons d'accès et clés API stockés par cette instance (Plex, Sonarr/Radarr, services de
        notification...) sont chiffrés au repos en base de données. Votre mot de passe (si vous en utilisez un) est
        haché, jamais stocké en clair.
      </p>

      <h2>Vos droits</h2>
      <p>Conformément au RGPD, vous disposez à tout moment des droits suivants sur vos données :</p>
      <ul>
        <li><strong>Accès et portabilité</strong> — obtenir une copie de vos données dans un format réutilisable (export JSON, sans secret)</li>
        <li><strong>Rectification</strong> — corriger une information inexacte ou incomplète</li>
        <li><strong>Effacement</strong> — demander la suppression de votre compte et des données rattachées</li>
        <li><strong>Limitation</strong> — demander la suspension temporaire d'un traitement</li>
        <li><strong>Opposition</strong> — vous opposer à un traitement fondé sur l'intérêt légitime</li>
      </ul>
      <p>
        <template v-if="policy.gdpr_contact_email">
          Pour exercer l'un de ces droits, contactez
          <a :href="`mailto:${policy.gdpr_contact_email}`">{{ policy.gdpr_contact_email }}</a> : l'export et la
          suppression de vos données sont réalisables directement depuis l'administration de cette instance.
        </template>
        <template v-else>Pour exercer l'un de ces droits, contactez l'administrateur de cette instance.</template>
        Si vous estimez, après nous avoir contactés, que vos droits ne sont pas respectés, vous pouvez introduire
        une réclamation auprès de la
        <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener noreferrer">CNIL</a>
        (Commission Nationale de l'Informatique et des Libertés).
      </p>
    </article>

    <!-- Lien serveur : /login renvoie deja vers l'application quand une session est ouverte. -->
    <template #footer>
      <a href="/login">← Retour à Watchdeck</a>
    </template>
  </AuthLayout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '@/api';
import AuthLayout from '@/components/auth/AuthLayout.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';

interface PrivacyPolicy {
  notification_retention_days: number | null;
  poll_history_retention_days: number | null;
  login_attempt_retention_days: number | null;
  audit_log_retention_days: number | null;
  active_channels: string[];
  gdpr_contact_name: string | null;
  gdpr_contact_email: string | null;
}

const policy = ref<PrivacyPolicy | null>(null);
const loadError = ref('');

function retention(days: number | null): string {
  return days ? `${days} jour(s)` : 'indéfiniment';
}

onMounted(async () => {
  try {
    policy.value = await api<PrivacyPolicy>('/api/privacy');
  } catch (e: any) {
    loadError.value = `Réglages de l'instance indisponibles : ${e.message}`;
  }
});
</script>

<style scoped lang="scss">
.privacy-updated { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.privacy-notice {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-size: var(--fs-sm);
  line-height: 1.6;
}
.privacy-body { display: grid; gap: var(--space-3); font-size: var(--fs-md); line-height: 1.65; }
.privacy-body h2 { margin: var(--space-4) 0 0; font-family: var(--font-display); font-size: var(--fs-lg); }
.privacy-body p,.privacy-body ul { margin: 0; }
.privacy-body ul { display: grid; gap: var(--space-2); padding-left: var(--space-5); }
.privacy-body a { color: var(--accent); }
</style>
