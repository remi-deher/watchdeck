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
| **Parcourir** | « Qu'est-ce qu'il y a d'intéressant ? » | Bannière, rails thématiques ; le titre d'un rail mène à la liste complète déjà réglée (Explorer). On n'y règle rien. |
| **Explorer** | « Je cherche précisément ceci » | On explore pour affiner : recherche, filtres, types en onglets, compteur et filtres actifs, grille d'affiches, ouverture de la fiche. |
| **Analyser** | « Que contient ma bibliothèque, et comment ça évolue ? » | Période (7 jours … 10 ans, Tout) comparée à la précédente, chiffres clés et évolution, pistes (constats du serveur, triés par impact, cinq puis « Voir toutes »), blocs répartition / tendance / classement / habitudes ; tout clic ouvre la liste concernée dans la page, avec Explorer et Traiter. Des constats, pas des alertes. |
| **Créer** | « Comment je mets ça en place ? » | Toujours en fenêtre : étapes, validation à chaque étape, test exigé quand il y a quelque chose à joindre, récapitulatif modifiable, résultat et suites. Pas de brouillon. |
| **Choisir** | « Lequel prendre ? » | Un candidat parmi plusieurs : mode, tri, recommandation en tête, critères au même endroit sur chaque candidat. Les rejetés restent dans le tri (estompés, avec leur raison, « Forcer » après confirmation). |
| **Anticiper** | « Qu'est-ce qui arrive, et quand ? » | Calendrier : vues Mois / Semaine / Agenda, navigation de période, légende des états, recherche en Agenda. Dans une fiche, le mini-calendrier en liste. |
| **Comprendre** | « Que s'est-il passé ? » | Chronologie, filtres de période et d'état, détail d'un événement, avant / après, export. |
| **Configurer** | « Comment je veux que ça marche ? » | Réglages groupés par intention, effet expliqué, enregistrement sûr, test de connexion. |
| **Fiche** | « Tout sur cet élément » | Identité et état, actions possibles, détails par onglets. |

Une page qui mélange deux besoins se découpe (onglets ou pages distinctes), chaque
partie suivant son propre gabarit.

Les gabarits vivent dans `frontend/src/components/templates/` :

| Fichier | Rôle | État |
|---|---|---|
| `PageTemplate.vue` | Socle : page du shell, rangée d'onglets unique, recherche et filtres (barre du haut `UiSearchField` + bouton Filtres + feuille `FilterSidebar`), états chargement / erreur / non configuré / vide | Disponible |
| `MonitorTemplate.vue` (+ `monitor/`) | Surveiller : verdict, indicateurs, attention, parties de la section | Disponible |
| `TrackTemplate.vue` (+ `track/`) | Suivre : résumé des états (filtre), groupes bloqués / en cours / en pause (cartes), file d'attente compacte et repliable, derniers terminés | Disponible |
| `HandleTemplate.vue` (+ `handle/`) | Traiter : types de problème (filtre, corrigeable / à décider), action groupée, liste par urgence avec affiche selon le contexte | Disponible |
| `BrowseTemplate.vue` | Parcourir : bannière (MediaHeroBanner), rangées `posters` (MediaPosterCollection en rail, carte de la page), `section`, `collapsible` chargée à l'ouverture | Disponible |
| `AnalyzeTemplate.vue` (+ `analyze/`) | Analyser : période, `MetricCard` avec évolution (`better` dit le bon sens), pistes, liste ouverte (`drill`), blocs (`BreakdownPanel`, `LineChart`, `PopularMediaPanel`, `ActivityHeatmap`) | Disponible |
| `CreateTemplate.vue` (+ `create/`) | Créer : piloté par une **définition** (données) ; les champs sont rendus par les composants communs selon leur type | Disponible |
| `ChooseTemplate.vue` (+ `choose/`) | Choisir : contexte, mode, tri, « Relancer la recherche », « Masquer les rejets » (décoché), recommandation, candidats, retour après choix | Disponible |
| `PlanTemplate.vue` (+ `plan/`) | Anticiper : le calendrier de production devenu commun ; la page charge la période (`update:cursor`, `periodBounds`), fournit ses états (libellé, couleur) et, au besoin, une carte d'Agenda (`agenda-item`) | Disponible |
| `ExploreTemplate.vue` (+ `explore/`) | Explorer : compteur et filtres actifs, grille / liste, défilement continu ; tri et affichage dans la feuille (ExploreDisplay) | Disponible |
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
Recherche et filtres passent toujours par le socle, avec les mêmes interactions sur
toutes les pages : `search` (placeholder, nature, périmètre) et `v-model:query`, les
groupes de filtres dans l'emplacement `filters`, `filter-count`, `filter-chips`,
`@reset-filters`. Jamais de `FilterSidebar`, de bouton Filtres ni de champ de recherche
posés par une page ou un gabarit.

Parcourir et Explorer se répondent : le titre d'un rail de Parcourir mène à Explorer
déjà réglé, par l'adresse (filtre, tri ou section dans la requête), et le retour ramène
au rail. Une page Parcourir s'écrit `PageTemplate` > `BrowseTemplate` : elle fournit
`hero`, `rows`, la carte de chaque élément (emplacement `item`) et ses rangées propres
(emplacements `row-<clé>`), et charge une section repliable sur `open-row`.

Une page Explorer s'écrit `PageTemplate` (types en `tabs`, `search`, filtres, et le bloc
`ExploreDisplay` pour le tri et l'affichage dans la feuille) > `ExploreTemplate` : elle
fournit les pastilles actives (`chips`) et la carte commune de chaque élément
(emplacement `item`).
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

Ce qu'on crée se décrit par une définition dans `frontend/src/creations/` (une par chose
créable : `service.ts`, `user.ts`…) : étapes, champs typés, règles, étapes ou champs
conditionnels, test, création, résultat. Jamais de formulaire de création écrit dans une
page ; un type de champ manquant s'ajoute au gabarit, pour tous.

Un média de la bibliothèque se transmet toujours entier : côté serveur par
`services/media_ref.py` (`media_ref`, toutes ses images), côté interface en `MediaRef`
(`@/types`). Un composant commun qui affiche un média le reçoit dans `media` et montre
d'office toute image disponible (affiche, fond) ; la page ne recopie jamais `poster` /
`backdrop` d'un média (ces champs restent pour ce qui n'en est pas un : client, disque).

Ce qui tourne maintenant s'affiche toujours avec `LiveStrip` (lectures Plex, fichiers en
cours d'encodage, téléchargements, transferts) : la page traduit ses objets en cartes
(`LiveItem` : image, badge, coin, titre ou logo, état, progression, « qui / sur quoi »,
faits avec icône — quatre au plus —, note). Surveiller l'accueille dans son emplacement
`live`, Suivre l'utilise pour son groupe « En cours ».

Le verdict de Surveiller n'apparaît que s'il y a quelque chose à traiter, et n'a pas de
bouton d'actualisation (les données se rafraîchissent seules).

Les outils de page (état d'un service, pause…) ne forment plus de rangée : `PageTemplate`
les confie à la barre du haut (`usePageTools`), qui les affiche dans la capsule de
recherche, à gauche de « Filtres » (ou à droite de la recherche globale). La rangée
collante ne porte que les onglets, centrés sur la page. La feuille des filtres n'a pas de
pied : les filtres s'appliquent en direct, chacun se retire par sa pastille, « Tout
effacer » à partir de deux.

La capsule de recherche est le même composant partout, adapté au contexte ; chaque
partie est facultative : la recherche, les retours d'état et boutons (`tools`, ex. le
voyant « FileFlows actif »), et le segment de droite, qui porte l'action du contexte
(emplacement `quick-action` de `PageTemplate` : Pause, Ajouter…) ou, à défaut, « Filtres »
si la page filtre. Une page sans filtre utile n'en met pas (la File de l'encodage : sa
pause prend le segment).

Configurer n'a pas de sommaire : chaque section est une carte dont l'en-tête (icône,
titre, ce qu'elle règle) se distingue des réglages ; la recherche de la barre du haut
retrouve une section (`query`, `keywords`).

Un gabarit ou un bloc qui a besoin d'un outil de page (période d'Analyser ou de
Comprendre, vue d'Anticiper) le pose dans `PageTools`. Un `UiSegmentedControl` ne se
pose jamais en haut de page pour filtrer : un filtre de liste se place juste au-dessus de
la liste qu'il filtre, et une bascule qui cadre toute la page (période, vue) passe dans
les outils de page. Pas de filtre qui répète ce que la page montre déjà (Suivre n'a pas
de filtre d'état : ses groupes portent titre et nombre).

Le menu (rail, dock) ne porte qu'un niveau : les entrées. Leurs sections ne s'y listent
plus ; elles vivent dans la page, sur tous les écrans.

Navigation d'une page sur gabarit : une seule rangée, la même sur tous les écrans, celle
des sections de l'entrée du menu. Les vues de la section courante (`tabs` de
`PageTemplate`) ne forment plus une rangée à part : elles s'ouvrent en menu depuis la
section courante (« Traitements · File ▾ ») ; toucher une autre section mène à sa
première vue. Sans sections, les vues gardent leur rangée d'onglets.

Blocs communs hors gabarit : `MiniCalendar` (dates d'un élément en liste, par mois,
couleur et icône par type : cinéma, streaming, physique, épisode), à utiliser dans une
fiche plutôt qu'un calendrier.

## 2. Pas de dérive : on suit le gabarit

- Toute page passe par le gabarit de son besoin. Aucune page « sur mesure ».
- Le gabarit fixe la structure : emplacements, ordre, une seule rangée d'onglets
  (celle de la page, `#tabs`), espacements, comportement sur téléphone, états de page
  (chargement, erreur, non configuré, vide). La page ne fournit que son contenu.
- Pas d'invention : ne pas ajouter d'emplacement, de mise en page ou de comportement
  que le gabarit ne prévoit pas. Si le besoin n'est pas couvert, faire évoluer le
  gabarit lui-même (pour toutes les pages), et le signaler.
- Jamais de seconde barre d'onglets dans une page. Trois rôles, trois composants,
  jamais mélangés :

  | Rôle | Question | Composant | Où |
  |---|---|---|---|
  | Naviguer | « Quelle vue de cette entrée du menu ? » | `AppSubnav` (variante `links`, change l'adresse) | Rangée collante en haut de page, seulement via `PageTemplate` (`tabs`) |
  | Consulter | « Quelle partie de cet élément ? » | `UiTabs` (onglets soulignés) | Dans le contenu : fiches, sous-parties d'une page de réglages |
  | Filtrer | « Quels éléments de cette liste ? » | `UiSegmentedControl` | Au-dessus d'une liste : états, période, type |

  La variante `tabs` d'`AppSubnav` est dépréciée : ses usages passent à `UiTabs` (ou
  `UiSegmentedControl`) lors de la migration de chaque page vers son gabarit.

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
