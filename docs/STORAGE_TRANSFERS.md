# Stockages et transferts

Watchdeck utilise sa même image pour l’API, le worker général et un moteur de transfert séparé. Seul ce dernier reçoit les montages des médias. PostgreSQL conserve les tâches, commandes et preuves de copie.

## Démarrage

Le fichier `compose.storage.yaml` complète `docker-compose.yml`. Définir `STORAGE_DATA1_PATH`, `STORAGE_DATA2_PATH` et `STORAGE_USB_PATH` avec les dossiers réels du serveur Docker. Ils sont montés sous `/storage/data1`, `/storage/data2` et `/storage/usb`. `TRANSFER_UID` et `TRANSFER_GID` désignent le propriétaire des médias (568 par défaut).

```sh
docker compose -f docker-compose.yml -f compose.storage.yaml build
docker compose -f docker-compose.yml -f compose.storage.yaml up -d
```

L’API applique les migrations avant de devenir saine. Le moteur charge la clé de chiffrement partagée depuis le volume de données en lecture seule, puis abandonne les privilèges pour l’UID/GID configuré. Il publie un heartbeat local contrôlé par Docker. La clé conserve ses permissions restrictives.

## Correspondance des chemins

La page `/storage`, réservée aux administrateurs, liste une ligne par racine Arr et par instance. Les dossiers Plex proposés viennent des bibliothèques du même type sur le serveur associé à l’instance. Ils ne sont pas associés automatiquement à partir de leurs noms.

Choisir le dossier Plex puis **Vérifier**. Ce contrôle utilise uniquement les API : il compare les chemins relatifs des fichiers et les identifiants TMDB/TVDB sur cinq titres présents maximum. Les titres sans fichiers sont écartés ; un dossier vide ne peut pas être confirmé. Un résultat concordant certifie seulement l’échantillon affiché, à la date indiquée. Une modification du choix Plex masque le résultat de l’ancienne paire.

Enregistrer ensuite un stockage et ses correspondances. Le montage du moteur et son éventuel sous-dossier sont distincts des chemins vus par Arr/Plex. Le moteur refuse de travailler sur un répertoire de remplacement non monté ou un lien symbolique.

## Déplacement manuel

Choisir une source, une destination, une réserve et un objectif. L’aperçu impose la capacité disponible et les réservations des autres tâches. Aucun lot ne démarre sans sélection explicite. Les automatisations de libération de place ne sont pas activées.

Le moteur vérifie à nouveau les racines, les identifiants et les fichiers de chaque titre. Il reporte les lectures Plex actives et les téléchargements/imports Arr. La copie utilise rsync et ses fichiers partiels ; l’original est conservé tant qu’Arr ne reconnaît pas la destination et que Plex ne conserve pas les mêmes fiches. Un titre bloqué laisse passer les suivants.

Pause et arrêt conservent les fichiers partiels. La reprise après redémarrage est activée par défaut pour les tâches qui étaient en cours ; les pauses explicites restent respectées. La vérification standard exploite les preuves rsync ; la vérification renforcée ajoute SHA-256 sur les fichiers montés. Le calcul SSH distant n’est pas encore exposé dans cette intégration.

Ne pas traiter simultanément les mêmes titres avec Watchdeck et l’ancienne application Transfert USB : leurs verrous sont indépendants.

## Validation locale

La validation du port 8000 conserve les connexions Arr/Plex existantes. Les vérifications d’inventaire sont en lecture seule. Les montages locaux de démonstration, configurés dans `.codex/storage-local.env`, pointent sur des dossiers de test ; ils ne contiennent pas les médias du NAS. Une copie rsync, l’arrêt/reprise et le nettoyage ont été validés avec un fichier synthétique et des réponses Arr/Plex simulées dans une base isolée.

La sauvegarde de la base avant migration et les rapports de contrôle sont conservés sous `.codex/` et ignorés par Git.
