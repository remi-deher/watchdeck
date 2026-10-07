# Palettes et apparence

Les palettes Cinéma (par défaut), Menthe, Océan, Lavande et Graphite sont indépendantes du mode Système / Clair / Sombre. Le choix se fait dans le profil ou le menu mobile, avec le même composant `ThemeSettings`. Les préférences restent propres au navigateur.

Les composants utilisent les rôles CSS existants (`--bg`, `--surface`, `--text`, `--muted`, `--accent`, `--on-accent`, etc.). Les palettes clair/sombre sont centralisées dans `frontend/src/styles/foundations/_tokens.scss`. Les états, erreurs et badges de langue gardent leurs couleurs sémantiques.

Pour ajouter une palette : définir ses deux variantes dans les mixins `palettes-dark` / `palettes-light`, l’ajouter à `PALETTE_OPTIONS` dans `useTheme.ts`, puis à la liste de restauration avant rendu dans `index.html`. Le test `useTheme.spec.ts` vérifie la concordance de ces listes et la conservation de la palette lors d’une bascule d’apparence. Vérifier le contraste du texte, des actions et des contrôles dans les deux variantes.

## Accueil harmonisé

Le bandeau `DashboardLiveStrip` est conservé sous l’en-tête. Les téléchargements prennent toute la largeur. Le centre d’actions est repliable, suivi d’une synthèse, du parcours d’acquisition et des ajouts récents. Les opportunités VF, l’activité et la supervision utilisent les composants existants. Le rail compact devient le choix initial, tout en conservant le choix déjà enregistré et la possibilité de le déployer.
