import { Bell, FileCode2, History, Inbox, ListChecks } from '@lucide/vue';

export interface NotificationSectionConfig {
  key: string;
  label: string;
  group: string;
  icon: any;
  to: string | { path: string; query: Record<string, any> };
}

export const notificationSections: NotificationSectionConfig[] = [
  { key: 'history', label: 'Journal', group: 'Notifications', icon: History, to: '/notifications?tab=history' },
  { key: 'pending', label: 'File d’attente', group: 'Notifications', icon: Inbox, to: '/notifications?tab=pending' },
  {
    key: 'notifications-channels',
    label: 'Canaux',
    group: 'Notifications',
    icon: Bell,
    to: { path: '/settings', query: { tab: 'notifications-channels' } },
  },
  {
    key: 'notifications-rules',
    label: 'Règles',
    group: 'Notifications',
    icon: ListChecks,
    to: { path: '/settings', query: { tab: 'notifications-rules' } },
  },
  {
    key: 'templates',
    label: 'Modèles d’emails',
    group: 'Notifications',
    icon: FileCode2,
    to: { path: '/settings', query: { tab: 'templates' } },
  },
];
