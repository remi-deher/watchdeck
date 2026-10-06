# Stockages et transferts

Watchdeck utilise sa même image pour l’API, le worker général et un moteur de transfert séparé. Seul ce dernier reçoit les montages des médias lorsque la méthode « fichiers montés » est utilisée. La méthode SSH exécute rsync sur le serveur distant sans montage média dans Docker. PostgreSQL conserve les tâches, commandes et preuves de copie.

## Démarrage

Les modes API et rsync SSH ne nécessitent aucun montage média.

Le fichier `compose.storage.yaml` complète `docker-compose.yml` sans imposer de volumes média. Pour rsync local ou les anciennes tâches rsync, ajouter **aussi** `compose.storage.mounts.yaml` et définir `STORAGE_DATA1_PATH`, `STORAGE_DATA2_PATH` et `STORAGE_USB_PATH`. Ils sont montés sous `/storage/data1`, `/storage/data2` et `/storage/usb`. Une installation qui utilisait déjà ces montages doit conserver ce troisième fichier lors de ses mises à jour. `TRANSFER_UID` et `TRANSFER_GID` désignent le propriétaire des médias (568 par défaut).

```sh
docker compose -f docker-compose.yml -f compose.storage.yaml build
docker compose -f docker-compose.yml -f compose.storage.yaml up -d
```

L’API applique les migrations avant de devenir saine. Le moteur charge la clé de chiffrement partagée depuis le volume de données en lecture seule, puis abandonne les privilèges pour l’UID/GID configuré. Il publie un heartbeat local contrôlé par Docker. La clé conserve ses permissions restrictives.

## Correspondance des chemins

La page `/storage`, réservée aux administrateurs, liste une ligne par racine Arr et par instance. Les dossiers Plex proposés viennent des bibliothèques du même type sur le serveur associé à l’instance. Une racine Plex est proposée si une seule option partage l’identité de stockage et le dernier segment complet du chemin : `/usb/FILMS` peut correspondre à `/usb/MEDIA/FILMS`, mais pas à `/data/FILMS` ni à `/usb2/FILMS`. Les alias conventionnels `/data` et `/media` désignent DATA1 pour les suggestions. Ces noms ne constituent jamais une preuve : la confirmation nécessite les contrôles de contenu.

Choisir le dossier Plex puis **Vérifier**. Ce contrôle utilise uniquement les API : il compare les chemins relatifs des fichiers et les identifiants TMDB/TVDB sur cinq titres présents maximum. Les titres sans fichiers sont écartés ; un dossier vide ne peut pas être confirmé. Un résultat concordant certifie seulement l’échantillon affiché, à la date indiquée. Une modification du choix Plex masque le résultat de l’ancienne paire.

Le bouton Enregistrer sauvegarde une association Arr/Plex confirmée sans demander de montage moteur. La préparation utilise les racines déclarées et accessibles par Arr.

## Accès rsync

Dans Stockages, ajouter un accès SSH ou un accès aux fichiers montés. Un accès contient les chemins physiques de chaque racine Arr ; il ne remplace pas les associations Arr/Plex. En SSH, le même serveur doit voir sources et destinations. Python 3 et rsync (avec xxh128) doivent y être installés ; aucun sudo automatique ni socket Docker n’est utilisé.

L’accès SSH exige hôte, port, utilisateur, empreinte SHA256 du serveur et mot de passe ou clé privée importée (avec phrase secrète si nécessaire). L’empreinte se récupère par un canal de confiance, par exemple `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256` sur le serveur. Les secrets sont chiffrés par le mécanisme Watchdeck existant ; ils ne sont jamais renvoyés au navigateur ni enregistrés dans les tâches.

« Tester et valider » contrôle les associations Arr/Plex, un échantillon de noms/tailles de fichiers Arr, les permissions et un fichier temporaire écrit puis effacé, rsync et la capacité. Une racine sans fichiers Arr est admise avec un avertissement ; elle ne prouve pas le contenu. Modifier un accès invalide sa validation et les aperçus précédents. Un accès utilisé par une tâche non terminée ne peut pas être modifié.

Préparer propose API Arr par défaut, rsync SSH et rsync fichiers montés. Les méthodes rsync exigent un accès validé couvrant toutes les racines de la sélection. Le serveur refait les contrôles lors de l’aperçu et du lancement. Aucun fallback automatique n’est activé.

## Exécution rsync

Choisir une source, une destination, une réserve et un objectif. L’aperçu impose la capacité disponible et les réservations des autres tâches. Aucun lot ne démarre sans sélection explicite. Les automatisations de libération de place ne sont pas activées.

Le moteur vérifie à nouveau les racines, les identifiants et les fichiers de chaque titre. Il reporte les lectures Plex actives et les téléchargements/imports Arr. La copie utilise rsync et ses fichiers partiels ; l’original est conservé tant qu’Arr ne reconnaît pas la destination et que Plex ne conserve pas les mêmes fiches. Un titre bloqué laisse passer les suivants.

Pause et arrêt conservent les fichiers partiels. La reprise après redémarrage est activée par défaut pour les tâches qui étaient en cours ; les pauses explicites restent respectées. La vérification standard exploite les preuves rsync ; la vérification renforcée ajoute SHA-256 sur les fichiers montés. En SSH, copie et hashes s’exécutent sur le serveur distant ; les médias ne transitent pas par l’API Watchdeck.

Ne pas traiter simultanément les mêmes titres avec Watchdeck et l’ancienne application Transfert USB : leurs verrous sont indépendants.

## Validation locale

La validation du port 8000 conserve les connexions Arr/Plex existantes. Les vérifications d’inventaire sont en lecture seule. Les montages locaux de démonstration, configurés dans `.codex/storage-local.env`, pointent sur des dossiers de test ; ils ne contiennent pas les médias du NAS. Une copie rsync, l’arrêt/reprise et le nettoyage ont été validés avec un fichier synthétique et des réponses Arr/Plex simulées dans une base isolée.

La sauvegarde de la base avant migration et les rapports de contrôle sont conservés sous `.codex/` et ignorés par Git.


## Déplacements par Sonarr / Radarr

Le mode API Sonarr/Radarr reste proposé par défaut. Préparer choisit une instance et deux racines déclarées, accessibles, avec un espace libre mesuré. Leur association Plex est déduite lorsqu’elle est unique, puis contrôlée par contenu. Une association ambiguë exige une confirmation explicite dans Stockages ; aucun chemin technique du moteur n’est demandé. Le bouton Enregistrer du tableau sauvegarde directement une association Arr/Plex contrôlée.

Une commande BulkMoveMovie/BulkMoveSeries est confiée à Arr, avec intention et identifiant persistés. Une soumission incertaine après crash est bloquée, jamais répétée automatiquement. Pause/arrêt empêchent les prochains titres sans interrompre une copie déjà confiée à Arr. La copie, la suppression de l’original et sa reprise dépendent d’Arr : Watchdeck ne garantit ni hash ni conservation de l’original pendant la confirmation Plex. Une commande terminée n’est marquée terminée dans Watchdeck qu’après confirmation du chemin Arr et des fiches Plex.

Le paquet rsync reste installé pour la méthode locale et les anciennes tâches. Aucun accès au socket Docker ni modification automatique des montages n’est activé.

## Organisation de l’interface

StorageView coordonne la navigation et les appels API. useStorageTelemetry calcule les indicateurs de suivi ; storageAssociations centralise les helpers de correspondance. StoragePreparePanel affiche la préparation ; StorageTransferMethod choisit le protocole ; StorageAccessPanel configure et teste les accès rsync ; StorageRootTable gère la présentation des associations et émet les demandes de vérification/enregistrement ; StorageAssociationDialog édite une association. Ces composants réutilisent UiButton, UiDataTable et ModalShell. Le style partagé est contenu dans la page ; le formulaire de la modale conserve son style après téléportation. Le module backend arr_transfer isole le protocole Arr du traitement rsync. `access` gère les profils et validations, `remote_fs` le protocole SSH, `remote_agent` les opérations sur le serveur. Une session SSH interrompue cesse ses heartbeats : rsync s’arrête en conservant son fichier partiel. Un verrou distant empêche une nouvelle copie concurrente pendant cet arrêt. La méthode est conservée pour chaque tâche.


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


### Validation rsync SSH

Un essai avec fichiers synthétiques dans un dossier temporaire TrueNAS a validé :
contrôle des chemins, copie réelle, pause avec fichier partiel, reprise et comparaison
SHA-256 identique. Aucune copie de média réel n’est déclenchée par les tests.


## Connexions et chemins

Dans Stockages, les **Connexions** conservent séparément les identifiants SSH chiffrés ou l’accès local du moteur. Une connexion peut servir à plusieurs racines. L’empreinte SSH est détectée au premier contact, puis doit être confirmée explicitement. Elle reste épinglée : un changement d’identité bloque les connexions suivantes.

Chaque ligne de **Stockages et correspondances** peut configurer un accès SSH et un accès local indépendants. L’API Arr ne nécessite aucun accès aux fichiers. Le chemin appartient à cette racine et non aux identifiants. Le bouton … parcourt les dossiers accessibles en lecture seule ; il ne crée ni supprime rien et ignore les liens symboliques. Les chemins locaux doivent correspondre à un véritable volume média monté dans le moteur, quel que soit son emplacement. Le bouton global Vérifier et enregistrer sauvegarde les associations puis valide les chemins rsync. Une modification invalide la validation précédente. Aucun transfert n’est lancé par la configuration.

Les deux racines d’un transfert rsync doivent appartenir à la même connexion validée. L’API Arr reste le mode par défaut ; aucun montage supplémentaire n’est requis pour SSH. La migration 0042 sépare les anciens profils sans exposer ou déchiffrer leurs secrets ; leurs connexions doivent être testées avant utilisation.


Les accès SSH et locaux d’une même racine peuvent désormais coexister dans la colonne **Accès aux fichiers**. Les modes de transfert autorisés et leur ordre de priorité se choisissent dans **Préparer**, avec des cases à cocher et les boutons ↑ / ↓. L’aperçu essaie les modes dans cet ordre et affiche le mode retenu ainsi que les contrôles échoués. La tâche enregistrée conserve ses préférences et fixe son mode d’exécution : aucun repli après le début d’une copie ou pendant une reprise. L’API reste sélectionnée seule par défaut.


### Points de montage locaux personnalisés

La connexion locale conserve un `browse_root` (par défaut `/storage`), modifiable par exemple vers `/usb1` ou `/media2`. Le bouton « Voir les volumes montés » ouvre `/`, une liste virtuelle des seuls montages média détectés dans `/proc/self/mountinfo` : le contenu de la racine du conteneur n’est jamais listé. Les montages système et applicatifs, les fichiers montés isolément et les liens symboliques sont exclus. Le moteur vérifie à nouveau la présence d’un montage réel avant chaque accès ; un dossier qui existe sur le disque du conteneur ne suffit pas. Cette configuration ne crée aucun montage Docker : les volumes doivent déjà être déclarés dans Compose.

`/storage` reste une entrée virtuelle de l’explorateur, même sans montage. Elle regroupe uniquement les volumes montés sous ce chemin et affiche une liste vide lorsqu’il n’y en a aucun. Elle ne devient sélectionnable pour un transfert que si `/storage` est lui-même un volume réellement monté.


## Rsync entre deux serveurs SSH

Les racines reprennent leurs accès validés dans **Stockages** : la préparation ne demande pas de nouvelle configuration SSH. Chaque racine doit avoir un accès SSH unique (ou l’accès déjà fixé dans une tâche existante). Les accès source et destination ainsi que leurs révisions sont conservés dans la tâche ; une modification impose de refaire l’aperçu.

Lorsque les accès diffèrent, le moteur relaie les données entre deux tunnels SSH. Il ne copie aucune clé SSH sur les NAS. Un récepteur rsync temporaire, authentifié et limité au dossier destination, écoute uniquement sur la boucle locale du serveur destination. Le relais utilise des sessions SSH ordinaires et fonctionne même lorsque les tunnels TCP SSH sont désactivés. Le débit dépend aussi du réseau du moteur.

La copie utilise un fichier `.partiel`, réparé par le delta rsync lors d’une reprise. La vérification standard utilise le checksum xxh128 du transfert ; le mode renforcé calcule SHA-256 localement sur chacun des deux serveurs. Après un redémarrage, les preuves du processus précédent sont contrôlées de nouveau. L’original est conservé jusqu’à la vérification de la destination et aux confirmations Arr/Plex. Une pause ou une déconnexion ferme les tunnels et arrête les opérations temporaires.

**Préparer** affiche l’espace libre des sources et de la destination au dernier contrôle. L’aperçu recontrôle les capacités avant de créer une tâche ; une valeur inconnue est indiquée comme telle.

Test d’intégration isolé : `python scripts/storage_peer_smoke.py` avec Docker disponible et l’image locale `watchdeck:local`. Le script crée puis supprime deux conteneurs temporaires ; il vérifie la pause, la reprise d’une copie partielle corrompue, les deux modes de vérification et le nettoyage après contrôle.

## Annuler une tâche

Dans **Transferts**, « Annuler la tâche » ouvre une confirmation. Le moteur arrête la copie avant de nettoyer uniquement les fichiers `.partiel` identifiés pour cette tâche. Les copies complètes et les fichiers source non transférés sont conservés ; les deux emplacements de bibliothèque Plex restent configurés. Si un accès ou un contrôle de sécurité empêche le nettoyage, la tâche affiche le motif et permet de réessayer l’annulation.

Avec rsync, la racine Arr ne change qu’après copie et vérification de tous les fichiers du titre. Le moteur compare à nouveau les inventaires source, destination et Arr juste avant la bascule : une série incomplète ou un épisode ajouté pendant la copie empêche cette bascule.

Une commande de déplacement déjà lancée par l’API Sonarr/Radarr peut continuer : l’annulation attend son résultat, sans tenter de l’interrompre ou de revenir sur le déplacement. Cette attente n’empêche pas les autres tâches de démarrer.

Les actions et détails des titres utilisent les composants partagés. Sur petit écran, les lignes restent compactes ; les chemins et dates détaillées s’ouvrent dans une modale adaptée au tactile.
