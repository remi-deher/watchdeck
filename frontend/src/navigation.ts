/**
 * Modèle de navigation unique de l'application.
 *
 * Un seul modèle quel que soit l'appareil : les destinations forment le premier niveau
 * (rail latéral ou dock bas), leurs sections métier le second, affiché dans la page
 * elle-même par `AppSubnav` et non plus dans le shell.
 * Les filtres et les périmètres techniques (instances *ARR, clients) restent dans les
 * barres d'outils des pages : ils ne doivent jamais se faire passer pour des onglets.
 */
import type { Component } from 'vue';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import {
  Activity,
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  Compass,
  Download,
  Film,
  Gauge,
  GitBranch,
  History,
  House,
  Inbox,
  Languages,
  Library,
  Lightbulb,
  ListOrdered,
  MessageSquareWarning,
  MonitorPlay,
  Radio,
  ScrollText,
  Table,
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

/**
 * Destinations retenues par le dock du mode compact, dans l'ordre.
 *
 * Le dock n'a la place que de quatre cibles de 44px plus le bouton « Plus » : au-delà,
 * les libellés se tronquent et les cibles passent sous le seuil tactile. Les autres
 * destinations restent atteignables en entier depuis la feuille de navigation, qui
 * n'en cache aucune.
 */
export const DOCK_DESTINATION_KEYS = ['dashboard', 'discover', 'requests', 'library'];

/** Une destination de premier niveau, présente dans le rail comme dans le dock. */
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
  { key: 'dashboard', label: 'Accueil', icon: Gauge, group: 'Pilotage', access: 'admin', match: (p) => p.startsWith('/dashboard') || p.startsWith('/issues'), to: '/dashboard' },
  { key: 'discover', label: 'Explorer', icon: Compass, group: 'Explorer', match: (p) => (p.startsWith('/discover') && !p.startsWith('/discover/requests')) || p.startsWith('/calendar'), to: '/discover' },
  { key: 'requests', label: 'Demandes', icon: Inbox, group: 'Workflow', match: (p) => p.startsWith('/discover/requests') || p.startsWith('/releases/'), to: '/discover/requests' },
  { key: 'downloads', label: 'Acquisition', icon: GitBranch, group: 'Workflow', access: 'admin', match: (p) => p.startsWith('/downloads'), to: '/downloads' },
  { key: 'library', label: 'Bibliothèque', icon: Library, group: 'Explorer', access: 'moderator', match: (p) => p.startsWith('/library') || p.startsWith('/vf-upgrades'), to: { path: '/library', query: { hub: '1' } } },
  // Lectures Plex et analyse du catalogue sont deux espaces distincts, pas deux
  // sections d'un meme : les regrouper obligeait chaque page a empiler sa propre
  // rangee d'onglets sous celle de la destination.
  { key: 'activity', label: 'Activité', icon: Activity, group: 'Pilotage', access: 'admin', match: (p) => p.startsWith('/activity'), to: '/activity' },
  { key: 'insights', label: 'Insights', icon: ChartNoAxesCombined, group: 'Pilotage', access: 'admin', match: (p) => p.startsWith('/analytics'), to: '/analytics' },
  { key: 'admin', label: 'Administration', icon: Wrench, group: 'Administration', access: 'admin', match: (p) => p.startsWith('/users') || p.startsWith('/notifications') || p.startsWith('/settings') || p.startsWith('/logs') || p.startsWith('/maintenance'), to: '/users' },
  // Un moderateur sans acces au tableau de bord garde les signalements comme espace propre.
  { key: 'issues', label: 'Problèmes signalés', icon: MessageSquareWarning, group: 'Pilotage', access: 'moderator', moderatorOnly: true, match: (p) => p.startsWith('/issues'), to: '/issues' },
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
      // Le type de média est un filtre local, pas une sous-section : « Catalogue »
      // reste donc actif quel que soit le filtre Séries/Films/Musique sélectionné.
      return types.length ? types.some((type) => selected.includes(type)) : true;
    },
  };
}

/**
 * Vues de la page Activite, promues au rang de sections de la destination.
 *
 * « Statistiques » a disparu : la Vue d'ensemble en etait le sous-ensemble strict (meme
 * courbe, meme heatmap, memes medias, meme classement), et une section dont le contenu
 * se retrouve entierement dans une autre est une distinction que le lecteur doit deviner.
 * Un `?view=stats` en favori retombe seul sur la Vue d'ensemble, qui n'est plus dans les
 * vues connues de la page.
 *
 * La periode (`days`) n'apparait pas dans ces liens : la page la memorise elle-meme et
 * la restitue quand l'URL ne la porte pas, ce qui evite de la dupliquer sur chacune des
 * surfaces qui affichent ces sections (rail, barre de contexte, page).
 */
export function activitySections(): NavSection[] {
  return [
    { key: 'overview', label: 'Vue d’ensemble', to: '/activity', icon: Gauge },
    { key: 'live', label: 'En direct', to: { path: '/activity', query: { view: 'live' } }, icon: Radio },
    { key: 'history', label: 'Historique', to: { path: '/activity', query: { view: 'history' } }, icon: History },
    { key: 'quality', label: 'Qualité', to: { path: '/activity', query: { view: 'quality' } }, icon: MonitorPlay },
    { key: 'users', label: 'Utilisateurs', to: { path: '/activity', query: { view: 'users' } }, icon: Users },
  ];
}

function pipelineSections(): NavSection[] {
  return [
    { key: 'overview', label: 'Vue d’ensemble', to: { path: '/downloads', query: { view: 'overview' } }, icon: Gauge },
    { key: 'queue', label: 'File d’attente', to: { path: '/downloads', query: { view: 'queue' } }, icon: ListOrdered },
    { key: 'movies', label: 'Films', to: { path: '/downloads', query: { view: 'radarr' } }, icon: Film },
    { key: 'shows', label: 'Séries', to: { path: '/downloads', query: { view: 'sonarr' } }, icon: Tv },
    { key: 'clients', label: 'Clients', to: { path: '/downloads', query: { view: 'clients', sub: 'instances' } }, icon: Download },
  ];
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
        { key: 'calendar', label: 'Calendrier', to: '/calendar', icon: CalendarDays },
      ];
      break;
    case 'requests':
      sections = [{ key: 'tracking', label: 'Suivi des demandes', to: '/discover/requests', icon: Inbox }];
      break;
    case 'library':
      sections = [
        libraryFilter('catalog', 'Catalogue', Library, []),
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
      sections = activitySections();
      break;
    case 'insights':
      sections = [
        { key: 'table', label: 'Inventaire', to: '/analytics', icon: Table },
        { key: 'insights', label: 'Analyses', to: { path: '/analytics', query: { view: 'insights' } }, icon: Lightbulb },
      ];
      break;
    case 'admin':
      sections = [
        { key: 'users', label: 'Utilisateurs', to: '/users', icon: Users },
        { key: 'notifications', label: 'Notifications', to: '/notifications', icon: Bell },
        { key: 'settings', label: 'Paramètres', to: '/settings', icon: Settings },
        { key: 'logs', label: 'Exploitation', to: '/logs', icon: ScrollText },
      ];
      break;
    case 'issues':
      sections = [{ key: 'issues', label: 'Problèmes', to: '/issues', icon: MessageSquareWarning }];
      break;
    case 'downloads':
      sections = pipelineSections();
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
