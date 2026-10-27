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
