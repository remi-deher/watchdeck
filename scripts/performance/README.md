# Référence de performance locale — lot 0

Ces scripts utilisent exclusivement `127.0.0.1` et la base dédiée
`watchdeck_perf_lot0` sur le PostgreSQL de test (port 5433). Le mode `seed` remplace
les tables de **cette base dédiée** ; ne pas y conserver de données utiles.
Les identifiants présents dans les scripts sont ceux du laboratoire jetable.
Aucune configuration, route de diagnostic ni donnée n'est ajoutée au serveur
applicatif normal : l'instrumentation n'existe que dans le processus du harness.

Préparer PostgreSQL selon le profil `test` de Compose et créer une fois cette base
avec son utilisateur de test. Les scripts Python utilisent les dépendances du
projet, les scripts Node `@playwright/test` et Chromium installé localement
(`CHROMIUM_PATH` permet de sélectionner son exécutable).

```bash
npm run build
python scripts/performance/backend.py seed --profile small
python scripts/performance/backend.py server
```

Dans un autre terminal, après disponibilité du port 8765 :

```bash
python scripts/performance/backend.py http --profile small
node scripts/performance/browser.mjs small
```

Arrêter le serveur avant de changer le jeu de données. Répéter avec `large`, puis
`history` pour les mesures HTTP. Le navigateur est mesuré sur `small` et `large`.
Exécuter les différentes mesures successivement pour éviter de concurrencer les
processus de mesure. Le serveur sert le build de production ; son lifespan est
volontairement désactivé pour ne lancer ni migration ni collecte externe. Le schéma
est créé par les modèles ORM, pas par une migration mesurée.

Le noyau de rafraîchissement analytique du worker se mesure dans un processus
indépendant :

```bash
python scripts/performance/worker.py small
```

Adapter l'argument au profil actuellement chargé. Ce calcul remplace l'instantané
analytique de laboratoire ; le faire après les mesures HTTP et navigateur du profil.
Il utilise PostgreSQL réellement, mais remplace l'acquisition du catalogue Plex par
une fixture de 100 ms. Il ne mesure ni l'ordonnanceur ARQ ni un serveur Plex réel.

Les interactions de recherche sont mesurées sur le profil `large` :

```bash
node scripts/performance/interactions.mjs
```

Enfin, `failures.py` nécessite un Redis jetable dédié sur `127.0.0.1:6387` (base 15,
vidée par le script). Il ouvre aussi les ports 6388 et 6389 pour des fixtures locales.
Il ne faut pas utiliser ce Redis pour une application ou d'autres tests.

```bash
docker run --rm -d --name watchdeck-perf-redis -p 127.0.0.1:6387:6379 redis:7-alpine redis-server --save '' --appendonly no
python scripts/performance/failures.py
docker stop watchdeck-perf-redis
```

Les résultats sont écrits dans `docs/performance-results/lot0/`. Les JSON conservent
les mesures brutes ou agrégées par scénario. Lire le rapport associé pour les
conditions, les limites de représentativité et les conclusions.

## Campagne complète

Créer la base une fois, puis démarrer le Redis jetable avant la campagne :

```bash
docker exec watchdeck-postgres-test createdb -U watchdeck watchdeck_perf_lot0
python scripts/performance/run.py
python scripts/performance/failures.py
python scripts/performance/manifest.py
python scripts/performance/report.py
```

`run.py` alimente successivement les trois profils, redémarre le serveur local et
exécute les scénarios HTTP, navigateur, tableau, hors ligne, noyau analytique et
ARQ. Ne pas lancer un second serveur sur le port 8765 pendant cette commande.
Le mode ARQ de `worker.py` exécute trois vrais jobs sur le Redis dédié (base 14),
avec une concurrence de 1 et sans cron ; le catalogue externe reste une fixture.
Les scripts de panne utilisent séparément la base 15 du même Redis jetable.
Les deux bases Redis sont vidées au début de leur scénario.

`tables.mjs` mesure les 501 comptes du profil `history`. `offline.mjs` relève le
volume IndexedDB et compare la reprise hors ligne après première visite et après
une navigation contrôlée par le service worker. Un échec fonctionnel observé est
conservé dans les résultats, sans être transformé en réussite du parcours.

Les mesures HTTP comprennent 20 appels par route, 40 appels mixtes par vagues de
8 et 4 connexions simultanées avec une route de consultation indépendante.
Le rapport est généré à partir des résultats et vérifie leurs volumes et leur
intégrité. Le script `manifest.py` ne lit ni n'exporte de valeur de credential.

## Vérification des lots 2 et 3

`WATCHDECK_PERF_RESULTS` permet aux scripts Python d'écrire dans un autre dossier
sans écraser la référence du lot 0. Utiliser le même dossier pour le serveur et
son client de mesure. Sur le profil `history` déjà chargé, arrêter le serveur
avant les mesures du worker, puis le redémarrer pour mesurer les lectures SQL :

```bash
export WATCHDECK_PERF_RESULTS="$PWD/docs/performance-results/lot23"
python scripts/performance/worker.py history
python scripts/performance/analytics_incremental.py
python scripts/performance/backend.py server
# Dans un second terminal avec la même variable :
python scripts/performance/backend.py http --profile history
```

`analytics_incremental.py` utilise une empreinte de catalogue stable et mesure
séparément l'initialisation, une vérification sans changement, une correction
historique d'une milliseconde et la vérification suivante. Cette correction reste
uniquement dans la base jetable du laboratoire. Le script vérifie aussi le nombre
d'acquisitions du catalogue. `worker.py` force au contraire une empreinte
indisponible : chaque passage reconstruit intégralement la projection.

Après arrêt du serveur, mesurer séparément la file d'images :

```bash
python scripts/performance/images.py
```

Cette dernière mesure utilise 60 JPEG synthétiques de 1280 × 1920 pixels, une
source simulée de 20 ms et de vrais encodages Pillow en WebP de 300 pixels. Elle
rapporte séparément les attentes de téléchargement et d'encodage, la concurrence
maximale et les temps des grilles froide et chaude. Elle ne mesure pas un CDN réel.

## Collections et activité — lot 4

Sur le profil `history`, démarrer le serveur avec les résultats dans `lot4`, puis
exécuter successivement, hors tests et builds :

```bash
export WATCHDECK_PERF_RESULTS="$PWD/docs/performance-results/lot4"
python scripts/performance/backend.py server
# Autre terminal, même variable :
python scripts/performance/activity_http.py after
python scripts/performance/collection_pages.py
```

`activity_http.py` sépare le premier calcul des dix-neuf appels chauds. Pour une
comparaison, redémarrer chaque version du serveur et vider uniquement
`playback_daily_aggregates` dans la base jetable avant son démarrage. L'argument
`before` ou `after` sélectionne le nom du fichier de résultats ; le script vise
le serveur déjà lancé sur 8765. Les nouveaux index restent identiques pour les
deux versions applicatives de cette comparaison.

`collection_pages.py` compare OFFSET et curseur au voisinage du 50 000e média,
vérifie les identifiants retournés et mesure aussi les 501 comptes historiques
contre une page de 100 comptes. Les plans SQL séparés du rapport documentent
l'effet de l'index trigramme et le nombre de lignes parcourues par le curseur.

## Navigateur et caches — lot 5

Après le build de production, sur le profil `history` existant, démarrer le serveur
habituel du laboratoire et lancer les scénarios successivement, hors tests et builds :

```bash
export WATCHDECK_PERF_RESULTS=docs/performance-results/lot5
node scripts/performance/offline.mjs
node scripts/performance/cache_navigation.mjs
```

Le premier utilise un nouveau contexte navigateur : première visite, installation
du service worker, IndexedDB, puis rechargement hors ligne. Le second parcourt
36 filtres de bibliothèque dans la même application. Il relève uniquement les
nombres de requêtes, leurs racines et tailles JSON, les copies de session et les
volumes IndexedDB ; il n'exporte pas les données de compte. Les requêtes observées
ou en cours sont distinguées des variantes inactives, auxquelles s'applique
l'éviction. Aucune instrumentation n'est ajoutée à l'application de production.
