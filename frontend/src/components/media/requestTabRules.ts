import { arrName, canClose, shortDate } from './requestRules';

/* Règles d'affichage de l'onglet Demandes d'une fiche (MediaRequestsTab) : la carte
   Administration et le parcours d'un média arrivé sans demande. Fonctions pures. */

/** La carte Administration a-t-elle des actions de suivi à proposer ? */
export function hasFollowActions(row: any): boolean {
  return row.status === 'pending_approval' || Boolean(row.arr_id) || row.status === 'failed' || canClose(row);
}

/* Trois états, pas deux : « suivre le réglage global » n'est pas « désactivé ». */
export const AUTO_IMPORT_OPTIONS = [
  { value: 'inherit', label: 'Suivre le réglage global' },
  { value: 'on', label: 'Automatique pour ce média' },
  { value: 'off', label: 'Toujours manuel pour ce média' },
];

/** Choix affiché pour le rapprochement des imports bloqués de la demande. */
export function autoImportValue(row: any): string {
  if (row.auto_import_reconciliation === null || row.auto_import_reconciliation === undefined) return 'inherit';
  return row.auto_import_reconciliation ? 'on' : 'off';
}

/** Valeur envoyée au serveur : `null` suit le réglage global. */
export function autoImportFromChoice(value: string): boolean | null {
  return value === 'inherit' ? null : value === 'on';
}

/** Options du choix d'une personne à ajouter comme demandeur. */
export function requesterOptions(users: any[]): { value: string; label: string }[] {
  return [
    { value: '', label: users.length ? 'Choisir un utilisateur…' : 'Tous les utilisateurs sont déjà demandeurs' },
    ...users.map((u: any) => ({ value: u.plex_user_id, label: String(u.custom_name || u.display_name || u.plex_user_id) })),
  ];
}

/* Sans demande : d'où vient le média, d'après ce que la fiche sait. */

/** « ce film », « cette série » ou « ce média ». */
export function mediaNoun(detail: any): string {
  const type = detail?.media_type;
  if (type === 'movie') return 'ce film';
  if (type === 'show') return 'cette série';
  return 'ce média';
}

/** Titre du parcours d'un média ajouté sans demandeur. */
export function directHeadline(detail: any): string {
  return detail?.arr_id ? `Ajouté directement dans ${arrName(detail)}` : 'Ajouté directement dans Plex';
}

/** Sous-titre du même parcours : date d'arrivée dans Plex et présence de la VF. */
export function directSubtitle(detail: any): string {
  const parts: string[] = [];
  const added = shortDate(detail?.added_at);
  if (added) parts.push(`Dans Plex depuis le ${added}`);
  if (detail?.has_vf === true) parts.push('VF présente');
  else if (detail?.has_vf === false) parts.push('VF absente');
  return parts.join(' · ');
}
