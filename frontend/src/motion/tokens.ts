/**
 * Langage de mouvement de Watchdeck.
 *
 * Toutes les animations pilotees en script puisent ici, comme les feuilles de style
 * puisent dans les variables `--motion-*` de `_motion.scss` (memes valeurs). Un seul
 * vocabulaire, c'est ce qui fait qu'une interface parait fluide : chaque surface part et
 * arrive au meme rythme, au lieu d'un patchwork de durees choisies au cas par cas.
 *
 * Ton retenu : cinematique et expressif. Les surfaces qu'on ouvre ont un leger
 * depassement a l'arrivee (un ressort, pas une deceleration) ; ce qu'on quitte part vite.
 */

/** Durees, en secondes (unite de motion-v). */
export const duree = {
  /** Retours immediats : appui, survol, bascule. */
  eclair: 0.12,
  /** Changements d'etat d'un composant. */
  rapide: 0.2,
  /** Entrees de contenu, fondus de page. */
  base: 0.32,
  /** Grandes surfaces : fiche, transport d'affiche. */
  ample: 0.5,
} as const;

/** Courbes de Bezier, au format motion-v. */
export const courbe = {
  /** Deceleration franche : ce qui arrive. */
  entree: [0.16, 1, 0.3, 1],
  /** Acceleration : ce qui part. */
  sortie: [0.4, 0, 1, 1],
  /** Aller-retour d'un etat a l'autre. */
  standard: [0.2, 0.8, 0.2, 1],
} as const;

/** Ressorts. `stiffness`/`damping`/`mass` au sens de motion-v. */
export const ressort = {
  /** Une surface qui s'ouvre : arrive vite, depasse a peine, se pose. */
  surface: { stiffness: 300, damping: 30, mass: 1 },
  /** Transport d'une affiche jusqu'a la fiche : plus ample, plus visible. */
  transport: { stiffness: 210, damping: 24, mass: 0.9 },
  /** Une feuille relachee qui revient a sa place. */
  retour: { stiffness: 420, damping: 36, mass: 0.9 },
  /** Une feuille lancee hors de l'ecran : garde l'elan du doigt, sans rebond. */
  lancer: { stiffness: 260, damping: 40, mass: 1 },
  /** Appui sur un element tactile. */
  appui: { stiffness: 600, damping: 32, mass: 0.6 },
} as const;
