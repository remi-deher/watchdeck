/**
 * Modèle de navigation unique de l'application.
 *
 * Un seul jeu d'éléments quel que soit l'appareil : les mêmes destinations, les mêmes
 * sections, la même logique d'état actif. Seule l'orientation change — rail vertical à
 * gauche sur grand écran, barre horizontale en bas sur mobile (voir AppNav.vue).
 *
 * Il n'y a donc plus ni « espaces » remplaçant la navigation, ni arbre de bureau
 * distinct de la liste mobile : une destination porte éventuellement des sections, et
 * ces sections se rendent identiquement partout.
 */
import type { Component } from 'vue';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import {
  Activity,
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  Clock,
  Compass,
  DatabaseZap,
  Download,
  Film,
  Gauge,
  GitBranch,
  House,
  Inbox,
  Languages,
  Layers3,
  Library,
  Link,
  ListOrdered,
  ListRestart,
  MessageSquareWarning,
  Music2,
  Plug,
  ScrollText,
  Server,
  ServerCog,
  Settings,
  Tv,
  Users,
  Wrench,
} from '@lucide/vue';

export type Access = 'admin' | 'moderator';

/** Une entrée du menu contextuel d'une destination. */
export interface NavSection {
  key: string;
  label: string;
  to: string | Record<string, any>;
  icon?: Component;
  /** En-tête de regroupement dans le menu ; les entrées sans groupe viennent en tête. */
  group?: string;
  access?: Access;
  /** État actif quand l'URL seule ne suffit pas (filtres `?type=` de la Bibliothèque). */
  active?: (route: RouteLocationNormalizedLoaded) => boolean;
}

/** Une destination de premier niveau, présente dans le rail comme dans la barre. */
export interface NavDestination {
  key: string;
  label: string;
  to: string | Record<string, any>;
  icon: Component;
  /** Regroupement dans le menu ☰. */
  group: string;
  access?: Access;
  /** Réservée aux modérateurs non-admins. */
  moderatorOnly?: boolean;
  match: (path: string) => boolean;
}

/** Contexte dynamique nécessaire pour construire certaines sections. */
export interface NavContext {
  isAdmin: boolean;
  canModerate: boolean;
  arrInstances: Array<{ id?: number | string; name?: string; arr_type?: string; enabled?: boolean }>;
  downloadClients: Array<{ id?: number | string; name?: string; enabled?: boolean }>;
}

/* ────────────────────────────── Destinations ────────────────────────────── */

export const DESTINATIONS: NavDestination[] = [
  { key: 'discover', label: 'Découvrir', icon: Compass, group: 'Explorer', match: (p) => p.startsWith('/discover') || p.startsWith('/calendar'), to: '/discover' },
  { key: 'library', label: 'Bibliothèque', icon: Library, group: 'Explorer', access: 'moderator', match: (p) => p.startsWith('/library') || p.startsWith('/vf-upgrades'), to: { path: '/library', query: { hub: '1' } } },
  { key: 'dashboard', label: 'Tableau de bord', icon: Gauge, group: 'Gestion', access: 'admin', match: (p) => p.startsWith('/dashboard') || p.startsWith('/issues'), to: '/dashboard' },
  { key: 'downloads', label: 'Téléchargements', icon: Download, group: 'Gestion', access: 'admin', match: (p) => p.startsWith('/downloads'), to: '/downloads' },
  { key: 'activity', label: 'Activité & Insights', icon: Activity, group: 'Gestion', access: 'admin', match: (p) => p.startsWith('/activity') || p.startsWith('/analytics'), to: '/activity' },
  { key: 'admin', label: 'Administration', icon: Wrench, group: 'Gestion', access: 'admin', match: (p) => p.startsWith('/users') || p.startsWith('/notifications'), to: '/users' },
  { key: 'settings', label: 'Paramètres', icon: Settings, group: 'Gestion', access: 'admin', match: (p) => p.startsWith('/settings') || p.startsWith('/logs') || p.startsWith('/maintenance'), to: '/settings' },
  // Un moderateur sans acces au tableau de bord garde les signalements comme espace propre.
  { key: 'issues', label: 'Problèmes signalés', icon: MessageSquareWarning, group: 'Gestion', access: 'moderator', moderatorOnly: true, match: (p) => p.startsWith('/issues'), to: '/issues' },
];
function permitted<T extends { access?: Access; moderatorOnly?: boolean }>(
  items: T[],
  isAdmin: boolean,
  canModerate: boolean
): T[] {
  return items.filter((item) => {
    if (item.moderatorOnly && isAdmin) return false;
    if (item.access === 'admin') return isAdmin;
    if (item.access === 'moderator') return canModerate;
    return true;
  });
}

/** Destinations visibles pour les droits donnés. */
export function destinationsFor(isAdmin: boolean, canModerate: boolean): NavDestination[] {
  return permitted(DESTINATIONS, isAdmin, canModerate);
}

/**
 * Destination couvrant `path` pour les droits donnés.
 *
 * Les droits comptent : `/issues` relève du tableau de bord pour un administrateur,
 * mais constitue l'espace propre d'un modérateur, qui n'y a pas accès.
 */
export function destinationForPath(path: string, isAdmin: boolean, canModerate: boolean): NavDestination | null {
  return destinationsFor(isAdmin, canModerate).find((destination) => destination.match(path)) || null;
}

/* ──────────────────────────────── Sections ──────────────────────────────── */

/** Types de médias sélectionnés dans la grille Bibliothèque (`?type=` répétable). */
export function libraryTypeFilters(route?: RouteLocationNormalizedLoaded): string[] {
  const raw = route?.query?.type;
  if (!raw) return [];
  return Array.isArray(raw) ? (raw as string[]) : [String(raw)];
}

function libraryFilter(key: string, label: string, icon: Component, types: string[]): NavSection {
  const query: Record<string, any> = { hub: '1' };
  if (types.length) query.type = types;
  return {
    key,
    label,
    icon,
    to: { path: '/library', query },
    active: (route) => {
      // Une fiche média n'active aucun filtre de la grille.
      if (route?.path?.startsWith('/library/media')) return false;
      const selected = libraryTypeFilters(route);
      return types.length ? types.some((type) => selected.includes(type)) : !selected.length;
    },
  };
}

const MUSIC_TYPES = ['artist', 'album', 'track'];

const SETTINGS_SECTIONS: NavSection[] = [
  { key: 'overview', label: 'Vue d’ensemble', to: { path: '/settings', query: { tab: 'overview' } }, icon: ServerCog },
  { key: 'plex', label: 'Plex & Bibliothèque', group: 'Services', to: { path: '/settings', query: { tab: 'plex' } }, icon: Tv },
  { key: 'services', label: 'Intégrations', group: 'Services', to: { path: '/settings', query: { tab: 'services' } }, icon: Plug },
  { key: 'webhooks', label: 'Webhooks & API', group: 'Services', to: { path: '/settings', query: { tab: 'webhooks' } }, icon: Link },
  { key: 'downloads', label: 'Téléchargements', group: 'Bibliothèque & acquisition', to: { path: '/settings', query: { tab: 'downloads' } }, icon: Download },
  { key: 'vf-upgrades', label: 'Améliorations VF', group: 'Bibliothèque & acquisition', to: { path: '/settings', query: { tab: 'vf-upgrades' } }, icon: Languages },
  { key: 'scheduled-tasks', label: 'Planification & Maintenance', group: 'Bibliothèque & acquisition', to: { path: '/settings', query: { tab: 'scheduled-tasks' } }, icon: Clock },
  { key: 'acquisitions', label: 'Acquisitions & Conflits', group: 'Exploitation', to: { path: '/settings', query: { tab: 'acquisitions' } }, icon: ListRestart },
  { key: 'logs', label: 'Journaux', group: 'Exploitation', to: '/logs', icon: ScrollText },
  { key: 'data', label: 'Données & RGPD', group: 'Système', to: { path: '/settings', query: { tab: 'data' } }, icon: DatabaseZap },
  { key: 'system-version', label: 'Version & mises à jour', group: 'Système', to: { path: '/settings', query: { tab: 'system-version' } }, icon: GitBranch },
];

function downloadSections(context: NavContext): NavSection[] {
  const sections: NavSection[] = [
    { key: 'overview', label: 'Vue d’ensemble', to: { path: '/downloads', query: { view: 'overview' } }, icon: Gauge },
    { key: 'queue', label: 'File d’attente', to: { path: '/downloads', query: { view: 'queue' } }, icon: ListOrdered },
  ];

  // Une instance sans identifiant n'a pas de route a cibler : on ne l'affiche pas.
  const enabledArr = context.arrInstances.filter(
    (item) => item.id != null && item.enabled !== false && ['radarr', 'sonarr'].includes(String(item.arr_type))
  );
  for (const instance of enabledArr) {
    sections.push({
      key: `${instance.arr_type}-${instance.id}`,
      label: instance.name || `Instance ${instance.id}`,
      group: 'Gestionnaires de médias',
      icon: instance.arr_type === 'radarr' ? Film : Tv,
      to: { path: '/downloads', query: { view: instance.arr_type, instance: String(instance.id) } },
    });
  }

  sections.push({
    key: 'clients',
    label: 'Tous les torrents',
    group: 'Clients torrent',
    icon: Layers3,
    to: { path: '/downloads', query: { view: 'clients', sub: 'instances' } },
  });
  for (const client of context.downloadClients.filter((item) => item.id != null && item.enabled !== false)) {
    sections.push({
      key: `client-${client.id}`,
      label: client.name || `Client ${client.id}`,
      group: 'Clients torrent',
      icon: Server,
      to: { path: '/downloads', query: { view: 'clients', sub: 'instances', client: String(client.id) } },
    });
  }

  return sections;
}

/**
 * Sections contextuelles d'une destination, filtrées selon les droits.
 *
 * Chaque destination en expose au moins une : la barre du bas les affiche, et une barre
 * vide n'aurait aucun sens. Pour une page unique, sa propre racine fait la section.
 */
export function sectionsFor(destinationKey: string, context: NavContext): NavSection[] {
  const { isAdmin, canModerate } = context;
  let sections: NavSection[] = [];

  switch (destinationKey) {
    case 'discover':
      sections = [
        { key: 'home', label: 'Accueil', to: '/discover', icon: House },
        { key: 'shows', label: 'Séries', to: '/discover/shows', icon: Tv },
        { key: 'movies', label: 'Films', to: '/discover/movies', icon: Film },
        { key: 'requests', label: 'Demandes', to: '/discover/requests', icon: Inbox },
        { key: 'calendar', label: 'Calendrier', to: '/calendar', icon: CalendarDays },
      ];
      break;
    case 'library':
      sections = [
        libraryFilter('home', 'Tout', House, []),
        libraryFilter('shows', 'Séries', Tv, ['show']),
        libraryFilter('movies', 'Films', Film, ['movie']),
        libraryFilter('music', 'Musiques', Music2, MUSIC_TYPES),
        { key: 'vf', label: 'Améliorations VF', to: '/vf-upgrades', icon: Languages, access: 'admin' },
      ];
      break;
    case 'dashboard':
      sections = [
        { key: 'overview', label: 'Vue d’ensemble', to: '/dashboard', icon: Gauge },
        { key: 'issues', label: 'Problèmes', to: '/issues', icon: MessageSquareWarning },
      ];
      break;
    case 'activity':
      sections = [
        { key: 'activity', label: 'Activité Plex', to: '/activity', icon: Activity },
        { key: 'analytics', label: 'Insights', to: '/analytics', icon: ChartNoAxesCombined },
      ];
      break;
    case 'admin':
      sections = [
        { key: 'users', label: 'Utilisateurs', to: '/users', icon: Users },
        { key: 'notifications', label: 'Notifications', to: '/notifications', icon: Bell },
      ];
      break;
    case 'issues':
      sections = [{ key: 'issues', label: 'Problèmes', to: '/issues', icon: MessageSquareWarning }];
      break;
    case 'downloads':
      sections = downloadSections(context);
      break;
    case 'settings':
      sections = SETTINGS_SECTIONS;
      break;
    default:
      sections = [];
  }

  return permitted(sections, isAdmin, canModerate);
}

/** Sections regroupées pour l'affichage, dans l'ordre de première apparition. */
export function groupedSections(sections: NavSection[]): Array<{ label: string; items: NavSection[] }> {
  const groups: Array<{ label: string; items: NavSection[] }> = [];
  for (const section of sections) {
    const label = section.group || '';
    const existing = groups.find((group) => group.label === label);
    if (existing) existing.items.push(section);
    else groups.push({ label, items: [section] });
  }
  return groups;
}

/** Section active pour la route courante : `active()` explicite, sinon égalité d'URL. */
export function activeSectionKey(
  sections: NavSection[],
  route: RouteLocationNormalizedLoaded
): string {
  const explicit = sections.find((section) => section.active?.(route));
  if (explicit) return explicit.key;

  let best = '';
  let bestScore = -1;
  for (const section of sections) {
    if (section.active) continue;
    const target = typeof section.to === 'string' ? { path: section.to, query: {} } : section.to;
    if (target.path !== route.path) continue;
    // À chemin égal, la section dont tous les paramètres correspondent gagne : sans
    // cela `/downloads?view=clients&client=2` activerait « Tous les torrents ».
    const query = (target.query || {}) as Record<string, any>;
    const matches = Object.entries(query).every(([key, value]) => String(route.query[key] ?? '') === String(value));
    if (!matches) continue;
    const score = Object.keys(query).length;
    if (score > bestScore) {
      bestScore = score;
      best = section.key;
    }
  }
  return best;
}
