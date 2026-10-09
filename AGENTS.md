# Règles pour les agents IA — Watchdeck

Ces règles s'appliquent à toute IA qui modifie l'interface (`frontend/`). Elles priment
sur les habitudes ou préférences de l'agent. En cas de doute, demander plutôt qu'inventer.

## 1. Le besoin métier d'abord, la mise en page ensuite

Avant d'écrire du code, identifier la question à laquelle la page répond. C'est la
réponse à ce besoin qui articule le design, jamais l'inverse.

Chaque page relève d'un seul besoin, donc d'un seul gabarit :

| Gabarit | Question de l'utilisateur | Ce qui l'entoure |
|---|---|---|
| **Surveiller** | « Est-ce que tout va bien ? » | Verdict global, indicateurs de santé, points d'attention, accès aux pages qui les règlent. Pas de liste exhaustive. |
| **Traiter** | « Que dois-je faire maintenant ? » | Éléments triés par urgence, indicateurs qui filtrent, actions unitaires et groupées toujours visibles, retour immédiat. |
| **Suivre** | « Où en est ce qui tourne ? » | Éléments en cours, progression en direct, blocages et leur cause, actions débloquer / relancer / pause / annuler. |
| **Explorer** | « Qu'est-ce que j'ai, qu'est-ce que je cherche ? » | Recherche, filtres, types en onglets, cartes d'affiche, ouverture de la fiche. |
| **Comprendre** | « Que s'est-il passé ? » | Chronologie, filtres de période et d'état, détail d'un événement, avant / après, export. |
| **Configurer** | « Comment je veux que ça marche ? » | Réglages groupés par intention, effet expliqué, enregistrement sûr, test de connexion. |
| **Fiche** | « Tout sur cet élément » | Identité et état, actions possibles, détails par onglets. |

Une page qui mélange deux besoins se découpe (onglets ou pages distinctes), chaque
partie suivant son propre gabarit.

Les gabarits vivent dans `frontend/src/components/templates/` :

| Fichier | Rôle | État |
|---|---|---|
| `PageTemplate.vue` | Socle : page du shell, rangée d'onglets unique, états chargement / erreur / non configuré / vide | Disponible |
| `MonitorTemplate.vue` (+ `monitor/`) | Surveiller : verdict, indicateurs, attention, parties de la section | Disponible |
| `TrackTemplate.vue` (+ `track/`) | Suivre : résumé des états (filtre), groupes bloqués / en cours / en pause (cartes), file d'attente compacte et repliable, derniers terminés | Disponible |
| `HandleTemplate.vue` (+ `handle/`) | Traiter : types de problème (filtre, corrigeable / à décider), action groupée, liste par urgence avec affiche selon le contexte | Disponible |
| `ExploreTemplate.vue` | Explorer : panneau de filtres, pastilles des filtres actifs, compteur, tri, grille / liste, défilement continu | Disponible |
| `UnderstandTemplate.vue` (+ `understand/`) | Comprendre : période et résultat, bilan facultatif, export, chronologie par jour, détail en feuille | Disponible |
| `ConfigureTemplate.vue` (+ `configure/`) | Configurer : sections par intention avec sommaire, enregistrement global (Enregistrer / Annuler, confirmation avant de quitter), blocs `ConfigureField`, `ConfigureTest`, `ResourceList` | Disponible |
| `DetailTemplate.vue` (+ `detail/`) | Fiche : en-tête (état en badges, action principale + deux secondaires, reste dans « … »), une seule alerte d'état, onglets de détail, faits | Disponible |

Une page Surveiller s'écrit `PageTemplate` > `MonitorTemplate`, en ne fournissant que
ses données (`items`, `kpis`, `zones`, `labels`).
Une page Suivre s'écrit `PageTemplate` > `TrackTemplate` : elle fournit `items` (état,
progression, cause, actions), `recent`, `historyTo`, et réagit à l'événement `action`.
Une page Traiter s'écrit `PageTemplate` > `HandleTemplate` : elle fournit `issues` et
`items`, réagit à `action`, `bulk` et `selection`, retire l'élément traité de `items` et
l'annonce par `useToast().undoable`. « Ignorer » est une décision durable côté serveur.
Une page Explorer s'écrit `PageTemplate` (types en `tabs`, recherche de la barre du haut
par `v-model:query` et `:hide-search="false"`) > `ExploreTemplate` : elle fournit les
filtres (emplacement `filters`), les pastilles actives (`chips`), et la carte commune de
chaque élément (emplacement `item`).
Une page Comprendre s'écrit `PageTemplate` > `UnderstandTemplate` : elle fournit
`events`, charge le `detail` de l'événement ouvert (`open`), et éventuellement `summary`.
Aucune action dans la liste ; au plus une dans le détail.
Une page Configurer s'écrit `PageTemplate` > `ConfigureTemplate` : elle fournit
`sections` (avec `dirty` par section), leur contenu (emplacements `section-<clé>`, faits
de `ConfigureField`, `ConfigureTest` et `ResourceList`), `dirty` global, et réagit à
`save` / `cancel`. Un seul enregistrement pour toute la page.
Une fiche s'écrit `DetailTemplate` : elle fournit identité, `badges`, `actions`, au plus
une `alert`, `tabs` et leur contenu (emplacements `tab-<clé>`), `facts`, et réagit à
`action`. Les actions vivent dans l'en-tête, jamais dans un onglet.

Les gabarits ne sont pas figés : chacun s'adosse à des blocs, qui sont des composants
communs (`monitor/`, `track/`…). Pour faire évoluer un gabarit, on remplace ou on fait
évoluer le bloc concerné, et toutes les pages qui l'utilisent suivent. On ne contourne
jamais un gabarit depuis une page.

## 2. Pas de dérive : on suit le gabarit

- Toute page passe par le gabarit de son besoin. Aucune page « sur mesure ».
- Le gabarit fixe la structure : emplacements, ordre, une seule rangée d'onglets
  (celle de la page, `#tabs`), espacements, comportement sur téléphone, états de page
  (chargement, erreur, non configuré, vide). La page ne fournit que son contenu.
- Pas d'invention : ne pas ajouter d'emplacement, de mise en page ou de comportement
  que le gabarit ne prévoit pas. Si le besoin n'est pas couvert, faire évoluer le
  gabarit lui-même (pour toutes les pages), et le signaler.
- Jamais de seconde barre d'onglets dans une page : un filtre secondaire est un
  sélecteur (`UiSegmentedControl`), pas un `AppSubnav`.

## 3. Composants communs exclusivement

- Utiliser uniquement des composants communs (`frontend/src/components/ui/` et les
  blocs partagés) et les frameworks du projet (Vue 3, Reka UI, TanStack Query /
  Table, Lucide). Ne pas réimplémenter ce qu'ils fournissent.
- Ne jamais créer un composant pour le besoin précis d'une seule page. Partir d'un
  composant commun existant ; s'il manque une capacité, l'étendre.
- Un nouveau composant n'est créé que s'il est pensé réutilisable : nom générique,
  props décrivant le besoin et non la page, aucune donnée ni route propre à une page,
  placé avec les composants communs.

## 4. Une structure de code claire

- Gabarits, composants communs, blocs métier et vues restent dans leurs dossiers
  respectifs. Une vue assemble, elle ne contient pas de logique réutilisable.
- Logique de données dans des composables, pas dans les gabarits ni les composants
  d'affichage.
- Suivre le style du code environnant (nommage, densité de commentaires, idiomes) ;
  une modification d'un gabarit ou d'un composant commun vaut pour toutes les pages :
  vérifier ses usages avant de la faire.
