# Lot 0 — référence de performance mesurée

Date : 28 octobre 2026. État : campagne de laboratoire terminée sur le code après le lot 1.

## Conditions et portée

Les API FastAPI et le build Vue de production ont été mesurés sur PostgreSQL réel, dans une base dédiée. Les fixtures sont déterministes et synthétiques : elles donnent une référence reproductible à trois échelles, sans prétendre reproduire les volumes ou la distribution d’une installation de production.

Le serveur API utilise un processus et les pools par défaut, sans Redis pour les mesures HTTP. Les p50/p95 HTTP viennent de 20 appels séquentiels par route, puis de 40 appels mixtes par vagues de 8. Le premier appel est conservé séparément : le cache masque certains calculs très longs. Les tampons PostgreSQL et le disque ne sont pas vidés ; « premier appel » désigne le processus applicatif, pas un disque froid.

Le conteneur PostgreSQL de test utilise tmpfs, `fsync=off`, `synchronous_commit=off` et `full_page_writes=off`. Le schéma vient des modèles ORM. Ce protocole favorise les écritures et ne mesure ni les migrations ni les performances d’un disque de production. La limite de l’environnement est de 2 CPU et 8 Gio. Versions et empreintes : [environment.json](lot0/environment.json).

L’instrumentation locale ajoute une sonde de boucle événementielle et d’acquisition de connexion environ toutes les 50 ms. Le temps d’acquisition inclut l’ordonnancement et la vérification de connexion ; il ne constitue pas une mesure isolée d’attente du pool. Le maximum de connexions est un maximum observé par échantillonnage. RSS désigne la mémoire résidente ; le heap navigateur est distinct.

## Jeux de données

| Profil | Médias | Demandes | Lectures | Comptes | Instantané initial (Mio) |
|---|---:|---:|---:|---:|---:|
| small | 1000 | 200 | 1000 | 11 | 0.57 |
| large | 50000 | 10000 | 10000 | 501 | 28.43 |
| history | 50000 | 10000 | 200000 | 501 | 28.43 |

Les dates sont ancrées au 1er octobre 2026 à 12 h UTC, les lectures réparties minute par minute vers le passé. Les titres, codecs, utilisateurs et contenus sont générés ; aucune donnée personnelle réelle. Les images distantes ne sont pas renseignées : les mesures navigateur couvrent les données, le shell et les cartes, pas le téléchargement d’affiches Plex/TMDB. Le jeu initial contient un résumé analytique préparé ; les runs worker le reconstruisent ensuite depuis l’historique réel de la base.

## API : p95 en millisecondes

| Route / scénario | small | large | history |
|---|---:|---:|---:|
| Bibliothèque, 200 éléments | 14.5 | 18.2 | 14.9 |
| Recherche `%0042%` | 5.6 | 34.3 | 33.8 |
| Page éloignée (offset 800 / 49 800) | 16.0 | 27.1 | 16.1 |
| Analytique, 100 éléments triés | 9.0 | 289.8 | 263.5 |
| Résumé analytique | 6.7 | 240.1 | 237.6 |
| Liste des comptes | 4.7 | 36.2 | 36.4 |
| Historique paginé, 100 lectures | 19.0 | 16.9 | 54.2 |
| Statistiques d’activité (cache inclus) | 93.4 | 9.6 | 13.4 |

## Premiers calculs et cache

| Scénario | small, premier appel (ms) | large, premier appel (ms) | history, premier appel (ms) |
|---|---:|---:|---:|
| Analytique, 100 éléments triés | 20.0 | 289.8 | 276.5 |
| Statistiques d’activité (cache inclus) | 93.4 | 1021.8 | 16850.5 |

Les requêtes de statistiques sont effectuées avec `days=3650`, borne longue volontaire pour inclure tout l’historique. Leur coût ne représente pas celui d’une période courte. Les lectures chaudes et le premier calcul doivent conserver deux budgets distincts.

## Charge mixte et ressources API

| Profil | p95 HTTP (ms) | Retard maximal boucle (ms) | Connexions observées | RSS au pic (Mio) | Acquisition connexion, p95 (ms) |
|---|---:|---:|---:|---:|---:|
| small | 115.0 | 8.8 | 7 | 134.9 | 45.8 |
| large | 614.0 | 210.8 | 7 | 323.7 | 369.8 |
| history | 688.2 | 287.7 | 7 | 1375.1 | 343.6 |

Le RSS au pic couvre la vie du processus, donc également les premiers calculs réalisés avant la charge mixte. Les JSON HTTP contiennent aussi, par route, les nombres de requêtes SQL, leurs durées, le volume de réponse décompressé et la mémoire courante.

## Authentification concurrente

| Profil | 4 connexions : maximum (ms) | Route indépendante : p95 (ms) | Retard boucle maximal (ms) |
|---|---:|---:|---:|
| small | 410.6 | 17.8 | 33.1 |
| large | 432.5 | 38.1 | 3.9 |
| history | 451.0 | 44.3 | 3.9 |

## Plans SQL

| Profil | Recherche (ms) | Première page (ms) | Page éloignée (ms) | Historique récent (ms) |
|---|---:|---:|---:|---:|
| small | 0.3 | 0.0 | 0.3 | 0.0 |
| large | 15.2 | 0.1 | 5.5 | 0.0 |
| history | 14.4 | 0.1 | 9.3 | 0.1 |

Une exécution `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` est conservée pour chaque cas dans les fichiers `*-dataset.json`. Ces durées SQL excluent transport HTTP, décodage ORM, sérialisation JSON et rendu navigateur. Elles ne sont pas des p95.

## Worker ARQ réel

| Profil | Recalcul médian (ms) | Maximum sur 3 jobs (ms) | RSS au pic (Mio) | Retard boucle maximal (ms) | Attente maximale en file (ms) |
|---|---:|---:|---:|---:|---:|
| small | 126.1 | 132.2 | 91.4 | 9.5 | 354.3 |
| large | 931.1 | 942.6 | 438.6 | 710.0 | 1896.7 |
| history | 5582.7 | 5981.5 | 1306.7 | 4307.8 | 11388.2 |

Trois jobs `job_library_analytics(force=True)` passent réellement par Redis et ARQ, avec un seul job simultané et sans cron. Le catalogue Plex est remplacé par une fixture de 100 ms : le chargement de l’historique, les agrégations, la persistance PostgreSQL, les états et les événements du job sont exécutés. Les latences Plex réelles et les contentions de 15 jobs ne sont pas simulées ici. Les fichiers `*-worker.json` isolent en complément le noyau de calcul sans ARQ.

## Navigateur : bibliothèque

Chromium headless utilise les vraies API, sans interception de réponse. Trois contextes neufs par profil et format. Le mobile est simulé en 390 × 844, CPU ralenti ×4, débit descendant 1,6 Mbit/s et latence CDP de 150 ms. Le bureau est en 1 440 × 900 sans ralentissement. Ces profils ne remplacent pas des appareils physiques.

| Profil | Format | Contenu utile médian (ms) | LCP observé médian (ms) | Retour médian (ms) | Cartes rendues après défilement, max | DOM après défilement, max |
|---|---:|---:|---:|---:|---:|---:|
| small | bureau | 1274.7 | 668 | 332.5 | 40 | 1402 |
| small | mobile | 4933.4 | 2056 | 1221.5 | 24 | 833 |
| large | bureau | 1256.1 | 668 | 425.0 | 72 | 2204 |
| large | mobile | 4967.5 | 2076 | 1265.6 | 24 | 833 |

Le contenu utile est la première carte réellement visible, distincte du LCP du shell. Le retour est un rechargement de document avec les caches du même contexte, pas un clic SPA. Le test effectue 12 descentes ; il ne charge pas les 50 000 médias. Les ressources transmises, les tâches longues et le heap à chaque phase sont conservés dans les JSON. Les métriques réseau de phase sont cumulatives et aucune collecte forcée de mémoire n’est effectuée.

## Réactivité et tableaux

| Format | Interactions observées (> seuil Event Timing) | Candidat INP de la session (ms) |
|---|---:|---:|
| bureau | 10 | 24 |
| mobile | 18 | 1176 |

Une session de recherche est instrumentée par format. Le candidat INP correspond au maximum des durées regroupées par interaction dans cette session courte. Il sert à détecter une lenteur à profiler ; il ne constitue pas l’INP terrain au 75e percentile des utilisateurs.

| Tableau des comptes, profil history | Premier contenu utile (ms) | Lignes initiales | Lignes après 12 descentes | DOM initial | DOM final | Heap initial / final (Mio) |
|---|---:|---:|---:|---:|---:|---:|
| bureau | 2791.9 | 501 | 501 | 13332 | 13332 | 100.1 / 100.3 |
| mobile | 8100.6 | 501 | 501 | 13238 | 13238 | 91.9 / 92.0 |

## Stockage et reprise hors ligne

IndexedDB contient 240002 octets et 5 requêtes persistées. La lecture directe prend 1.20 ms et le décodage JSON 0.30 ms ; ce microtest est distinct du temps de remontage complet de l'application.

Après une première visite neuve : cartes disponibles hors ligne = False, résultat observé : `page.reload: net::ERR_FAILED`. Après une navigation en ligne contrôlée par le service worker : cartes disponibles hors ligne = True, 200 cartes en 1188.0 ms.

La reprise après la toute première visite et la reprise avec le shell déjà en cache doivent donc être testées séparément. Ce point complète les travaux de persistance du lot 5 ; aucune correction du service worker n'a été faite pendant les mesures.

## Cache et dépendances lentes ou défaillantes

| Scénario | Résultat |
|---|---:|
| 20 requêtes sur cache Redis froid | 1 calcul, 306.4 ms au total, fixture de 250 ms |
| 4 processus distincts sur la même clé | 1 calcul |
| TTL dur expiré, deux lecteurs concurrents | 1 recalcul, 304.3 ms au total |
| Valeur périmée disponible | Réponse en 0.11 ms, ancienne valeur servie puis actualisée |
| Redis accepte la connexion mais reste silencieux | Repli initial en 1002.4 ms ; appel suivant en 0.05 ms |
| Redis rétabli après la temporisation de 10 s | Reconnexion en 1.6 ms, nouvelle valeur vérifiée dans Redis |
| 20 lectures d’un catalogue Arr lent (250 ms) | 1 appel amont, 283.7 ms au total |
| 20 lectures après erreur HTTP 503 Arr | 1 tentative amont, dernière valeur préservée |

Le Redis utilisé est un conteneur jetable dédié. Les scénarios Arr et Redis silencieux utilisent des sockets TCP locales, pas des délais ajoutés aux API applicatives. Le test de coordination multiprocessus complète la validation locale du lot 1.

## Conclusions et suite des corrections

1. **Priorité au lot 3 :** la pagination analytique continue de payer le coût du catalogue entier. Les recalculs et leur mémoire augmentent fortement avec l’historique ; le worker peut bloquer sa propre boucle pendant plusieurs secondes.
2. **Ajouter au lot 4 les statistiques d’activité à froid (PERF-40) :** le premier calcul de longue période est masqué par les réponses chaudes. Préparer les agrégats et limiter les lignes chargées ; conserver un budget séparé pour reconstruction et lecture.
3. **Priorité frontend aux lots 5 et 6 :** le temps de première carte et les interactions mobiles restent à améliorer. La grille virtualisée reste bornée sur le parcours mesuré ; le tableau des comptes doit être suivi séparément.
4. **Index et curseurs restent justifiés par la croissance :** les plans SQL de recherche et de page éloignée donnent maintenant une référence précise. La sonde du pool ne permet pas à elle seule de conclure à une saturation PostgreSQL ; comparer avec les blocages CPU.
5. **Lot 1 confirmé sur les scénarios mesurés :** déduplication entre processus, service périmé rapide et reprise après panne réelle de Redis. Cela ne garantit pas l’exclusion entre processus pendant une partition réseau.

## Reproduction et validation

Voir [le protocole](../../scripts/performance/README.md) depuis la racine du dépôt (chemin `scripts/performance/README.md`). Les scripts, la version de base Git et les empreintes sont conservés avec les résultats. La campagne doit rester séquentielle pour éviter la concurrence des différents bancs de mesure.

Le lot 0 est clôturé comme **référence de laboratoire**. Les mesures terrain, les images réelles, les appareils physiques, les distributions réelles des données et le dimensionnement de tous les crons restent des validations de déploiement. Aucune performance de production ni conformité générale aux seuils Core Web Vitals n’est revendiquée.
