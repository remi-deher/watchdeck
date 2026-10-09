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
import type { SubnavItem } from '@/components/ui/AppSubnav.vue';
import {
  Activity,
  Bell,
  CalendarDays,
  Cpu,
  Clapperboard,
  Captions,
  Clock,
  Compass,
  DatabaseZap,
  Download,
  Film,
  FolderTree,
  Gauge,
  GitBranch,
  History,
  House,
  Inbox,
  Info,
  Languages,
  Library,
  Link2,
  ListOrdered,
  ListRestart,
  MessageSquareWarning,
  MonitorPlay,
  Music2,
  Network,
  PackageSearch,
  Plug,
  Radio,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Workflow,
  Table,
  MessageSquareText,
  Settings,
  Tv,
  Users,
  Wrench,
  Zap,
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
  /** Mène à une autre page de l'application (marquée d'une flèche), et non à un panneau de la zone. */
  external?: boolean;
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
export const DOCK_DESTINATION_KEYS = ['dashboard', 'library', 'discover', 'requests'];

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
  /** `admin` : groupe de l'espace Administration, absent du rail et du dock de l'app. */
  space?: 'admin';
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
  // Groupe Explorer : la bibliotheque d'abord (ce qu'on possede), puis ce qu'on peut
  // decouvrir, puis ce qui sort.
  { key: 'library', label: 'Bibliothèque', icon: Library, group: 'Explorer', access: 'moderator', match: (p) => p.startsWith('/library') || p.startsWith('/vf-upgrades'), to: { path: '/library', query: { hub: '1' } } },
  { key: 'discover', label: 'Explorer', icon: Compass, group: 'Explorer', match: (p) => p.startsWith('/discover') && !p.startsWith('/discover/requests'), to: '/discover' },
  // Le calendrier suit les sorties : un outil de suivi, pas une facon de parcourir le
  // catalogue. Il etait une section d'Explorer ; il devient une destination.
  { key: 'calendar', label: 'Calendrier', icon: CalendarDays, group: 'Explorer', match: (p) => p.startsWith('/calendar'), to: '/calendar' },
  { key: 'requests', label: 'Demandes', icon: Inbox, group: 'Workflow', match: (p) => p.startsWith('/discover/requests') || p.startsWith('/releases/'), to: '/discover/requests' },
  { key: 'downloads', label: 'Acquisition', icon: GitBranch, group: 'Gestion des médias', access: 'admin', match: (p) => p.startsWith('/downloads'), to: '/downloads' },
  { key: 'storage', label: 'Stockage et transferts', icon: DatabaseZap, group: 'Gestion des médias', access: 'admin', match: (p) => p.startsWith('/storage'), to: '/storage' },
  // Traitements FileFlows (reencodage, correction des sous-titres) : suivi et relance.
  { key: 'encoding', label: 'Encodage', icon: Cpu, group: 'Gestion des médias', access: 'admin', match: (p) => p.startsWith('/encoding'), to: '/encoding' },
  // Lectures Plex et analyse du catalogue sont deux espaces distincts, pas deux
  // sections d'un meme : les regrouper obligeait chaque page a empiler sa propre
  // rangee d'onglets sous celle de la destination.
  { key: 'activity', label: 'Activité', icon: Activity, group: 'Pilotage', access: 'admin', match: (p) => p.startsWith('/activity'), to: '/activity' },
  // L'analyse du catalogue vit dans l'Inventaire (bascule Fichiers / Insights de la
  // page) : une seule entree, sans rangee de sections.
  { key: 'insights', label: 'Inventaire', icon: Table, group: 'Pilotage', access: 'admin', match: (p) => p.startsWith('/analytics'), to: '/analytics' },
  // L'administration n'a plus qu'une porte dans le rail (voir `ADMIN_ENTRY`) : ses sept
  // destinations y occupaient la moitie de la colonne, qui etait coupee des 900px de
  // haut. Elle forme desormais un espace a part, avec sa propre barre laterale qui prend
  // la place du rail tant qu'on y est (voir `AppShell`). Les entrees ci-dessous sont les
  // groupes de cet espace : elles restent des destinations -- avec leurs sections, leur
  // etat actif et leur place dans la palette --, mais `space: 'admin'` les retire du
  // rail, du dock et de la feuille de navigation de l'application.
  { key: 'admin-overview', label: 'Vue d’ensemble', icon: Gauge, group: '', space: 'admin', access: 'admin', match: (p) => p === '/settings', to: '/settings' },
  // Les zones se rangent par ce qu'on y fait, et non par la facon dont le code les a
  // construites : les services qu'on branche, le comportement qu'on regle, les acces qu'on
  // donne, l'exploitation au quotidien.
  { key: 'admin-connections', label: 'Connexions', icon: Plug, group: 'Services', space: 'admin', access: 'admin', match: (p) => p.startsWith('/settings/services'), to: '/settings/services' },
  { key: 'admin-acquisition', label: 'Acquisition & stockage', icon: Download, group: 'Services', space: 'admin', access: 'admin', match: (p) => p.startsWith('/settings/acquisition'), to: '/settings/acquisition' },
  { key: 'admin-automation', label: 'Automatisation', icon: Zap, group: 'Comportement', space: 'admin', access: 'admin', match: (p) => p.startsWith('/settings/automation'), to: '/settings/automation' },
  { key: 'admin-notifications', label: 'Notifications', icon: Bell, group: 'Comportement', space: 'admin', access: 'admin', match: (p) => p.startsWith('/notifications') || p.startsWith('/settings/notifications'), to: '/notifications' },
  { key: 'admin-requests', label: 'Demandes & quotas', icon: Inbox, group: 'Comportement', space: 'admin', access: 'admin', match: (p) => p.startsWith('/settings/requests'), to: '/settings/requests' },
  { key: 'admin-users', label: 'Utilisateurs', icon: Users, group: 'Accès', space: 'admin', access: 'admin', match: (p) => p.startsWith('/users'), to: '/users' },
  { key: 'admin-security', label: 'Sécurité & API', icon: ShieldCheck, group: 'Accès', space: 'admin', access: 'admin', match: (p) => p.startsWith('/settings/security'), to: '/settings/security' },
  { key: 'admin-maintenance', label: 'Maintenance & données', icon: Wrench, group: 'Exploitation', space: 'admin', access: 'admin', match: (p) => p.startsWith('/settings/maintenance'), to: '/settings/maintenance' },
  // Les journaux et la version se consultent, on n'y regle rien.
  { key: 'admin-system', label: 'Journaux & version', icon: ScrollText, group: 'Exploitation', space: 'admin', access: 'admin', match: (p) => p.startsWith('/settings/system') || p.startsWith('/logs'), to: '/logs' },
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

/** Destinations de l'application (hors espace Administration) visibles pour les droits donnés. */
export function destinationsFor(isAdmin: boolean, canModerate: boolean): NavDestination[] {
  return permitted(DESTINATIONS, isAdmin, canModerate).filter((destination) => !destination.space);
}

/** Groupes de l'espace Administration, dans l'ordre de sa barre latérale. */
export function adminAreasFor(isAdmin: boolean): NavDestination[] {
  return isAdmin ? DESTINATIONS.filter((destination) => destination.space === 'admin') : [];
}

/**
 * La porte unique de l'espace Administration, posée en pied de rail à côté du profil.
 *
 * Ce n'est pas une destination : elle ne porte aucune section et n'est jamais « la »
 * destination d'une page. Elle s'allume quand la page relève de l'un des groupes de
 * l'espace.
 */
export const ADMIN_ENTRY = { key: 'admin', label: 'Administration', icon: Settings, to: '/settings' } as const;

/** Vrai quand la destination appartient à l'espace Administration. */
export function isAdminSpace(destination: Pick<NavDestination, 'space'> | null | undefined): boolean {
  return destination?.space === 'admin';
}

/**
 * Destination couvrant `path` pour les droits donnés.
 *
 * Les droits comptent : `/issues` relève du tableau de bord pour un administrateur,
 * mais constitue l'espace propre d'un modérateur, qui n'y a pas accès.
 */
export function destinationForPath(path: string, isAdmin: boolean, canModerate: boolean): NavDestination | null {
  return permitted(DESTINATIONS, isAdmin, canModerate).find((destination) => destination.match(path)) || null;
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
  // « Films » et « Séries » ont disparu : c'etaient deux fois la meme page, au type de
  // media pres, et « File d'attente » etait deja cette page sans le filtre. Trois
  // sections pour une seule liste, qui obligeaient a choisir une porte d'entree avant
  // meme de savoir ce qu'on cherche. Le type est devenu un filtre de la file.
  //
  // « Elements manquants » sort en revanche de la file : ce n'est pas un etat de
  // telechargement mais son complement -- ce qui devrait etre la et n'y est pas --,
  // avec sa propre source et son propre gabarit.
  return [
    { key: 'overview', label: 'Vue d’ensemble', to: { path: '/downloads', query: { view: 'overview' } }, icon: Gauge },
    { key: 'queue', label: 'File d’attente', to: { path: '/downloads', query: { view: 'queue' } }, icon: ListOrdered },
    { key: 'missing', label: 'Éléments manquants', to: { path: '/downloads', query: { view: 'missing' } }, icon: PackageSearch },
    { key: 'clients', label: 'Clients', to: { path: '/downloads', query: { view: 'clients', sub: 'instances' } }, icon: Download },
    // Le suivi des lots de series et la resolution des conflits sont des taches du
    // quotidien : ils vivaient caches dans les reglages, sous « Exploitation ».
    { key: 'acquisitions', label: 'Acquisitions & conflits', to: '/downloads/acquisitions', icon: ListRestart },
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
    // Explorer n'a plus de sous-entrees dans le rail : Accueil, Films et Series sont des
    // vues de la meme page, en onglets dans la page (voir `EXPLORER_TABS`). Une section
    // unique, comme les Demandes : le rail n'affiche de sous-entrees qu'a partir de deux.
    case 'discover':
      sections = [{ key: 'home', label: 'Explorer', to: '/discover', icon: Compass }];
      break;
    case 'calendar':
      sections = [{ key: 'calendar', label: 'Calendrier', to: '/calendar', icon: CalendarDays }];
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
      ];
      break;
    case 'admin-overview':
      // Page d'etat, pas de navigation : ce qui est casse, ce qui manque, ce qui tourne.
      sections = [{ key: 'overview', label: 'Vue d’ensemble', to: '/settings', icon: Gauge }];
      break;
    case 'admin-connections':
      sections = [
        { key: 'plex', label: 'Plex', to: '/settings/services', icon: Tv },
        { key: 'media', label: 'Médias', to: '/settings/services/media', icon: Clapperboard },
        { key: 'integrations', label: 'Informations', to: '/settings/services/integrations', icon: Info },
        { key: 'webhooks', label: 'Webhooks', to: '/settings/services/webhooks', icon: Link2 },
      ];
      break;
    case 'admin-acquisition':
      // Les clients et les regles de telechargement se reglent ici ; l'exploitation des
      // acquisitions et du stockage reste sur leurs pages, dont on garde la porte.
      sections = [
        { key: 'clients', label: 'Clients', to: '/settings/acquisition', icon: Download },
        { key: 'downloads', label: 'Règles', to: '/settings/acquisition/downloads', icon: SlidersHorizontal },
        { key: 'acquisitions', label: 'Acquisitions & conflits', to: '/downloads/acquisitions', icon: ListRestart, external: true },
        { key: 'storage', label: 'Stockage et transferts', to: '/storage', icon: DatabaseZap, external: true },
      ];
      break;
    case 'admin-automation':
      sections = [
        { key: 'vf-upgrades', label: 'Améliorations VF', to: '/settings/automation', icon: Languages },
        { key: 'subtitles', label: 'Sous-titres', to: '/settings/automation/subtitles', icon: Captions },
        { key: 'scheduled-tasks', label: 'Planification', to: '/settings/automation/scheduled-tasks', icon: Clock },
      ];
      break;
    case 'admin-notifications':
      // Le suivi des envois d'abord : la file d'attente (envoi suspendu, envois manuels)
      // et le journal sont le quotidien de cette zone ; les reglages viennent ensuite,
      // separes par un trait (le `group` n'a pas de libelle dans la rangee d'onglets).
      sections = [
        {
          key: 'pending',
          label: 'File d’attente',
          to: { path: '/notifications', query: { tab: 'pending' } },
          icon: Inbox,
          group: 'Suivi',
          active: (route) => route.path === '/notifications' && route.query.tab === 'pending',
        },
        {
          key: 'history',
          label: 'Journal des envois',
          to: '/notifications',
          icon: History,
          group: 'Suivi',
          active: (route) => route.path === '/notifications' && route.query.tab !== 'pending',
        },
        { key: 'channels', label: 'Canaux', to: '/settings/notifications/channels', icon: Plug, group: 'Réglages' },
        { key: 'rules', label: 'Règles', to: '/settings/notifications/rules', icon: Settings, group: 'Réglages' },
        { key: 'templates', label: 'Modèles d’emails', to: '/settings/notifications/templates', icon: Link2, group: 'Réglages' },
        { key: 'reasons', label: 'Motifs de message', to: '/settings/notifications/reasons', icon: MessageSquareText, group: 'Réglages' },
      ];
      break;
    case 'admin-requests':
      sections = [{ key: 'requests', label: 'Demandes & quotas', to: '/settings/requests', icon: Inbox }];
      break;
    case 'admin-users':
      sections = [{ key: 'users', label: 'Utilisateurs', to: '/users', icon: Users }];
      break;
    case 'admin-security':
      sections = [
        // Une seule page : l'ancienne adresse du jeton (/settings/security/api) y reste rattachée.
        { key: 'network', label: 'Sécurité & API', to: '/settings/security', icon: Network, active: (route) => route.path.startsWith('/settings/security') },
      ];
      break;
    case 'admin-maintenance':
      sections = [
        { key: 'maintenance', label: 'Maintenance', to: '/settings/maintenance', icon: Wrench },
        { key: 'data', label: 'Données & sauvegardes', to: '/settings/maintenance/data', icon: DatabaseZap },
        { key: 'privacy', label: 'Confidentialité & RGPD', to: '/settings/maintenance/privacy', icon: ShieldCheck },
      ];
      break;
    case 'admin-system':
      sections = [
        { key: 'logs', label: 'Journaux', to: '/logs', icon: ScrollText },
        { key: 'version', label: 'Version & mises à jour', to: '/settings/system/version', icon: GitBranch },
      ];
      break;
    case 'issues':
      sections = [{ key: 'issues', label: 'Problèmes', to: '/issues', icon: MessageSquareWarning }];
      break;
    case 'storage':
      sections = [{ key: 'storage', label: 'Stockage et transferts', to: '/storage', icon: DatabaseZap }];
      break;
    case 'encoding':
      sections = [
        { key: 'overview', label: 'Vue d’ensemble', to: '/encoding', icon: Gauge },
        { key: 'queue', label: 'File d’attente', to: '/encoding/queue', icon: ListOrdered },
        { key: 'libraries', label: 'Bibliothèques', to: '/encoding/libraries', icon: FolderTree },
        { key: 'history', label: 'Historique', to: '/encoding/history', icon: History },
        { key: 'flows', label: 'Flows', to: '/encoding/flows', icon: Workflow },
        { key: 'settings', label: 'Réglages', to: '/encoding/settings', icon: SlidersHorizontal },
      ];
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

/**
 * Les destinations que le dock peut porter, dans l'ordre, filtrees selon les droits.
 *
 * Le calcul vit ici plutot que dans le dock parce que le shell a besoin de la meme
 * reponse : les sections d'une destination absente du dock n'ont aucune entree ou se
 * greffer, et doivent alors rejoindre la feuille de navigation. Deux copies de cette
 * liste auraient fini par ne plus dire la meme chose.
 */
export function dockDestinationsFor(isAdmin: boolean, canModerate: boolean): NavDestination[] {
  const permitted = destinationsFor(isAdmin, canModerate);
  const preferred = DOCK_DESTINATION_KEYS
    .map((key) => permitted.find((item) => item.key === key))
    .filter((item): item is NavDestination => Boolean(item));
  // Un utilisateur non-administrateur perd `dashboard` : on complete avec ses autres
  // destinations plutot que de laisser un dock a trois entrees.
  const filler = permitted.filter((item) => !preferred.includes(item));
  return [...preferred, ...filler].slice(0, 4);
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

/* ─────────────────────────── Onglets dans la page ────────────────────────── */

/* Explorer et la Bibliotheque presentent leurs vues par type de media en onglets dans la
   page, a toutes les largeurs, plutot qu'en sous-entrees du rail : ce ne sont pas des
   destinations mais des facons de regarder le meme ensemble. */

/** Onglets d'Explorer : les vues de la page `/discover`. */
export const EXPLORER_TABS: SubnavItem[] = [
  { key: 'home', label: 'Accueil', to: '/discover', icon: House },
  { key: 'movies', label: 'Films', to: '/discover/movies', icon: Film },
  { key: 'shows', label: 'Séries', to: '/discover/shows', icon: Tv },
];

export function explorerTabFor(path: string): string {
  if (path.startsWith('/discover/movies')) return 'movies';
  if (path.startsWith('/discover/shows')) return 'shows';
  return 'home';
}

const MUSIC_TYPES = ['artist', 'album', 'track'];

/** Onglets du catalogue de la Bibliotheque : tout, ou un type de media. */
export const LIBRARY_TYPE_TABS: SubnavItem[] = [
  { key: 'all', label: 'Tout', to: { path: '/library', query: { hub: '1' } }, icon: Library },
  { key: 'movie', label: 'Films', to: { path: '/library', query: { hub: '1', type: ['movie'] } }, icon: Film },
  { key: 'show', label: 'Séries', to: { path: '/library', query: { hub: '1', type: ['show'] } }, icon: Tv },
  { key: 'music', label: 'Musique', to: { path: '/library', query: { hub: '1', type: MUSIC_TYPES } }, icon: Music2 },
];

export function libraryTypeTabFor(route?: RouteLocationNormalizedLoaded): string {
  const types = libraryTypeFilters(route);
  if (types.length === 1 && (types[0] === 'movie' || types[0] === 'show')) return types[0];
  if (types.length && types.every((type) => MUSIC_TYPES.includes(type))) return 'music';
  return 'all';
}
