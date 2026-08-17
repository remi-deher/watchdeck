# Migration progressive de l'interface

## Objectif

Remplacer les conventions CSS globales implicites par des composants UI partagés et des styles dont le propriétaire est clair, sans migration massive ni changement visuel simultané.

## Règle de propriété

- `frontend/src/styles/foundations/` : tokens, reset, typographie et accessibilité.
- `frontend/src/styles/layout/` : structure générale de l'application et rares primitives de disposition.
- `frontend/src/styles/components/` : règles globales des composants transverses encore partagés par classe.
- `frontend/src/styles/views/` : règles globales nécessaires à plusieurs vues.
- `frontend/src/components/ui/` : structure, comportement et styles des composants réutilisables.
- Composants et vues métier : styles `scoped lang="scss"` propres à la fonctionnalité.

Une règle ne doit être globale que si elle s'applique volontairement à toute l'application. Une structure répétée avec des états ou une accessibilité propre devient un composant Vue. Une règle exclusivement liée à une fonctionnalité reste près de cette fonctionnalité.

## Phases

### Phase 1 — Primitives de base

- Introduire `UiButton` et `UiEmptyState`.
- Les intégrer aux composants UI existants avant de migrer les vues.
- Conserver temporairement les anciennes classes globales pour éviter les régressions.

### Phase 2 — Actions

- Migrer `.primary`, `.secondary`, `.danger-button` et `.icon-button` par domaine fonctionnel.
- Ajouter les variantes à `UiButton` uniquement lorsqu'un cas réel le justifie.
- Supprimer une règle historique seulement lorsque sa dernière utilisation a disparu.

Progression : le socle partagé (`ModalShell`, `ConfirmModal`, `DrawerShell`, filtres, pagination, sauvegarde, tableaux et installation PWA) ainsi que le domaine Administration (`Notifications`, `Journaux`, `Signalements`) utilisent désormais `UiButton`. Les règles historiques restent présentes pour les domaines non encore migrés.

### Phase 3 — Retours et états

- Migrer les usages de `.empty` vers `UiEmptyState`.
- Consolider `.notice`, les erreurs locales et les chargements autour de `UiFeedback`.
- Séparer `UiBadge`, générique, de `StatusBadge`, qui traduit les statuts métier.

Progression : `UiBadge` porte désormais le rendu visuel générique et `StatusBadge` ne conserve que la traduction métier. Les états vides et messages des composants partagés ainsi que du domaine Administration ont commencé à migrer vers `UiEmptyState` et `UiFeedback`.

### Phase 4 — Formulaires

- Introduire `UiField` pour les libellés, aides et erreurs.
- Unifier ensuite les contrôles uniquement lorsque leurs APIs sont stabilisées.

Progression : `UiField` centralise désormais libellé, aide, erreur et associations accessibles. Le profil et les connexions Plex/TMDB constituent le premier lot migré ; les cases à cocher restent hors de cette primitive en attendant une API dédiée confirmée par davantage de cas.

### Phase 5 — Panneaux et navigation locale

- Étendre `PanelCard` et créer un en-tête de section partagé.
- Consolider les barres d'actions, contrôles segmentés et filtres.

Progression : `UiSectionHeader` et `UiToolbar` fournissent désormais la structure commune. `PanelCard`, la confirmation et un premier ensemble de panneaux Activité les composent sans supprimer leurs classes de compatibilité.

### Phase 6 — Styles globaux

- Extraire les tokens et fondations de `base.css` sans changement de valeurs.
- Déplacer le shell applicatif depuis `layout.css`.
- Rapatrier les sections métier de `views.css` dans les composants concernés.
- Supprimer les fichiers historiques lorsqu'ils ne contiennent plus de règles.

Terminé : `styles.scss` charge les partials Sass avec `@use`. Les fondations, la structure, les composants globaux et les vues sont rangés sous `frontend/src/styles/`. Le dossier historique `assets/css` et les points d'entrée CSS ont été supprimés. Tous les blocs de style Vue sont compilés avec `lang="scss"`.

## Validation d'une phase

Chaque phase doit conserver la compilation TypeScript, les tests unitaires et la compilation de production. Les migrations visuelles importantes doivent être vérifiées sur mobile et bureau avant de supprimer les règles de compatibilité.
