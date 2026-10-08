/* Où vit chaque réglage.
 *
 * Les réglages sont rangés en zones de l'espace Administration : on ne sait pas toujours
 * dans laquelle chercher « le jeton Plex » ou « l'intervalle de scan VF ». La barre de
 * recherche des réglages retranche les cartes de la page affichée ; cet index répond à
 * l'autre moitié de la question — ce qui correspond ailleurs.
 *
 * On indexe les **sections**, pas les cent trente-six champs : une section est stable,
 * un champ change de libellé à chaque refonte, et l'utilisateur cherche de toute façon
 * « où » avant de chercher « quoi ». Les mots-clés portent ce que le titre de la section
 * ne dit pas — noms de services, jargon, synonymes.
 */

export interface SettingsSearchEntry {
  /** Libellé de la section, tel que la sous-navigation l'affiche. */
  label: string;
  /** Zone de l'Administration à laquelle elle appartient, pour situer le résultat. */
  group: string;
  path: string;
  /** Ce qu'on tape sans que ce soit écrit dans le titre. */
  keywords: string[];
}

export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [
  {
    label: 'Vue d’ensemble',
    group: 'Administration',
    path: '/settings',
    keywords: ['configuration', 'etat', 'sante', 'diagnostic', 'ce qui manque', 'a traiter', 'alertes'],
  },
  {
    label: 'Plex',
    group: 'Connexions',
    path: '/settings/services',
    keywords: ['plex', 'jeton', 'token', 'url plex', 'serveur', 'activite en direct', 'lectures', 'tautulli', 'tracearr', 'watchlist', 'sante', 'tester'],
  },
  {
    label: 'Médias',
    group: 'Connexions',
    path: '/settings/services/media',
    keywords: ['sonarr', 'radarr', 'prowlarr', 'bazarr', 'sous-titres', 'instance', 'cle api', 'sante', 'tester'],
  },
  {
    label: 'Informations',
    group: 'Connexions',
    path: '/settings/services/integrations',
    keywords: ['seer', 'overseerr', 'jellyseerr', 'tmdb', 'metadonnees', 'cle api', 'integrations'],
  },
  {
    label: 'Webhooks',
    group: 'Connexions',
    path: '/settings/services/webhooks',
    keywords: ['webhook', 'secret', 'temps reel', 'integration externe', 'configurer automatiquement', 'connect'],
  },
  {
    label: 'Clients de téléchargement',
    group: 'Acquisition & stockage',
    path: '/settings/acquisition',
    keywords: ['qbittorrent', 'transmission', 'deluge', 'client torrent', 'client direct', 'download client'],
  },
  {
    label: 'Règles',
    group: 'Acquisition & stockage',
    path: '/settings/acquisition/downloads',
    keywords: ['torrent', 'seed', 'ratio', 'mots interdits', 'taille', 'import bloque', 'rapprochement', 'disponibilite', 'filtres de release', 'telechargements', 'tester une release', 'series', 'episode'],
  },
  {
    label: 'Acquisitions & conflits',
    group: 'Acquisition & stockage',
    path: '/downloads/acquisitions',
    keywords: ['conflit', 'doublon', 'acquisition', 'lots de series'],
  },
  {
    label: 'Stockage et transferts',
    group: 'Acquisition & stockage',
    path: '/storage',
    keywords: ['nas', 'ssh', 'rsync', 'transfert', 'espace disque', 'objectif', 'reserve'],
  },
  {
    label: 'Améliorations VF',
    group: 'Automatisation',
    path: '/settings/automation',
    keywords: ['vf', 'vo', 'langue', 'francais', 'doublage', 'piste audio', 'surveillance', 'confiance', 'qualite'],
  },
  {
    label: 'Sous-titres',
    group: 'Automatisation',
    path: '/settings/automation/subtitles',
    keywords: ['sous-titres', 'srt', 'opensubtitles', 'recherche de sous-titres', 'francais'],
  },
  {
    label: 'Planification',
    group: 'Automatisation',
    path: '/settings/automation/scheduled-tasks',
    keywords: ['taches', 'cron', 'intervalle', 'frequence', 'planification', 'watchlist', 'sondage', 'historique'],
  },
  {
    label: 'Canaux',
    group: 'Notifications',
    path: '/settings/notifications/channels',
    keywords: ['email', 'smtp', 'discord', 'telegram', 'ntfy', 'gotify', 'envoi', 'destinataire'],
  },
  {
    label: 'Règles',
    group: 'Notifications',
    path: '/settings/notifications/rules',
    keywords: ['quand notifier', 'evenement', 'silence', 'digest', 'regroupement', 'newsletter', 'nouveautes', 'lettre hebdomadaire'],
  },
  {
    label: 'Modèles d’emails',
    group: 'Notifications',
    path: '/settings/notifications/templates',
    keywords: ['gabarit', 'template', 'objet', 'sujet', 'mise en forme', 'couleur', 'entete'],
  },
  {
    label: 'Motifs de message',
    group: 'Notifications',
    path: '/settings/notifications/reasons',
    keywords: ['motif', 'annulation', 'correction', 'refus', 'explication'],
  },
  {
    label: 'Demandes & quotas',
    group: 'Demandes & quotas',
    path: '/settings/requests',
    keywords: ['quota', 'limite de demandes', 'approbation', 'validation', 'watchlist', 'periode', 'source de repli', 'universal watchlist', 'langue', 'langue par defaut', 'locale', 'anglais'],
  },
  {
    label: 'Utilisateurs',
    group: 'Utilisateurs',
    path: '/users',
    keywords: ['compte', 'role', 'moderateur', 'admin', 'fusion', 'mot de passe', 'plex user'],
  },
  {
    label: 'Sécurité & API',
    group: 'Sécurité & API',
    path: '/settings/security',
    keywords: ['url publique', 'adresse publique', 'proxy', 'reverse-proxy', 'nginx', 'traefik', 'caddy', 'ip', 'x-forwarded-for', 'securite', 'double authentification', 'https'],
  },
  {
    label: 'Jeton API',
    group: 'Sécurité & API',
    path: '/settings/security/api',
    keywords: ['api', 'jeton', 'token', 'bearer', 'cle', 'acces externe', 'curl', 'regenerer', 'revoquer'],
  },
  {
    label: 'Maintenance',
    group: 'Maintenance & données',
    path: '/settings/maintenance',
    keywords: ['reparer', 'affiches', 'images', 'cache', 'precharger', 'vider le cache', 'synchroniser', 'doublons', 'recalculer', 'relancer'],
  },
  {
    label: 'Données & sauvegardes',
    group: 'Maintenance & données',
    path: '/settings/maintenance/data',
    keywords: ['sauvegarde', 'backup', 'restauration', 'export', 'import', 'reprise apres sinistre', 'medias supprimes'],
  },
  {
    label: 'Confidentialité & RGPD',
    group: 'Maintenance & données',
    path: '/settings/maintenance/privacy',
    keywords: ['rgpd', 'retention', 'donnees personnelles', 'responsable de traitement', 'purge', 'securite'],
  },
  {
    label: 'Journaux',
    group: 'Journaux & version',
    path: '/logs',
    keywords: ['logs', 'erreurs', 'diagnostic', 'traces', 'historique des taches'],
  },
  {
    label: 'Version & mises à jour',
    group: 'Journaux & version',
    path: '/settings/system/version',
    keywords: ['version', 'mise a jour', 'release', 'commit', 'docker', 'image'],
  },
];
