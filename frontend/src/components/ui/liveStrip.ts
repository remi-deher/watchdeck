import type { TrackAction } from '@/components/templates/track/types';
import type { WorkRef } from '@/types/generated/mediaAvailability';
/* Bandeau « en direct » commun (LiveStrip) : ce qui se passe maintenant -- lectures Plex,
   fichiers en cours d'encodage, telechargements, transferts. Le composant decide de la
   disposition ; la page traduit ses objets en cartes. */

import type { MediaRef } from '@/types';
import type { PersonRef } from '@/utils/userLabels';
import type { PlexClientRef } from '@/utils/plexClient';

export type LiveTone = 'neutral' | 'accent' | 'warn' | 'remote' | 'hdr' | 'ok';

/** Un fait lisible sous la carte : une icone qui dit ce qu'il est, et sa valeur. */
export interface LiveFact {
  key: string;
  label: string;
  icon?: any;
  tone?: LiveTone;
}

export interface LiveItem {
  work?: WorkRef;
  actions?: TrackAction[];
  key: string;
  /** Titre ecrit ; remplace par le logo quand il y en a un (dispositions larges). */
  title: string;
  /** Logo de l'oeuvre et ce qu'il ne dit pas (episode, annee). */
  logo?: string | null;
  logoCaption?: string;
  /** Sous le titre : temps restant, etape, debit… */
  status?: string;
  /** 0 a 100 ; absent, pas de barre. */
  progress?: number | null;
  paused?: boolean;
  /** Le media montre : son affiche et son fond s'affichent d'office (voir MediaRef).
      `poster` / `backdrop` ne servent qu'a ce qui n'est pas un media de la bibliotheque. */
  media?: MediaRef | null;
  /** Fond (dispositions larges) et affiche. */
  backdrop?: string | null;
  poster?: string | null;
  /** Repli sans image. */
  icon?: any;
  /** En haut a gauche : mode de lecture, etape, client… (remplacable par l'emplacement `badge`). */
  badge?: { label: string; tone?: LiveTone } | null;
  /** En haut a droite : qui (avatar) ou ou (disque, client). */
  corner?: { person?: PersonRef; avatar?: string | null; name?: string; label?: string; icon?: any } | null;
  /** Sous l'image : qui et sur quoi (« Rémi · Apple TV », « usb2 · Films »). */
  who?: string;
  person?: PersonRef;
  client?: PlexClientRef;
  facts?: LiveFact[];
  /** Ce qui merite une explication (raison d'une conversion, d'un blocage). */
  note?: string;
  [key: string]: any;
}

export interface LiveIdle {
  title: string;
  message?: string;
  icon?: any;
  /** L'icone signale un etat a corriger (collecte desactivee…). */
  warn?: boolean;
  action?: { label: string; to: string | Record<string, any>; primary?: boolean };
}
