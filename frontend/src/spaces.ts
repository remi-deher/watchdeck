import type { Component } from 'vue';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import {
  Activity,
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  Compass,
  Film,
  House,
  Inbox,
  Languages,
  Library,
  Music2,
  Radio,
  Settings,
  Tv,
  Users,
  Wrench,
} from '@lucide/vue';

import DownloadsNavigation from '@/components/downloads/DownloadsNavigation.vue';
import SettingsNavigation from '@/components/settings/SettingsNavigation.vue';

const MUSIC_TYPES = ['artist', 'album', 'track'];

export interface NavItem {
  key: string;
  label: string;
  to: string | Record<string, any> | ((route?: RouteLocationNormalizedLoaded) => any);
  icon?: any;
  mobileLabel?: string;
  mobile?: boolean;
  more?: boolean;
  admin?: boolean;
  exact?: boolean;
  active?: (route?: RouteLocationNormalizedLoaded) => boolean;
}

export interface NavGroup {
  label?: string;
  primary?: boolean;
  className?: string;
  moreLabel?: string;
  items: NavItem[];
}

export interface SpaceConfig {
  slug: string;
  match: (path: string) => boolean;
  component?: Component;
  ariaLabel?: string;
  brandIcon?: any;
  appLinkTo?: string;
  adminOnlyAppLink?: boolean;
  mobileMenuTitle?: string;
  nav?: NavGroup[];
}

/** Types de médias sélectionnés dans la grille Bibliothèque (`?type=` répétable). */
export function libraryTypeFilters(route?: RouteLocationNormalizedLoaded): string[] {
  const raw = route?.query?.type;
  if (!raw) return [];
  return Array.isArray(raw) ? (raw as string[]) : [String(raw)];
}

function libraryTarget(types: string[]): { path: string; query: Record<string, any> } {
  const query: Record<string, any> = { hub: '1' };
  if (types.length) query.type = types;
  return { path: '/library', query };
}

function libraryItem({
  key,
  label,
  icon,
  types,
  mobileLabel,
}: {
  key: string;
  label: string;
  icon: any;
  types: string[];
  mobileLabel?: string;
}): NavItem {
  return {
    key,
    label,
    mobileLabel,
    icon,
    to: () => libraryTarget(types),
    active: (route?: RouteLocationNormalizedLoaded) => {
      if (route?.path?.startsWith('/library/media')) return false;
      const selected = libraryTypeFilters(route);
      if (!types.length) return !selected.length;
      return types.some((type) => selected.includes(type));
    },
    mobile: true,
  };
}

export const SPACES: SpaceConfig[] = [
  {
    slug: 'settings',
    component: SettingsNavigation,
    match: (path) => ['/settings', '/logs', '/maintenance'].some((prefix) => path.startsWith(prefix)),
  },
  {
    slug: 'admin',
    match: (path) => ['/users', '/notifications'].some((prefix) => path.startsWith(prefix)),
    ariaLabel: 'Navigation Administration',
    brandIcon: Wrench,
    nav: [
      { className: 'admin-home-nav', items: [{ key: 'home', to: '/dashboard', label: 'Accueil', icon: House, more: true }] },
      {
        label: 'Administration',
        primary: true,
        moreLabel: 'Administration',
        items: [
          { key: 'users', to: '/users', label: 'Utilisateurs', icon: Users, mobile: true, more: true },
          { key: 'notifications', to: '/notifications', label: 'Notifications', icon: Bell, mobile: true, more: true },
          { key: 'settings', to: '/settings', label: 'Parametres', icon: Settings, mobile: true, more: true },
        ],
      },
    ],
  },
  {
    slug: 'activity',
    match: (path) => ['/activity', '/analytics'].some((prefix) => path.startsWith(prefix)),
    ariaLabel: 'Navigation Activité & Insights',
    brandIcon: Activity,
    nav: [
      { className: 'activity-home-nav', items: [{ key: 'home', to: '/dashboard', label: 'Accueil', icon: House, more: true }] },
      {
        label: 'Activité & Insights',
        primary: true,
        items: [
          { key: 'activity', to: '/activity', label: 'Activité Plex', mobileLabel: 'Activité', icon: Radio, mobile: true },
          { key: 'analytics', to: '/analytics', label: 'Insights médiathèque', mobileLabel: 'Insights', icon: ChartNoAxesCombined, mobile: true },
        ],
      },
    ],
  },
  {
    slug: 'downloads',
    component: DownloadsNavigation,
    match: (path) => path.startsWith('/downloads'),
  },
  {
    slug: 'discover',
    match: (path) => path.startsWith('/discover'),
    ariaLabel: 'Navigation Découverte',
    brandIcon: Compass,
    appLinkTo: '/dashboard',
    adminOnlyAppLink: true,
    mobileMenuTitle: 'Compte',
    nav: [
      {
        label: 'Découvrir',
        primary: true,
        items: [
          { key: 'home', to: '/discover', label: 'Accueil', icon: House, exact: true, mobile: true },
          { key: 'shows', to: '/discover/shows', label: 'Séries', icon: Tv, mobile: true },
          { key: 'movies', to: '/discover/movies', label: 'Films', icon: Film, mobile: true },
          { key: 'requests', to: '/discover/requests', label: 'Demandes', icon: Inbox, mobile: true },
          { key: 'calendar', to: '/discover/calendar', label: 'Calendrier', icon: CalendarDays, more: true },
        ],
      },
    ],
  },
  {
    slug: 'library',
    match: (path) => ['/library', '/vf-upgrades'].some((prefix) => path.startsWith(prefix)),
    ariaLabel: 'Navigation Bibliothèque',
    brandIcon: Library,
    nav: [
      {
        label: 'Bibliothèque',
        primary: true,
        items: [
          libraryItem({ key: 'home', label: 'Accueil', icon: House, types: [] }),
          libraryItem({ key: 'shows', label: 'Séries', icon: Tv, types: ['show'] }),
          libraryItem({ key: 'movies', label: 'Films', icon: Film, types: ['movie'] }),
          libraryItem({ key: 'music', label: 'Musiques', icon: Music2, types: MUSIC_TYPES }),
          { key: 'vf', to: '/vf-upgrades', label: 'Améliorations VF', mobileLabel: 'Upgrades VF', icon: Languages, admin: true, mobile: true },
        ],
      },
    ],
  },
];

/** Espace couvrant `path`, ou `null` pour la sidebar principale. */
export function spaceForPath(path: string): SpaceConfig | null {
  return SPACES.find((space) => space.match(path)) || null;
}

/** Clé de persistance de l'état replié, historiquement une par espace. */
export function collapseStorageKey(slug?: string | null): string {
  return slug ? `watchdeck.${slug}SidebarCollapsed` : 'watchdeck.sidebarCollapsed';
}
