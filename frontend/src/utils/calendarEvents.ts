/* Vocabulaire du calendrier : etat d'une sortie, type de sortie, origine des demandes.
 *
 * L'ecran ne distinguait que « Disponible » : une sortie passee sans fichier, une autre
 * en cours de telechargement et une autre annoncee dans six mois portaient la meme
 * teinte grise. L'etat est deduit ici, une seule fois, pour la grille, la semaine,
 * l'agenda, la legende et le filtre. */
import type { Component } from 'vue';
import { Clapperboard, Disc3, MonitorPlay, Tv } from '@lucide/vue';

export type CalendarState = 'available' | 'downloading' | 'late' | 'released' | 'upcoming';

export interface CalendarEvent {
  type: 'movie' | 'episode' | string;
  release_type?: string | null;
  date: string;
  title: string;
  subtitle?: string;
  has_file?: boolean;
  downloading?: boolean;
  vf_state?: string | null;
  sources?: string[];
  [key: string]: any;
}

/* Sonarr et Radarr ne recuperent pas un fichier a la minute de la diffusion : sans ce
   delai, chaque episode du soir passerait « en retard » pendant quelques heures. */
export const LATE_GRACE_MS = 6 * 60 * 60 * 1000;

export const STATE_LABELS: Record<CalendarState, string> = {
  available: 'Disponible',
  downloading: 'En téléchargement',
  late: 'En retard',
  released: 'En salle',
  upcoming: 'À venir',
};

/** Ordre de la legende et du filtre. */
export const STATE_ORDER: CalendarState[] = ['available', 'downloading', 'late', 'released', 'upcoming'];

export function eventState(event: CalendarEvent, now: number = Date.now()): CalendarState {
  if (event.has_file) return 'available';
  if (event.downloading) return 'downloading';
  const at = Date.parse(event.date);
  if (Number.isNaN(at) || at + LATE_GRACE_MS > now) return 'upcoming';
  // Une sortie en salle passee n'attend aucun fichier : ce n'est pas un retard.
  if (event.type === 'movie' && event.release_type === 'cinema') return 'released';
  return 'late';
}

export function releaseIcon(event: CalendarEvent): Component {
  if (event.type !== 'movie') return Tv;
  if (event.release_type === 'cinema') return Clapperboard;
  if (event.release_type === 'physical') return Disc3;
  return MonitorPlay;
}

/* Les demandes portent l'origine technique de leur creation (`seer`, `manual_bulk`,
   `plex_sync`...) : trop fine pour un filtre. On les regroupe par provenance. */
const SOURCE_GROUPS: Record<string, string> = {
  seer: 'seer',
  rss: 'watchlist',
  api: 'watchlist',
  plex: 'watchlist',
  plex_sso: 'watchlist',
  plex_sync: 'watchlist',
  arr: 'arr',
  arr_sync: 'arr',
  sonarr: 'arr',
  radarr: 'arr',
  manual: 'manual',
  manual_admin: 'manual',
  manual_bulk: 'manual',
  manual_import: 'manual',
  user_request: 'manual',
  local: 'manual',
};

export const SOURCE_GROUP_LABELS: Record<string, string> = {
  watchlist: 'Watchlist Plex',
  seer: 'Seer',
  manual: 'Manuelle',
  arr: 'Ajout Sonarr/Radarr',
};

export function sourceGroup(source: string): string {
  return SOURCE_GROUPS[source] || source;
}

export function sourceGroupLabel(group: string): string {
  return SOURCE_GROUP_LABELS[group] || group;
}

export function eventSourceGroups(event: CalendarEvent): string[] {
  return [...new Set((event.sources || []).map(sourceGroup))];
}
