# Audit de performance et plan de correction — Watchdeck

Date : 28 octobre 2026. Statut : lots 0 à 4 terminés et vérifiés en laboratoire ; lots 5, 6 et 7 restants.

Point d’avancement : [rapport du lot 4 et lots restants](performance-results/LOT4_MEASUREMENTS.md).

Résultats et limites : [campagne mesurée du lot 0](performance-results/LOT0_MEASUREMENTS.md) et [mesures initiales des lots 0 et 1](performance-results/README.md).

## 1. Objectif et périmètre

Réduire les temps de chargement, les ralentissements pendant la navigation et la
concurrence entre les pages, les tâches de fond et les intégrations externes.

Le rapport reprend la revue transversale du backend FastAPI / SQLAlchemy /
PostgreSQL / Redis / ARQ et du frontend Vue 3 / TanStack Query / Vite / PWA.
Les chemins cités sont relatifs à la racine du dépôt. Les identifiants PERF-01 à
PERF-40 permettent de suivre les corrections sans dépendre des numéros de ligne.

Le lot 1 a ensuite été implémenté ; les mesures et les limites de validation sont
consignées dans le document de résultats lié ci-dessus. La note [Chargement et fluidité](PERFORMANCE.md)
décrit les optimisations déjà présentes ; elle reste le document de référence pour
leur fonctionnement.

## 2. Conclusion de l'audit

Les premiers chantiers sont les traitements bloquants dans l'API, les calculs
dupliqués à froid, la durée d'occupation des connexions SQL et le traitement global
du catalogue analytique. Ils peuvent ralentir plusieurs utilisateurs simultanément.

Les autres chantiers portent sur la croissance des collections, la réutilisation
des connexions réseau, les rafraîchissements de données, les caches du navigateur
et le dimensionnement de l'exploitation.

Des optimisations existent déjà : routes chargées à la demande, séparation des
graphiques, cache et transformation des images dans des threads, déduplication par
source d'image, préparation du dashboard, clients HTTP Arr partagés, pagination de
plusieurs API et virtualisation des grilles Explorer au-delà de 300 éléments.
Les corrections doivent préserver ces acquis.

## 3. Preuves disponibles et limites

### Mesures effectuées pendant l'audit initial

| Vérification | Résultat | Interprétation |
|---|---|---|
| Build de production Vite, sortie dans un répertoire temporaire | Réussi | Le frontend peut être construit ; cela ne valide pas sa fluidité en production. |
| Vérification bcrypt locale | Environ 200,6 ms pour une vérification | L'appel synchrone peut immobiliser la boucle événementielle pendant cette durée sur cette machine. Ce chiffre dépend du matériel. |
| Cache générique à froid avec une fonction simulée | 20 appels concurrents ont produit 20 calculs | La déduplication du premier calcul manque dans le chemin testé. |
| Cache mémoire avec 1 000 clés immédiatement expirées et non relues | 1 000 entrées encore conservées | L'expiration seule ne purge pas globalement le dictionnaire. |
| JavaScript déclaré dans le HTML construit, script principal et préchargements | 25 fichiers, 587 555 octets bruts, 195 205 octets gzip | Périmètre limité aux ressources déclarées dans le HTML, avant les ressources propres à la route. |
| CSS déclaré dans ce même HTML | 4 fichiers, 120 684 octets bruts, 21 508 octets gzip | Environ 217 Ko gzip pour le JS et le CSS déclarés, hors images et ressources additionnelles. |
| Bloc partagé d'icônes | Environ 166,9 Ko bruts / 59 Ko gzip | Ressource initiale significative, à comparer avec un découpage différent. |

Ces mesures proviennent de l'audit initial et n'ont pas été réexécutées lors de la
rédaction de ce document. Les scénarios de cache utilisaient des données simulées,
sans reproduire une charge de production.

### Ce qui reste à mesurer

Il n'y a pas de profil de production, de plans `EXPLAIN ANALYZE` sur une base
représentative, de mesure p95 des API ni de profil navigateur sur appareil mobile.
La revue identifie des mécanismes présents dans le code ; elle ne prouve pas que
chacun constitue aujourd'hui un goulot d'étranglement. Les priorités sont des
priorités d'investigation et de correction, à ajuster avec les mesures du lot 0.

P1 : traiter en premier. P2 : risque significatif avec le volume, la concurrence
ou une dépendance lente. P3 : gain secondaire à confirmer avant intervention.

## 4. Inventaire des points relevés

### Backend

| ID | Priorité | Source | Constat et impact possible | Correction envisagée |
|---|---|---|---|---|
| PERF-01 | P1 | `app/routers/auth.py`, `app/services/auth.py` | bcrypt est exécuté synchroniquement dans des routes asynchrones ; une connexion peut bloquer les autres requêtes du processus. | Déporter vérification et hachage dans des threads ; contrôler tous les appelants. |
| PERF-02 | P1 | `app/services/library_analytics.py`, `analytics_items_payload` | Chaque page désérialise le catalogue entier, le filtre et le trie avant de découper les résultats. | Préparer une projection interrogeable et appliquer tri, filtres et pagination en SQL. |
| PERF-03 | P1 | `app/services/library_analytics.py`, `_build_payload` | Copies, agrégations et tris synchrones peuvent monopoliser la boucle événementielle. | Préparer les agrégats dans le worker et limiter le travail CPU du chemin HTTP. |
| PERF-04 | P1 | `app/cache.py`, `get_or_refresh` | Plusieurs requêtes sur une clé absente exécutent chacune le calcul. | Mutualiser le calcul en cours par clé, avec coordination Redis pour les valeurs partagées entre processus. |
| PERF-05 | P1 | `app/routers/downloads_api.py`, `_compute_download_client_queue` | Des lectures SQL précèdent les appels réseau dans la même session ; une connexion peut rester retenue pendant l'attente. | Extraire les données nécessaires, terminer la transaction avant le réseau et séparer les éventuelles écritures finales. |
| PERF-06 | P2 | `app/services/library_analytics.py`, `refresh_library_analytics_snapshot` | Une évolution des lectures peut provoquer une nouvelle récupération du catalogue Plex inchangé. | Séparer les versions et rafraîchissements du catalogue et des lectures. |
| PERF-07 | P2 | `app/services/library_analytics.py`, `fetch_plex_catalog` | Les bibliothèques Plex sont parcourues en série et les collections récupérées sans pagination explicite. | Récupérer par lots avec une concurrence bornée et un budget temporel global. |
| PERF-08 | P2 | `app/services/library_analytics.py` | Un recalcul complet charge tous les objets `PlaybackSession`. | Utiliser des agrégats SQL et des mises à jour incrémentales, avec possibilité de reconstruction complète. |
| PERF-09 | P2 | `app/cache.py`, `_memory` | Le cache mémoire n'a ni plafond ni purge globale des entrées expirées ; les clés non relues peuvent s'accumuler. | Ajouter une limite de volume et une politique d'éviction ; éviter les copies locales inutiles lorsque Redis fonctionne. |
| PERF-10 | P2 | `app/cache.py`, `_client` | Les délais Redis ne sont pas explicitement bornés et un échec initial empêche de retenter la connexion. | Borner connexion et lecture, puis prévoir une reconnexion temporisée et un repli rapide. |
| PERF-11 | P2 | `app/services/tmdb.py`, `app/services/plex_api.py`, `app/routers/image_proxy_api.py` | Plusieurs chemins recréent un client HTTP à chaque appel, contrairement au client Arr déjà partagé. | Réutiliser les pools par configuration de connexion et les fermer à l'arrêt. |
| PERF-12 | P2 | `app/services/arr_catalog.py` | Après un échec, une valeur reste expirée sans délai de reprise spécifique ; les appelants suivants peuvent retenter en série. | Servir la dernière valeur et appliquer une temporisation après échec, en conservant les règles de fraîcheur métier. |
| PERF-13 | P2 | `app/routers/downloads_api.py`, `download_client_queue` | La file torrent complète est projetée et renvoyée ; toutes les demandes ayant un hash sont chargées pour le rapprochement. | Séparer collecte partagée et consultation paginée, avec filtres et totaux calculés sur l'ensemble. |
| PERF-14 | P2 | `app/routers/users_api.py`, `list_users` | Tous les comptes et des statistiques globales sont relus ; les destinataires en échec sont récupérés puis dédupliqués en Python. | Paginer les comptes, utiliser les agrégats adaptés et dédupliquer en SQL ; limiter les recalculs. |
| PERF-15 | P2 | `app/routers/users_api.py`, `_build_user_diagnostic` | La recherche des codemandeurs parcourt et décode des listes JSON pour une seule fiche. | Créer une relation indexée de codemandeurs et migrer les données avec contrôle de parité. |
| PERF-16 | P2 | `app/routers/calendar_api.py`, `_compute_calendar` | Le calcul lit des collections globales et peut créer des demandes avec un `flush` par élément. | Déplacer la synchronisation hors du GET, filtrer la projection par période et regrouper les écritures. |
| PERF-17 | P2 | `app/routers/library_api.py`, `alembic/` | Recherches `ILIKE '%…%'` sans index trigramme repéré dans les migrations. | Mesurer les plans SQL, puis ajouter les index réellement utiles aux recherches observées. |
| PERF-18 | P2 | `app/routers/library_api.py` et historiques paginés | Les grands `OFFSET` font parcourir puis écarter de nombreuses lignes. | Introduire des curseurs avec ordre stable et identifiant de départage ; conserver les besoins de pagination directe lorsqu'ils sont justifiés. |
| PERF-19 | P2 | `app/routers/discover_api.py`, `_most_requested_section` | Un classement de 20 résultats charge, décode et trie toutes les demandes concernées. | Agréger le nombre de demandeurs et limiter le classement côté SQL. |
| PERF-20 | P2 | `app/services/vf_upgrade_scanner.py` | Résolution Arr et lecture des états d'épisodes à l'intérieur de la boucle des médias. | Précharger instances et états par lots pour supprimer les requêtes répétées par média. |
| PERF-21 | P2 | `app/routers/storage_api.py`, `roots` | La découverte des racines attend chaque instance successivement. | Paralléliser avec une limite, des délais bornés et des sessions SQL indépendantes. |
| PERF-22 | P2 | `app/routers/image_proxy_api.py`, `image_proxy` | Les premiers téléchargements et transformations n'ont pas tous la limite globale utilisée pour les rafraîchissements périmés. | Borner réseau et transformations à froid ; conserver les verrous par source et variante. |
| PERF-23 | P2 | `app/routers/image_proxy_api.py`, branche `plex_path` | La résolution des réglages Plex lit SQL avant de consulter le cache image, même si une réponse 304 suffit ensuite. | Mettre en cache la configuration de résolution avec invalidation lors des changements. |
| PERF-24 | P2 | `app/realtime.py`, `publish` | Un client Redis est créé et fermé par publication. | Réutiliser un pool pour la publication ; préserver la reprise SSE et le filtrage des événements. |
| PERF-25 | P3 | `app/routers/notifications_api.py`, `notification_channels_last` | Cinq lectures successives pour le dernier envoi de cinq canaux. | Utiliser une requête groupée et vérifier son indexation. |
| PERF-40 | P1 | `app/services/playback_activity.py`, `activity_statistics`, `activity_snapshot` | La campagne du lot 0 mesure environ 16,9 s au premier calcul des statistiques sur 200 000 lectures ; le cache masque ensuite ce coût. | Préparer les agrégats, borner les lignes chargées et séparer les budgets de lecture et de reconstruction (lot 4). |

### Frontend

| ID | Priorité | Source | Constat et impact possible | Correction envisagée |
|---|---|---|---|---|
| PERF-26 | P2 | `vite.config.ts` | Le bloc d'icônes commun charge initialement des icônes utilisées dans d'autres routes. | Comparer le découpage actuel avec un découpage suivant les dépendances des routes. |
| PERF-27 | P2 | `frontend/src/styles/index.scss` | Les styles de vues et composants sont importés globalement. | Conserver les fondations globales et charger les styles spécifiques avec leurs composants. |
| PERF-28 | P2 | `frontend/src/queryClient.ts` | Une rétention de 24 heures s'applique aux requêtes inactives sans plafond de volume. | Adapter la rétention selon les domaines et borner les pages et variantes conservées. |
| PERF-29 | P2 | `frontend/src/offline/stockage.ts` | Le cache autorisé est persisté sous forme d'ensemble sérialisé sans budget de taille explicite. | Limiter les données persistées et mesurer sérialisation, écriture et restauration. |
| PERF-30 | P2 | `frontend/src/cache.ts` | Sérialisation et écriture `sessionStorage` synchrones, en complément des autres caches. | Réduire les copies redondantes et les écritures de grandes charges utiles. |
| PERF-31 | P2 | `frontend/src/components/ui/UiDataTable.vue`, `frontend/src/components/templates/ExploreTemplate.vue` | La limite d'affichage du tableau n'est pas une virtualisation ; le mode liste rend tous les éléments chargés. | Virtualiser les collections volumineuses dans les composants communs. |
| PERF-32 | P2 | `frontend/src/composables/useRealtimeQuery.ts` | Certaines projections provoquent une invalidation et une relecture complète à chaque groupe d'événements. | Regrouper les invalidations et cibler les pages ou projections concernées sans perdre les changements métier. |
| PERF-33 | P2 | `frontend/src/api.ts` | Les appels `fetch` n'ont pas de délai maximal par défaut. | Définir des délais par type de requête et les composer avec l'annulation de navigation. |
| PERF-34 | P2 | `frontend/src/composables/useMediaDetail.ts` | La requête principale ne transmet pas le signal d'annulation et se relance à chaque remontage. | Annuler les requêtes devenues inutiles et cibler les revalidations, en préservant la reprise après erreur temporaire. |
| PERF-35 | P3 | `frontend/src/queryClient.ts` | Deux relances automatiques s'appliquent sans distinction explicite des statuts HTTP. | Exclure les erreurs permanentes ; borner les relances des erreurs transitoires et respecter les indications du serveur. |
| PERF-36 | P3 | `public/sw.js`, `elaguerAffiches` | Toutes les clés du cache sont énumérées après chaque nouvelle affiche enregistrée. | Nettoyer par lots ou à une fréquence bornée, en conservant une limite de stockage. |
| PERF-37 | P3 | `frontend/src/composables/useWindowVirtualGrid.ts` | L'ensemble cumulatif des cartes déjà vues est recopié à chaque changement de fenêtre. | Éviter la copie complète et vérifier le comportement sur un défilement prolongé. |

### Exploitation

| ID | Priorité | Source | Constat et impact possible | Correction envisagée |
|---|---|---|---|---|
| PERF-38 | P2 | `Dockerfile`, `app/database.py` | La commande fournie lance un processus Uvicorn ; les blocages CPU se répercutent sur les requêtes concurrentes. | Corriger les blocages puis dimensionner les processus avec le budget de connexions PostgreSQL et la mémoire. |
| PERF-39 | P2 | `app/jobs.py`, `docker-compose.yml` | Nombreux traitements périodiques ; Compose autorise 15 jobs simultanés, susceptibles de concurrencer les préparations de pages. | Mesurer attente et durée, puis ajuster concurrence, horaires et éventuelle séparation des files. |

## 5. Plan de mise en œuvre

Chaque lot doit produire un changement indépendant, ses mesures avant/après et une
possibilité de retour arrière. Les estimations ci-dessous expriment une complexité
relative : faible, moyenne ou forte. Elles ne constituent pas un calendrier.

| Lot | Objectif | Points couverts | Dépendances | Complexité |
|---|---|---|---|---|
| 0 | Établir une référence reproductible | Tous, mesure uniquement | Aucune | Moyenne |
| 1 | Éviter les blocages et calculs dupliqués | 01, 04, 05, 09, 10, 12 | Lot 0 | Moyenne |
| 2 | Réutiliser et borner les ressources réseau | 11, 21, 22, 23, 24 | Lot 1 pour les politiques de cache et de reprise | Moyenne |
| 3 | Refaire le chemin analytique à grande échelle | 02, 03, 06, 07, 08 | Lots 0 et 1 ; réutiliser les pools du lot 2 | Forte |
| 4 | Réduire les lectures et paginer les collections | 13, 14, 15, 16, 17, 18, 19, 20, 25, 40 | Lot 0 ; relation des codemandeurs avant les agrégats qui l'utilisent | Forte |
| 5 | Maîtriser les requêtes et caches du navigateur | 28, 29, 30, 32, 33, 34, 35 | Lot 0 ; coordonner les contrats avec les lots 3 et 4 | Moyenne |
| 6 | Alléger le chargement et le rendu | 26, 27, 31, 36, 37 | Lot 0 ; pagination du lot 4 pour les écrans concernés | Moyenne |
| 7 | Dimensionner et déployer progressivement | 38, 39 | Résultats des lots précédents | Moyenne |

### Lot 0 — Mesurer le point de départ

- [x] Créer des jeux de données de test représentatifs : petite installation,
  bibliothèque volumineuse et historique long. Les profils synthétiques
  sont documentés ; leur calibration sur les volumes terrain reste à faire au déploiement.
- [x] Mesurer séparément cache froid, cache chaud, cache expiré, Redis indisponible
  et intégration externe lente.
- [x] Mesurer p50/p95 des API, temps de première donnée utile, nombre de requêtes SQL,
  temps d'attente du pool, retard de boucle événementielle et mémoire API/worker.
- [x] Côté navigateur, relever LCP, INP, tâches longues, nombre de nœuds DOM,
  mémoire, requêtes réseau et temps de restauration du cache.
- [x] Capturer les plans SQL des recherches et des pages éloignées sur une base de
  test représentative ; ne pas exécuter une charge intrusive sur la production.
- [x] Enregistrer les commandes, versions, matériel, volumes et résultats pour
  permettre la comparaison après chaque lot.

Acceptation : les scénarios sont répétables et les métriques de référence sont
enregistrées. Aucun objectif chiffré ci-dessous ne doit être présenté comme atteint
avant cette comparaison.

Campagne terminée : voir [les résultats détaillés](performance-results/LOT0_MEASUREMENTS.md),
les JSON associés et le protocole `scripts/performance/README.md`. Les métriques navigateur
sont des mesures de laboratoire ; les images distantes et les appareils physiques ne sont
pas inclus. La reprise hors ligne après la toute première visite échoue dans le scénario
mesuré ; après mise en cache du shell, elle fonctionne. Ce constat est à reprendre au lot 5.

### Lot 1 — Protéger la capacité de l'API

- [x] Déporter bcrypt dans des threads sans modifier son facteur de coût, ses
  règles de vérification ni les protections contre les tentatives répétées.
- [x] Mutualiser le premier calcul de cache par clé. Gérer exception, annulation et
  expiration du verrou. Pour Redis, utiliser un propriétaire unique et une libération
  conditionnelle ; définir explicitement le comportement en cas de panne Redis.
- [x] Sortir les attentes réseau des transactions de collecte torrent. Passer des
  valeurs détachées aux appels externes et ouvrir une nouvelle transaction si une
  écriture est nécessaire après leur retour.
- [x] Borner le cache mémoire et purger les entrées expirées ; vérifier les usages
  lorsque Redis est disponible et lorsqu'il ne l'est pas.
- [x] Ajouter délais Redis et reprise temporisée. Ajouter une temporisation après
  échec du catalogue Arr en conservant la dernière donnée exploitable.

Acceptation : une connexion lente ne bloque pas une route indépendante ; une rafale
sur une même clé froide n'exécute qu'un calcul dans le périmètre de coordination
annoncé ; Redis défaillant entraîne un repli borné ; aucune connexion SQL de la
collecte torrent n'est conservée pendant une attente externe.

### Lot 2 — Maîtriser les appels externes et les images

Implémenté et vérifié : [rapport des lots 2 et 3](performance-results/LOT23_MEASUREMENTS.md).

- [x] Réutiliser les clients HTTP TMDB, Plex et images en respectant origine,
  configuration TLS et authentification ; fermer les pools à l'arrêt.
- [x] Réutiliser le pool Redis de publication. Garder les connexions de lecture
  bloquante SSE compatibles avec leur durée de vie et leur annulation.
- [x] Paralléliser la découverte des racines avec une limite et un budget global.
  Ne pas partager un `AsyncSession` entre coroutines concurrentes.
- [x] Limiter séparément téléchargements et encodages d'images à froid. Mesurer
  l'attente induite pour choisir la limite ; préserver les réponses périmées rapides.
- [x] Mettre en cache la résolution Plex et l'invalider à la modification des
  réglages ou des serveurs. Préserver les contrôles d'hôte et de destination.

Acceptation : les connexions sont réutilisées ; la concurrence reste bornée lors
d'une nouvelle grille ; une image en cache n'entraîne plus de lecture SQL de
configuration après initialisation ; une instance lente ne retient pas tous les
résultats des autres instances.

### Lot 3 — Séparer catalogue, lectures et consultation analytique

- [x] Introduire une projection persistée des médias analytiques, indexée selon les
  filtres et tris réellement utilisés. Versionner la projection et sa fraîcheur.
- [x] Paginer la collecte Plex et borner la concurrence entre bibliothèques.
- [x] Séparer l'empreinte du catalogue de celle des lectures. Une nouvelle lecture
  ne doit pas imposer de retélécharger le catalogue inchangé.
- [x] Préparer les agrégats de lecture en SQL ou dans le worker, avec un mécanisme
  incrémental et une reconstruction complète pour les corrections d'historique.
- [x] Faire lire aux routes résumé, liste et détail les données qui leur sont
  nécessaires, sans désérialiser tout le catalogue pour une page ou une fiche.
- [x] Publier atomiquement une nouvelle version cohérente. Servir la dernière
  version réussie pendant une reconstruction ; exposer sa fraîcheur.
- [x] Comparer les résultats de l'ancienne et de la nouvelle projection avant de
  basculer les lectures, y compris les filtres, distributions, totaux et exports.

Acceptation : une page paginée ne charge plus le JSON global ; les résultats restent
identiques sur un jeu de référence ; une nouvelle lecture ne déclenche pas une
collecte complète du catalogue ; l'ancien instantané reste exploitable après un
échec de reconstruction.

### Lot 4 — Faire évoluer les collections et les accès SQL

Découper ce lot en sous-chantiers afin d'éviter une migration et un changement de
contrats API uniques pour tous les domaines.

1. **Codemandeurs et classements** — Créer la relation indexée, reprendre les données
   JSON, comparer les effectifs, adapter les écritures puis les lectures des fiches
   utilisateur et du classement Discover. Garder les anciennes données pendant la
   période de validation.
2. **Utilisateurs et notifications** — Paginer les comptes, agréger les statistiques,
   dédupliquer les destinataires en SQL et regrouper les derniers envois par canal.
3. **Torrents** — Conserver une collecte partagée des clients, puis servir une vue
   filtrée et paginée. Les facettes et totaux doivent porter sur toute la collection.
4. **Calendrier** — Extraire la création/synchronisation des demandes dans le worker,
   rendre cette synchronisation idempotente et lire une projection par période.
5. **Scan VF** — Précharger les instances et états d'épisodes par lots sans changer
   les règles de sélection des candidats.
6. **Recherche et pagination** — Ajouter les index après analyse des plans SQL,
   puis introduire des curseurs là où les grands `OFFSET` sont coûteux. Inclure un
   départage stable et traiter les changements de filtre ou de tri.

7. **Statistiques d’activité (PERF-40)** — Préparer les agrégats de longue période,
   limiter le chargement de sessions dans `activity_snapshot` et mesurer séparément
   premier calcul et lectures chaudes pour ne pas masquer le coût par le cache.

- [x] Pour chaque API modifiée, inventorier ses consommateurs frontend et ses tests.
- [x] Faire évoluer serveur et client dans le même lot ou prévoir une compatibilité
  temporaire explicite avec les bundles déjà ouverts.
- [x] Écrire des migrations compatibles avec le mode transactionnel d'Alembic ;
  prévoir les précautions nécessaires pour les gros index.

Acceptation : pas de doublon ni de manque à la pagination sur une collection stable ;
droits et filtres conservés ; nombre de requêtes du scan VF lié aux lots plutôt
qu'au nombre de médias ; plans SQL et temps avant/après enregistrés.

### Lot 5 — Encadrer les requêtes et le cache du navigateur

- [ ] Ajouter au client API des délais par famille de requête, composés avec le
  signal de l'appelant. Distinguer annulation volontaire, délai dépassé et erreur
  réseau pour conserver un retour utilisateur correct.
- [ ] Transmettre le signal TanStack Query aux chargements de fiches et contrôler
  les revalidations après erreur, événement, mutation et réouverture.
- [ ] Exclure des relances les erreurs permanentes et les annulations ; traiter les
  erreurs transitoires avec une attente bornée et `Retry-After` s'il est applicable.
- [ ] Regrouper les invalidations temps réel par domaine. Ne modifier localement une
  projection que si toutes ses règles métier peuvent être maintenues ; sinon relire
  le périmètre minimal cohérent.
- [ ] Définir rétention, nombre de variantes/pages et budget de taille par domaine
  pour les caches en mémoire et persistés.
- [ ] Réduire les duplications avec `sessionStorage`. Préserver la liste blanche des
  données hors ligne, leur séparation par compte et la purge à la déconnexion.

Acceptation : une fiche quittée n'exécute plus sa requête inutile ; les erreurs
permanentes ne sont pas relancées ; une rafale d'événements produit un nombre borné
de relectures ; mémoire et données persistées se stabilisent sur un parcours long ;
la reprise hors ligne et le changement de compte fonctionnent toujours.

### Lot 6 — Alléger les ressources et les grandes listes

- [ ] Comparer plusieurs découpages des icônes sur les routes de connexion,
  dashboard, bibliothèque et découverte. Évaluer poids, nombre de requêtes et
  dépendances initiales, pas seulement le nombre de fichiers.
- [ ] Déplacer les styles spécifiques progressivement ; conserver l'ordre de
  cascade, les thèmes et les styles communs nécessaires au premier rendu.
- [ ] Ajouter la virtualisation aux composants communs de liste/tableau. Préserver
  sélection, tri, focus clavier, lignes développées, affichage mobile et chargement
  progressif. Respecter les gabarits décrits dans `AGENTS.md`.
- [ ] Réduire la fréquence de nettoyage du cache d'affiches du service worker et
  éviter les copies cumulatives de l'ensemble des cartes déjà vues.

Acceptation : le nombre de nœuds rendus reste borné après un long défilement ; les
interactions clavier et tactiles restent utilisables ; le poids initial diminue
sur les routes mesurées sans déplacer les graphiques ou fiches dans le démarrage ;
la limite du cache d'images est conservée.

### Lot 7 — Dimensionner, déployer et observer

- [ ] Tester le nombre de processus API après correction des blocages ; tenir
  compte du fait que chaque processus possède ses pools et caches locaux.
- [ ] Calculer le budget maximal PostgreSQL : somme des `pool_size + max_overflow`
  des processus API et workers, puis ajouter les connexions des outils et une marge
  d'administration. Respecter la capacité réelle de la base.
- [ ] Mesurer le retard de démarrage et la durée des jobs ; ajuster les 15 jobs
  simultanés du Compose selon les résultats. Séparer les tâches lourdes et les
  préparations interactives si la concurrence observée le justifie.
- [ ] Pour toute séparation de workers/files, vérifier la destination des jobs,
  l'unicité des tâches périodiques et les verrous existants.
- [ ] Déployer par lot, observer les métriques sur une période couvrant les cycles
  de fond, puis poursuivre ou revenir à la version précédente.

Acceptation : aucune saturation nouvelle des pools, pas de tâche périodique
dupliquée et pas de régression p95 sous la charge de référence ; le délai des
préparations nécessaires aux pages reste dans le budget défini au lot 0.

## 6. Validation et critères de réussite

### Scénarios à conserver pour les comparaisons

| Scénario | Vérifications principales |
|---|---|
| Première ouverture avec caches froids | Première donnée utile, poids réseau, nombre de calculs par clé, concurrence des images. |
| Retour sur une page déjà visitée | Affichage du cache, volume rechargé, restauration du défilement. |
| Connexions simultanées et consultation d'une route indépendante | Retard de boucle événementielle, latence des routes, durée bcrypt. |
| Bibliothèque volumineuse : recherche et pages éloignées | Plans SQL, temps p95, lignes examinées, mémoire. |
| Analyse après une nouvelle lecture | Absence de recollecte inutile du catalogue, cohérence des agrégats. |
| Série d'ouvertures et fermetures de fiches | Annulations, requêtes restantes, fraîcheur et erreurs. |
| Rafale d'événements SSE | Nombre de relectures, cohérence finale et charge du serveur. |
| Défilement prolongé de listes et tableaux | Nœuds DOM, tâches longues, mémoire et fluidité. |
| Redis ou intégration externe indisponible puis rétabli | Délais bornés, dernière donnée réussie, récupération automatique. |
| Mode hors ligne, déconnexion et changement de compte | Restauration utile, isolation et purge des données conservées. |

### Objectifs proposés, à confirmer après le lot 0

- Réduire le p95 des parcours corrigés par rapport à la référence, sans régression
  significative des autres parcours ; fixer le seuil d'acceptation avant chaque lot.
- Viser un LCP inférieur ou égal à 2,5 s et un INP inférieur ou égal à 200 ms sur le
  profil mobile et réseau retenu. Les mesures de laboratoire restent distinctes des
  mesures terrain et de leurs percentiles.
- Avoir un nombre borné de calculs, de connexions, de données en cache et de nœuds
  DOM pour les scénarios qui ont précisément pour objectif de les borner.
- Préserver les résultats métier, les droits, la confidentialité des caches et le
  fonctionnement après une panne ou un déploiement.

### Vérifications automatisées

Choisir les tests existants et les nouveaux tests selon le lot. Les tests de
concurrence, d'expiration et de comptage doivent vérifier le comportement ; éviter
des assertions de durée fragiles dépendant de la vitesse de la machine.

Commandes de référence à exécuter lorsque le code correspondant est modifié :

```bash
npm run typecheck
npm run test:unit
npm run build
python -m pytest tests/test_cache.py tests/test_loading_performance.py
python -m pytest tests/test_dashboard_stream.py tests/test_dashboard_snapshot.py tests/test_image_proxy.py
```

Les tests qui utilisent PostgreSQL demandent une base de test isolée et la
configuration attendue par `tests/conftest.py` et `tests/async_support.py`. Ajouter
les suites métier concernées : analytique, téléchargements, comptes, calendrier,
scan VF, Redis et pagination. Vérifier les migrations sur une base vide et une
copie représentative lorsque le schéma change.

Ces commandes constituent le plan de validation des corrections. Elles n'ont pas
été exécutées pour la simple création de ce rapport.

## 7. Déploiement et retour arrière

1. Livrer d'abord les changements sans migration de données : protections de
   concurrence, threads bcrypt, délais et réutilisation des ressources.
2. Ajouter les schémas et projections avant de basculer leurs consommateurs ;
   comparer les résultats anciens et nouveaux sur le même jeu de données.
3. Prévoir un mécanisme de bascule pour les changements structurels. Garder les
   anciennes colonnes/projections le temps nécessaire à la validation ; leur
   suppression fera l'objet d'une livraison ultérieure.
4. Déployer API, worker et frontend selon les contrats introduits. Maintenir une
   compatibilité explicite avec les onglets ouverts et les tâches déjà en file.
5. Surveiller erreurs, p95, occupation des pools, mémoire et retard des jobs.
   Revenir au chemin précédent si les critères d'acceptation ne sont pas atteints.

## 8. Suivi des livraisons

Les statuts ci-dessous suivent les corrections réalisées après la rédaction initiale. Les compléter dans ce tableau
avec un lien de changement et des mesures avant/après ; une simple réussite des
tests ne suffit pas à déclarer un gain de performance.

| Lot | Statut | Référence du changement | Mesures avant/après | Validation / retour arrière |
|---|---|---|---|---|
| 0 — Référence | Terminé en laboratoire | `scripts/performance/` | `performance-results/LOT0_MEASUREMENTS.md` et JSON associés | PostgreSQL, Redis multiprocessus, ARQ, HTTP, navigateur ; limites terrain documentées |
| 1 — Capacité API | Implémenté, validation locale réussie | Cache, auth, collecte torrent, catalogue Arr | Calculs froids : 20 → 1 ; entrées : 3 001 → 1 | 126 tests ciblés ; Redis multiprocessus validé au lot 0 ; validation terrain restante |
| 2 — Ressources réseau | À faire | — | — | — |
| 3 — Analytique | À faire | — | — | — |
| 4 — Collections et SQL | À faire | — | — | — |
| 5 — Requêtes et caches navigateur | À faire | — | — | — |
| 6 — Ressources et rendu | À faire | — | — | — |
| 7 — Exploitation | À faire | — | — | — |
