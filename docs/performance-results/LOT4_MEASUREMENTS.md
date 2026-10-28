# Lot 4 — Collections, pagination et activité

Date : 28 octobre 2026. Lot implémenté et validé en laboratoire. Les lots 2 et 3,
qui étaient encore locaux, sont livrés avec ce lot.

## Corrections réalisées

| Chantier | Changement | Compatibilité et validation |
|---|---|---|
| Codemandeurs | Relation `request_requesters` indexée par utilisateur et demande. Reprise des données, déduplication et synchronisation transactionnelle par trigger lors des écritures de l'ancien JSON, y compris les écritures en masse. | Le JSON reste présent. Objets historiques, identifiants sous forme de chaînes, doublons, JSON invalide et rollback sont testés. Discover classe en SQL ; les fiches utilisateur ne parcourent plus toutes les demandes. |
| Comptes et notifications | `/api/users/page` applique recherche, filtres, situations et tri avant pagination. Statistiques regroupées en SQL et limitées aux comptes de la page ; destinataires d'échecs normalisés et dédupliqués en SQL. Derniers envois regroupés par canal et destinataire sur les fiches. | `useUserAccounts` et `UsersView` chargent par pages. Les compteurs de situations restent globaux et une recherche peut trouver un compte non encore chargé. `/api/users` conserve sa réponse historique. |
| Torrents | `/api/downloads/clients/page` filtre et trie la collection partagée avant de renvoyer la page. Facettes calculées sur toute la collection, totaux sur le périmètre et les filtres correspondants, départage par client et hash. | La liste utilise les pages ; filtres multiples, exclusions et opérateurs de recherche sont conservés. Synthèse, fiche torrent et aperçu d'acquisition gardent le contrat historique complet. Les deux contrats partagent la même collecte en cache. |
| Calendrier | Les créations de demandes et la publication de `calendar_projections` par période sont réalisées par `job_calendar`. Un verrou PostgreSQL sérialise les producteurs ; un échec ne publie pas de résultat partiel. | Le GET lit la dernière projection et demande son actualisation. Sur une période jamais préparée, le repli SWR lit les sources sans créer de demande. Le worker prépare aussi le calendrier par défaut et jusqu'à douze périodes récentes toutes les cinq minutes. |
| Scan VF | Instances Arr préchargées par constructeur de tâches ; états d'épisodes préchargés par lots de 1 000 séries. Les règles de choix, de protection VF et de fallback sont conservées. | Les tests existants passent ; 100 candidats films nécessitent trois SELECT, indépendamment du nombre de films. La recherche interactive reste soumise à sa concurrence habituelle. |
| Recherche et bibliothèque | Index trigramme sur le titre, index de tri et curseurs liés à tous les filtres et au tri. Les valeurs nulles et les égalités ont un ordre explicite. | La grille utilise les curseurs ; changer de filtres ou de tri repart à la première page. Les anciens appels avec OFFSET restent compatibles. Les parcours stables sont comparés dans tous les tris, avec dates et années nulles. |
| Statistiques d'activité | `activity_snapshot` ne matérialise plus l'historique complet en objets ORM. Agrégation en un passage, par lots de 1 000 colonnes utiles ; période précédente regroupée en SQL, concurrence calculée en SQL, marathons parcourus avec conservation des dix meilleurs. | Les agrégats journaliers existants sont réutilisés. Historique détaillé limité à 100 lectures, direct conservé. Comparaison avec l'ancien calcul, dont les recouvrements, reprises, sous-titres, spectateurs et changement d'heure. |

Les gabarits `ManageTemplate` et `ControlTable` transmettent maintenant le mode
et les changements de tri serveur de `UiDataTable`. Le mode reste désactivé par
défaut pour les autres consommateurs. Son activation après chargement est réactive
et testée ; les comptes et torrents ne trient donc pas seulement la page visible.

## Mesures d'activité : cache froid distingué du cache chaud

Profil synthétique : **50 000 médias, 200 000 lectures, 10 000 demandes et
501 comptes**. L'environnement ayant redémarré, le jeu a été reconstruit et les
deux versions ont été mesurées successivement dans le même environnement repris.
La référence applicative est `8e1dac9` : son code d'activité et les contrats
historiques concernés sont ceux précédant le lot 4. Les nouveaux index sont
présents pour ces deux mesures HTTP ; les mesures d'index sont isolées ensuite.

Serveur redémarré et agrégats journaliers vidés avant chaque version ; aucun test
ni build ne tourne pendant les relevés. Chaque route reçoit vingt appels. Le
premier appel est présenté séparément, puisque le p95 des appels suivants
masquerait le coût de préparation.

| Mesure d'activité sur 3 650 jours | Avant | Après |
|---|---:|---:|
| Premier appel HTTP, cache froid | 24 585 ms | 20 314 ms |
| Pic mémoire du processus pendant ce parcours | 1 372 MiB | 784 MiB |
| Mémoire résidente après calcul | 605 MiB | 261 MiB |
| Retard maximal de la boucle asynchrone | 3 832 ms | 171 ms |
| Médiane HTTP des 19 lectures chaudes | 14,7 ms | 18,3 ms |

Le gain à froid est d'environ **17 %**, avec **43 %** de réduction du pic mémoire
et **95 %** de réduction du blocage maximal de boucle. Les lectures chaudes
n'affichent pas de gain dans cette campagne : elles restent servies par le cache,
et leur variation ne doit pas être présentée comme une accélération.

Le coût à froid reste élevé. Les compteurs conservent une mémoire proportionnelle
aux médias, spectateurs et combinaisons de lectures distincts ; les agrégations SQL
consomment aussi des ressources PostgreSQL. Le lot 7 doit dimensionner ces
préparations avec la concurrence réelle des jobs. Ces mesures de laboratoire ne
constituent pas une promesse de latence de production.

## Pagination et plans SQL

| Scénario | Avant / contrat complet | Nouveau parcours |
|---|---:|---:|
| Page des médias 49 901 à 50 000, p95 HTTP | OFFSET : 21,9 ms | Curseur : 19,1 ms |
| Même page, médiane du temps SQL cumulé par requête | 8,6 ms | 4,2 ms |
| Comptes, p95 HTTP | 501 comptes : 59,4 ms | Page de 100 : 29,4 ms |
| Comptes, corps JSON décodé | 522 169 octets | 104 371 octets |
| Recherche `%0042%`, EXPLAIN ANALYZE isolé | Sans trigramme : 28,9 ms | Avec trigramme : 0,48 ms |
| Page éloignée, EXPLAIN ANALYZE isolé | OFFSET : 12,26 ms | Seek : 0,26 ms |

La comparaison HTTP du curseur vérifie les mêmes 100 identifiants, sans doublon.
Le count global et l'authentification restent inclus : le gain HTTP est donc plus
modeste que celui du seul accès aux lignes. Une page de comptes effectue davantage
de requêtes courtes pour les compteurs globaux, mais transfère environ 80 % de
données en moins. Les facettes des torrents restent globales au changement de
client et ne sont pas recalculées seulement sur les lignes affichées.

Les plans SQL ont été relevés séparément, sans serveur de mesure actif. L'index
trigramme a été retiré puis recréé **uniquement dans la base jetable du
laboratoire** pour cette comparaison. Ces temps sont des relevés SQL isolés,
pas des p95 HTTP. La méthode et les JSON bruts sont conservés dans `lot4/`.

## Migrations et déploiement

`0054_analytics_projection` livre les projections analytiques des lots 2 et 3.
`0055_collection_projections` ajoute les codemandeurs, les périodes de calendrier et
les index de recherche, de pagination et de notification. La reprise du JSON se
fait dans la transaction de migration ; le trigger maintient ensuite les deux
représentations avec tous les producteurs, anciens ou nouveaux.

La migration crée l'extension PostgreSQL de confiance `pg_trgm`. Le rôle exécutant
la migration doit pouvoir l'installer, ou un administrateur doit l'avoir installée.
Les index sont créés dans le mode transactionnel habituel d'Alembic : sur une grosse
base, prévoir une fenêtre de maintenance et surveiller les verrous et la durée de
construction. Aucun `CREATE INDEX CONCURRENTLY` n'est placé dans cette transaction.

Déployer l'API, le frontend et le worker ensemble. Le worker doit enregistrer
`job_calendar` et son cron. Les périodes déjà préparées restent lisibles lors
d'une panne Arr ; une période jamais préparée garde le repli en lecture seule.
Les bundles déjà ouverts peuvent continuer à utiliser les listes historiques.

Le downgrade de `0055` supprime les projections supplémentaires et les nouveaux
index, conserve le JSON et laisse `pg_trgm` installé pour ne pas casser d'autres
usages. Revenir à l'ancien code API/worker avant de supprimer ces tables.

## Consommateurs et vérifications

- Bibliothèque : `useLibraryGrid`, grille de `useLibraryExplorer`, tests de filtres
  HTTP, curseurs et nulls. Les rails et fiches continuent à recevoir des listes.
- Comptes : `useUserAccounts`, `UsersView`, fiche utilisateur ; les autres
  sélecteurs continuent à lire `/api/users`. Les tests couvrent pages, situations,
  compteurs globaux, recherche et changements de tri.
- Torrents : `useTorrentClients`, `DownloadsClientsView` ; `TorrentDetailView` et
  `useAcquisitionOverview` gardent la collection historique complète.
- Calendrier : `unified_calendar` garde une liste d'événements et les filtres
  existants. Le worker est testé avec deux publications concurrentes, une lecture
  sans création de demande et une source indisponible après une réussite.
- Activité : contrat de `activity_statistics` conservé, parité des résultats
  vérifiée sur PostgreSQL pour le périmètre global et un spectateur.
- Suite complète backend : **2 616 réussites, 6 tests ignorés**, 27 avertissements.
  Après les derniers ajustements, le contrôle ciblé HTTP/projections/comptes
  compte **25 réussites**. Aucun échec final n'est conservé.
- Suite complète frontend : **230 fichiers et 1 346 tests réussis**. Les composants
  partagés et pages modifiés ont ensuite été vérifiés à nouveau avec les derniers
  ajustements : **104 tests ciblés réussis**. TypeScript et build de production
  vérifiés.
- Migration vérifiée sur base vide, puis avec données historiques, JSON invalide et
  doublons : cinq relations distinctes attendues ; downgrade préservant le JSON.

Relevés et protocole : [fichiers du lot 4](lot4/) et
[guide de reproduction](../../scripts/performance/README.md).

## Point d'avancement

| Lot | État | Suite |
|---|---|---|
| 0 — Référence de mesures | Terminé en laboratoire | Calibration sur les données et appareils réels au déploiement. |
| 1 — Capacité et caches API | Implémenté et vérifié | Suivi de la contention réelle au lot 7. |
| 2 — Appels externes et images | Implémenté et vérifié | Ajuster les limites d'images au nombre de processus. |
| 3 — Analytique persistée | Implémenté et vérifié | Surveiller écritures, volume des générations et autovacuum. |
| 4 — Collections et accès SQL | Implémenté et vérifié | Déployer les migrations et les trois composants applicatifs ensemble. |
| 5 — Requêtes et cache navigateur | À faire | Délais, annulations, relances, invalidations SSE, budgets des caches, reprise hors ligne et isolation des comptes. |
| 6 — Ressources et grandes listes | À faire | Découpage des icônes et styles, virtualisation partagée, cache d'affiches du service worker. |
| 7 — Dimensionnement et observation | À faire | Nombre de processus, budget PostgreSQL, concurrence et files de jobs, observation et retour arrière en déploiement. |

Les lots 5, 6 et 7 constituent la suite du plan. Le push demandé livre les
changements ; il ne vaut pas validation d'un déploiement en production.
