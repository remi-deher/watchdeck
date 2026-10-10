/* Ce que la page Utilisateurs confie au gabarit « Gérer » : ses colonnes et ses actions,
 * décrites en données. Le gabarit les rend ; la page ne dessine ni barre d'actions, ni menu,
 * ni confirmation. Les clés d'action (`status:on`, `role:admin`…) sont décodées par
 * `useUserAccounts`. */
import { Bell, BellOff, LogIn, LogOut, Pencil, Power, PowerOff, Shield, Trash2 } from '@lucide/vue';
import type { ControlAction } from '@/components/ui/ControlTable.vue';
import type { UiColumn } from '@/components/ui/UiDataTable.vue';
import { accountName, resolveSource, sourceLabel, type AccountLike } from '@/utils/userLabels';

export interface AppUser extends AccountLike {
  id: number | string;
  notify_admin?: boolean;
  has_notification_error?: boolean;
  can_login?: boolean;
  last_requested_at?: string;
  stats?: { total?: number; pending_approval?: number };
  request_count?: number;
}

export const requestCount = (user: AppUser): number => Number(user.stats?.total ?? user.request_count ?? 0);

/* Toute la liste est chargée : le tableau trie lui-même, d'un clic sur l'en-tête. Le rang
   du rôle suit la hiérarchie (administrateur, modérateur, utilisateur) plutôt que l'alphabet. */
const ROLE_RANK: Record<string, number> = { admin: 0, moderator: 1, user: 2 };
export const USER_COLUMNS: UiColumn<AppUser>[] = [
  { key: 'person', label: 'Personne', card: 'title', sortable: true, sortValue: (user) => accountName(user).toLocaleLowerCase('fr') },
  { key: 'source', label: 'Origine du compte', sortable: true, sortValue: (user) => sourceLabel(resolveSource(user)) },
  { key: 'role', label: 'Rôle', sortable: true, sortValue: (user) => ROLE_RANK[String(user.role)] ?? 3 },
  { key: 'requests', label: 'Demandes', sortable: true, sortValue: requestCount },
  { key: 'last', label: 'Dernière activité', sortable: true, sortValue: (user) => String(user.last_requested_at || '') },
];

const ROLES = [
  { value: 'user', label: 'Utilisateur' },
  { value: 'moderator', label: 'Modérateur' },
  { value: 'admin', label: 'Administrateur' },
];
/* Libellés complets : « Notif. demande », « Digest » et « VF series » étaient abrégés ou sans
   accent, dans un menu où l'on choisit ce qu'on va modifier en masse. */
const NOTIFY_FIELDS = [
  { value: 'notify_on_request', label: 'Accusé de demande' },
  { value: 'notify_on_available', label: 'Avis de disponibilité' },
  { value: 'notify_digest', label: 'Résumé quotidien' },
  { value: 'notify_admin', label: "Copie à l'administrateur" },
  { value: 'notify_vf_movie', label: 'VF des films' },
  { value: 'notify_vf_series', label: 'VF des séries' },
];

const accounts = (count: number): string => `${count} compte${count > 1 ? 's' : ''}`;
/* Les comptes visés, nommés dans la confirmation : « 8 comptes » ne dit pas lesquels. */
const named = (users: AppUser[]) => users.map((user) => ({
  key: user.id,
  label: accountName(user),
  detail: `${requestCount(user)} demande${requestCount(user) > 1 ? 's' : ''}`,
}));
/* Au-delà de trois comptes, supprimer demande de taper leur nombre : un clic de trop ne suffit plus. */
const TYPED_THRESHOLD = 3;

/* Donner le rôle administrateur ou bloquer la connexion change ce que les gens peuvent faire :
   on le dit avant, en nommant les comptes. Les autres changements de droits partent directement. */
const confirmAdmin = (users: AppUser[]) => ({
  title: `Donner le rôle administrateur à ${accounts(users.length)} ?`,
  message: 'Ils pourront modifier les réglages, voir tous les comptes et approuver les demandes.',
  confirmLabel: 'Appliquer le rôle',
  danger: false,
  items: named(users),
});
const confirmBlock = (users: AppUser[]) => ({
  title: `Bloquer la connexion de ${accounts(users.length)} ?`,
  message: 'Ils ne pourront plus se connecter tant que la connexion n’est pas autorisée à nouveau. Leurs demandes en cours ne changent pas.',
  confirmLabel: 'Bloquer la connexion',
  danger: true,
  items: named(users),
});
const confirmDelete = (users: AppUser[]) => ({
  title: `Supprimer ${accounts(users.length)} ?`,
  message: 'Leurs demandes et leur historique sont supprimés avec eux. Cette action est définitive.',
  confirmLabel: `Supprimer ${accounts(users.length)}`,
  danger: true,
  items: named(users),
  typeToConfirm: users.length > TYPED_THRESHOLD ? String(users.length) : '',
});

/** Actions sur les comptes cochés : quatre contrôles, trois menus rangés par intention. */
export const USER_BULK_ACTIONS: ControlAction<AppUser>[] = [
  { key: 'status', label: 'Statut', icon: Power, items: [
    { key: 'status:on', label: 'Activer les comptes', icon: Power },
    { key: 'status:off', label: 'Désactiver les comptes', icon: PowerOff },
  ] },
  { key: 'notify', label: 'Notifications', icon: Bell, items: NOTIFY_FIELDS.flatMap((field, index) => [
    { key: `notify:${field.value}:on`, label: `${field.label} : activer`, icon: Bell, separated: index > 0 },
    { key: `notify:${field.value}:off`, label: `${field.label} : désactiver`, icon: BellOff },
  ]) },
  { key: 'access', label: 'Rôle & connexion', icon: Shield, items: [
    ...ROLES.map((role): ControlAction<AppUser> => ({
      key: `role:${role.value}`,
      label: `Rôle : ${role.label}`,
      icon: Shield,
      confirm: role.value === 'admin' ? confirmAdmin : undefined,
    })),
    { key: 'login:on', label: 'Autoriser la connexion', icon: LogIn, separated: true },
    { key: 'login:off', label: 'Bloquer la connexion', icon: LogOut, confirm: confirmBlock },
  ] },
  { key: 'delete', label: 'Supprimer…', icon: Trash2, tone: 'danger', confirm: confirmDelete },
];

/** Actions d'un compte : modifier, puis activer ou désactiver. */
export function userRowActions(user: AppUser): ControlAction<AppUser>[] {
  return [
    { key: 'open', label: 'Modifier', icon: Pencil },
    user.enabled
      ? { key: 'toggle', label: 'Désactiver', icon: Power }
      : { key: 'toggle', label: 'Activer', icon: Power },
  ];
}
