# Stockages et transferts

Watchdeck utilise sa même image pour l’API, le worker général et un moteur de transfert séparé. Seul ce dernier reçoit les montages des médias. PostgreSQL conserve les tâches, commandes et preuves de copie.

## Démarrage

Le mode API ne nécessite aucun montage média. Les montages suivants concernent le traitement des anciennes tâches rsync.

Le fichier `compose.storage.yaml` complète `docker-compose.yml`. Définir `STORAGE_DATA1_PATH`, `STORAGE_DATA2_PATH` et `STORAGE_USB_PATH` avec les dossiers réels du serveur Docker. Ils sont montés sous `/storage/data1`, `/storage/data2` et `/storage/usb`. `TRANSFER_UID` et `TRANSFER_GID` désignent le propriétaire des médias (568 par défaut).

```sh
docker compose -f docker-compose.yml -f compose.storage.yaml build
docker compose -f docker-compose.yml -f compose.storage.yaml up -d
```

L’API applique les migrations avant de devenir saine. Le moteur charge la clé de chiffrement partagée depuis le volume de données en lecture seule, puis abandonne les privilèges pour l’UID/GID configuré. Il publie un heartbeat local contrôlé par Docker. La clé conserve ses permissions restrictives.

## Correspondance des chemins

La page `/storage`, réservée aux administrateurs, liste une ligne par racine Arr et par instance. Les dossiers Plex proposés viennent des bibliothèques du même type sur le serveur associé à l’instance. Une racine Plex est proposée si une seule option partage l’identité de stockage et le dernier segment complet du chemin : `/usb/FILMS` peut correspondre à `/usb/MEDIA/FILMS`, mais pas à `/data/FILMS` ni à `/usb2/FILMS`. Les alias conventionnels `/data` et `/media` désignent DATA1 pour les suggestions. Ces noms ne constituent jamais une preuve : la confirmation nécessite les contrôles de contenu.

Choisir le dossier Plex puis **Vérifier**. Ce contrôle utilise uniquement les API : il compare les chemins relatifs des fichiers et les identifiants TMDB/TVDB sur cinq titres présents maximum. Les titres sans fichiers sont écartés ; un dossier vide ne peut pas être confirmé. Un résultat concordant certifie seulement l’échantillon affiché, à la date indiquée. Une modification du choix Plex masque le résultat de l’ancienne paire.

Le bouton Enregistrer sauvegarde une association Arr/Plex confirmée sans demander de montage moteur. La préparation utilise les racines déclarées et accessibles par Arr.

## Traitement historique rsync (désactivé pour les nouveaux transferts)

Choisir une source, une destination, une réserve et un objectif. L’aperçu impose la capacité disponible et les réservations des autres tâches. Aucun lot ne démarre sans sélection explicite. Les automatisations de libération de place ne sont pas activées.

Le moteur vérifie à nouveau les racines, les identifiants et les fichiers de chaque titre. Il reporte les lectures Plex actives et les téléchargements/imports Arr. La copie utilise rsync et ses fichiers partiels ; l’original est conservé tant qu’Arr ne reconnaît pas la destination et que Plex ne conserve pas les mêmes fiches. Un titre bloqué laisse passer les suivants.

Pause et arrêt conservent les fichiers partiels. La reprise après redémarrage est activée par défaut pour les tâches qui étaient en cours ; les pauses explicites restent respectées. La vérification standard exploite les preuves rsync ; la vérification renforcée ajoute SHA-256 sur les fichiers montés. Le calcul SSH distant n’est pas encore exposé dans cette intégration.

Ne pas traiter simultanément les mêmes titres avec Watchdeck et l’ancienne application Transfert USB : leurs verrous sont indépendants.

## Validation locale

La validation du port 8000 conserve les connexions Arr/Plex existantes. Les vérifications d’inventaire sont en lecture seule. Les montages locaux de démonstration, configurés dans `.codex/storage-local.env`, pointent sur des dossiers de test ; ils ne contiennent pas les médias du NAS. Une copie rsync, l’arrêt/reprise et le nettoyage ont été validés avec un fichier synthétique et des réponses Arr/Plex simulées dans une base isolée.

La sauvegarde de la base avant migration et les rapports de contrôle sont conservés sous `.codex/` et ignorés par Git.


## Déplacements par Sonarr / Radarr

Pour les nouveaux transferts, seul le mode API Sonarr/Radarr est proposé. Préparer choisit une instance et deux racines déclarées, accessibles, avec un espace libre mesuré. Leur association Plex est déduite lorsqu’elle est unique, puis contrôlée par contenu. Une association ambiguë exige une confirmation explicite dans Stockages ; aucun chemin technique du moteur n’est demandé. Le bouton Enregistrer du tableau sauvegarde directement une association Arr/Plex contrôlée.

Une commande BulkMoveMovie/BulkMoveSeries est confiée à Arr, avec intention et identifiant persistés. Une soumission incertaine après crash est bloquée, jamais répétée automatiquement. Pause/arrêt empêchent les prochains titres sans interrompre une copie déjà confiée à Arr. La copie, la suppression de l’original et sa reprise dépendent d’Arr : Watchdeck ne garantit ni hash ni conservation de l’original pendant la confirmation Plex. Une commande terminée n’est marquée terminée dans Watchdeck qu’après confirmation du chemin Arr et des fiches Plex.

Le paquet rsync reste installé, mais le mode est absent de l’interface et refusé par le schéma API des nouveaux transferts. Le traitement des anciennes tâches rsync reste compatible. Aucun accès au socket Docker ni modification automatique de montages n’est activé.

## Organisation de l’interface

StorageView coordonne la navigation et les appels API. useStorageTelemetry calcule les indicateurs de suivi ; storageAssociations centralise les helpers de correspondance. StoragePreparePanel affiche la préparation Arr ; StorageRootTable gère la présentation des associations et émet les demandes de vérification/enregistrement ; StorageAssociationDialog édite une association. Ces composants réutilisent UiButton, UiDataTable et ModalShell. Le style partagé est contenu dans la page ; le formulaire de la modale conserve son style après téléportation. Le module backend arr_transfer isole le protocole Arr du traitement historique rsync.


### Tâches enregistrées sans lancement

L’aperçu propose « Enregistrer la tâche » (état `draft`, aucune exécution) ou
« Lancer la sélection ». Seuls les brouillons sont modifiables. Leur aperçu
exclut leurs propres réservations, mais conserve celles des autres tâches.
La sauvegarde et le lancement recalculent les accès, capacités et titres côté
serveur sous verrou transactionnel avant de remplacer les snapshots.
Une reprise directe d’un brouillon est refusée : il faut valider son nouvel
aperçu. Les tâches démarrées conservent pause/reprise/arrêt/réessai ; créer une
tâche similaire refait une sélection actuelle sans réutiliser les anciens chemins.


### Sources multiples

Chaque instance peut sélectionner plusieurs racines source vers une destination
unique. Le volume à libérer et la limite de titres portent sur l’ensemble des
sources de l’instance. Le mode espace libre minimum applique le seuil à chaque
source et partage la capacité destination et la limite de titres entre elles.
Les capacités des sources ne sont pas additionnées, car plusieurs racines
peuvent résider sur le même disque. Chaque titre conserve son stockage source
réel dans son snapshot. Le nom facultatif de la tâche est conservé dans params.


### Objectifs d’espace et personnalisation

La préparation propose uniquement « Libérer de l’espace » et « Atteindre un
espace libre minimum ». La valeur générale s’applique à chaque racine choisie ;
les valeurs personnalisées sont envoyées dans `root_goals`. Modifier la valeur
générale réinitialise les personnalisations. Chaque racine doit couvrir son
propre objectif : un dépassement sur une autre ne le compense pas.
Le type de média découle des instances choisies. La limite facultative de titres
est dans les options avancées ; le plafond technique d’un lot reste 250 titres.
Les anciennes tâches sans `root_goals` conservent leur sémantique historique.


### Gestion des tâches dans Transferts

Les filtres comptent les tâches : À lancer, En cours, En pause / À traiter et
Terminées. Le résumé et la progression portent sur les titres terminés, sans
inventer de pourcentage de copie Arr. Les fichiers et chemins restent repliés.
« Vérifier et lancer » ouvre un aperçu actualisé sans démarrer de transfert.
La suppression demande une confirmation et est limitée aux brouillons ; le
serveur verrouille la tâche et supprime uniquement son plan et ses réservations.
