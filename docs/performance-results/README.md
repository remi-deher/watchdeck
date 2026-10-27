# Lots 0 et 1 : mesures locales et validation

## Périmètre

Le banc `scripts/benchmark_cache.py` mesure un cache mémoire synthétique : 20 appels
concurrents sur une clé froide, 100 lectures chaudes et 3 000 écritures expirées.
Il isole explicitement Redis et ne contacte ni PostgreSQL ni une intégration.
Les résultats JSON incluent Python, la plateforme, p50/p95 et la mémoire suivie par
`tracemalloc` (ce n'est pas la mémoire résidente totale du processus).

`cache-before.json` utilise le contenu de `app/cache.py` de HEAD avant les
corrections ; `cache-after.json` utilise le code corrigé dans le répertoire de
travail. Le payload simulé et le délai de 20 ms sont identiques. Le bénéfice testé
est la réduction du nombre de calculs, pas une accélération du service distant.

| Mesure | Avant | Après |
|---|---:|---:|
| Calculs pour 20 appels concurrents | 20 | 1 |
| Entrées conservées après les écritures expirées | 3 001 | 1 (la clé valide) |

Reproduction depuis la racine, avec l'environnement Python du projet :

```bash
python scripts/benchmark_cache.py --output /tmp/watchdeck-cache-after.json
```

Pour comparer une révision antérieure, exporter uniquement son fichier cache dans
un répertoire temporaire et fournir son chemin avec `--source`. Les temps locaux
varient ; comparer les compteurs et effectuer plusieurs passages pour les latences.

## Corrections du lot 1

- bcrypt vérifié et calculé dans des threads pour les routes de connexion,
  d'installation et de changement de mot de passe ; coût cryptographique conservé.
- Calcul froid mutualisé par clé dans chaque instance de cache ; verrou Redis
  avec jeton propriétaire lorsque Redis est disponible. Bail de 120 s, attente
  bornée à 95 s et calcul/publication bornés à 90 s. Sans Redis, coordination locale
  uniquement ; une panne réseau ne garantit pas l'exclusion entre processus.
- Cache mémoire limité par `CACHE_MAX_ENTRIES` (2 048 par défaut) et
  `CACHE_MAX_BYTES` (16 Mio de JSON UTF-8 par défaut). Le budget d'octets porte sur
  les valeurs sérialisées, hors surcoût des objets Python. Purge à l'écriture et à
  la lecture d'une clé expirée ; aucune accumulation de nouvelles clés expirées.
- Connexion et opérations Redis bornées à 1 s ; reprise après échec temporisée
  de 10 s. Initialisation sérialisée pour éviter plusieurs connexions initiales.
- Catalogue Arr : délai de 10 s après échec, dernière valeur conservée et
  nouvelle tentative ensuite. L'invalidation explicite supprime aussi ce délai.
- Collecte torrent : copie des valeurs nécessaires puis fin de la transaction de
  lecture avant les appels clients ; aucune mutation métier validée par ce chemin.

Les tailles et délais doivent être comparés aux volumes de l'installation. Le
budget de calcul froid peut produire une erreur bornée sur un calcul supérieur à
90 s ; la dernière valeur reste servie sur le chemin de rafraîchissement périmé.

## Validation effectuée

126 tests ciblés réussis avec une base PostgreSQL de test isolée : cache,
chargement, téléchargements, authentification, sécurité, Sonarr et Radarr.
Les nouveaux tests couvrent concurrence à froid, exception, annulation, budgets
mémoire, coordination de deux caches par verrou partagé, reprise Redis et
contre-pression après échec Arr. La coordination Redis est testée avec un double
partagé ; une validation multiprocessus avec un Redis réel a ensuite été réalisée au lot 0 (voir le rapport lié ci-dessous).
Compilation Python et `git diff --check` réussis. Aucun changement frontend.

```bash
python -m pytest tests/test_performance_lot1.py tests/test_cache.py tests/test_loading_performance.py tests/test_downloads_cache.py tests/test_download_client_queue.py tests/test_auth_roles.py tests/test_security_hardening.py tests/test_radarr.py tests/test_sonarr.py -q
```

## Lot 0 complété

La campagne ultérieure complète la référence locale : [résultats et conclusions](LOT0_MEASUREMENTS.md).
Elle utilise trois volumes (jusqu'à 50 000 médias, 200 000 lectures et 501 comptes),
PostgreSQL et Redis réels, quatre processus concurrents, des jobs ARQ, des mesures
HTTP, des plans SQL et Chromium sur le build de production.

Les résultats bruts et les versions sont conservés dans `lot0/`. Les scripts de
reproduction sont dans `scripts/performance/`. Le lot 0 est clôturé comme référence
de laboratoire ; les limites de représentativité terrain sont explicites dans le rapport.
Aucune migration ni correction des lots suivants n'a été effectuée pour ces mesures.
