import {
  Clock,
  DatabaseZap,
  Download,
  GitBranch,
  Link,
  ListRestart,
  Languages,
  Plug,
  ScrollText,
  ServerCog,
  Tv,
} from '@lucide/vue';

export interface SettingsSectionConfig {
  key: string;
  label: string;
  mobileLabel?: string;
  group: string;
  icon: any;
  to?: string;
}

export const settingsSections: SettingsSectionConfig[] = [
  { key: 'overview', label: 'Vue d’ensemble', mobileLabel: 'Aperçu', group: '', icon: ServerCog },

  { key: 'plex', label: 'Plex & Bibliothèque', mobileLabel: 'Plex', group: 'Connexions', icon: Tv },
  { key: 'services', label: 'Intégrations', mobileLabel: 'Intégrations', group: 'Connexions', icon: Plug },
  { key: 'webhooks', label: 'Webhooks & API', mobileLabel: 'Webhooks', group: 'Connexions', icon: Link },

  { key: 'downloads', label: 'Téléchargements', mobileLabel: 'Downloads', group: 'Automatisation', icon: Download },
  { key: 'vf-upgrades', label: 'Améliorations VF', mobileLabel: 'Upgrades VF', group: 'Automatisation', icon: Languages },
  { key: 'scheduled-tasks', label: 'Planification & Maintenance', mobileLabel: 'Planning', group: 'Automatisation', icon: Clock },

  { key: 'acquisitions', label: 'Acquisitions & conflits', mobileLabel: 'Acquisitions', group: 'Acquisition', icon: ListRestart, to: '/downloads/acquisitions' },
  { key: 'logs', label: 'Journaux', mobileLabel: 'Journaux', group: 'Système', icon: ScrollText, to: '/logs' },

  { key: 'data', label: 'Données & RGPD', mobileLabel: 'Données', group: 'Système', icon: DatabaseZap },
  { key: 'system-version', label: 'Version & mises à jour', mobileLabel: 'Version', group: 'Système', icon: GitBranch },
];
