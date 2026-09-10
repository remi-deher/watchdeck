/* Où vit chaque réglage.
 *
 * Les groupes de réglages sont devenus sept destinations du rail : gain de place, mais
 * plus personne ne sait dans laquelle chercher « le jeton Plex » ou « l'intervalle de
 * scan VF ». La barre de recherche des réglages retranche les cartes de la page
 * affichée ; cet index répond à l'autre moitié de la question — ce qui correspond
 * ailleurs.
 *
 * On indexe les **panneaux**, pas les cent trente-six champs : un panneau est stable,
 * un champ change de libellé à chaque refonte, et l'utilisateur cherche de toute façon
 * « où » avant de chercher « quoi ». Les mots-clés portent ce que le titre du panneau ne
 * dit pas — noms de services, jargon, synonymes.
 */

export interface SettingsSearchEntry {
  /** Libellé du panneau, tel que la sous-navigation l'affiche. */
  label: string;
  /** Destination du rail à laquelle il appartient, pour situer le résultat. */
  group: string;
  path: string;
  /** Ce qu'on tape sans que ce soit écrit dans le titre. */
  keywords: string[];
}

export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [
  {
    label: 'Configuration',
    group: 'Administration',
    path: '/settings',
    keywords: ['vue ensemble', 'etat', 'diagnostic', 'ce qui manque'],
  },
  {
    label: 'Plex & Bibliothèque',
    group: 'Services',
    path: '/settings/services',
    keywords: ['plex', 'jeton', 'token', 'url plex', 'bibliotheque', 'scan', 'analyse vf', 'sections'],
  },
  {
    label: 'Intégrations',
    group: 'Services',
    path: '/settings/services/integrations',
    keywords: ['sonarr', 'radarr', 'prowlarr', 'seer', 'overseerr', 'jellyseerr', 'tautulli', 'tracearr', 'tmdb', 'cle api'],
  },
  {
    label: 'Webhooks & API',
    group: 'Services',
    path: '/settings/services/webhooks',
    keywords: ['webhook', 'api', 'cle', 'jeton', 'integration externe'],
  },
  {
    label: 'Téléchargements',
    group: 'Automatisation',
    path: '/settings/automation',
    keywords: ['torrent', 'seed', 'ratio', 'qbittorrent', 'transmission', 'mots interdits', 'taille', 'import bloque', 'rapprochement'],
  },
  {
    label: 'Améliorations VF',
    group: 'Automatisation',
    path: '/settings/automation/vf-upgrades',
    keywords: ['vf', 'vo', 'langue', 'francais', 'doublage', 'piste audio', 'surveillance'],
  },
  {
    label: 'Planification',
    group: 'Automatisation',
    path: '/settings/automation/scheduled-tasks',
    keywords: ['taches', 'cron', 'intervalle', 'frequence', 'planification', 'watchlist', 'sondage'],
  },
  {
    label: 'Acquisitions & conflits',
    group: 'Exploitation',
    path: '/settings/operations',
    keywords: ['conflit', 'doublon', 'acquisition', 'maintenance', 'reparer', 'affiches'],
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
    keywords: ['quand notifier', 'evenement', 'silence', 'digest', 'regroupement'],
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
    label: 'Utilisateurs',
    group: 'Administration',
    path: '/users',
    keywords: ['compte', 'role', 'moderateur', 'admin', 'fusion', 'mot de passe', 'plex user'],
  },
  {
    label: 'Version & système',
    group: 'Système',
    path: '/settings/system',
    keywords: ['version', 'mise a jour', 'sauvegarde', 'backup', 'restauration', 'journaux', 'securite', 'donnees'],
  },
];
