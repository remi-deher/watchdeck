# Objectifs de déplacement

- **Libérer une quantité d’espace** : quantité globale pour les sources et instances choisies. Le plan cherche à atteindre cette valeur avec le moins de dépassement possible. La recherche est bornée pour les grandes bibliothèques ; elle ne garantit pas une combinaison mathématiquement optimale.
- **Atteindre un espace libre minimum** : seuil contrôlé séparément sur chaque source. Une source déjà au-dessus du seuil ne nécessite aucun déplacement.
- **Déplacer des titres choisis** : sélection explicite sans objectif d’espace.

Une option permet de répartir la quantité demandée sur un nombre exact de titres. Une série entière compte pour un titre. En mode par source, cette répartition est appliquée séparément à chaque source. Si la combinaison demandée est impossible, l’aperçu le signale. Les alternatives sont proposées sans être appliquées automatiquement. Un dépassement supérieur à 25 % ou un nombre de titres différent nécessite une acceptation dans l’aperçu.

Les critères facultatifs utilisent la date d’ajout Arr ou la dernière lecture connue de Plex. Un historique Plex incomplet entraîne un message explicite ; aucun historique n’est inventé. Les titres protégés sont stockés dans la base et exclus des futurs aperçus, même d’une sélection explicite. Ils peuvent être réautorisés dans Objectif.

L’espace de l’aperçu est une estimation. Les données copiées et celles en attente de suppression ne sont pas encore de l’espace réellement libéré. Le suivi ne compte cet espace qu’après la fin du déplacement et du nettoyage. Les validations de chemins, les contrôles des lectures et les règles de bascule Arr/Plex restent applicables.


## Gestion des tâches

- **Relancer** : calcule un nouvel aperçu depuis les paramètres enregistrés. La confirmation réutilise le même identifiant de tâche, avec de nouveaux titres et preuves. Aucun transfert ne démarre à l’ouverture.
- **Modifier** : ouvre les paramètres du brouillon ou de la tâche terminée/annulée. Enregistrer conserve le même identifiant, même après renommage, sans calculer d’aperçu ni lancer de transfert. Les preuves du dernier transfert terminé restent conservées jusqu’à la confirmation d’une nouvelle sélection.
- **Créer une copie** : ouvre une nouvelle préparation avec les paramètres copiés. Seule sa confirmation crée une nouvelle tâche ; deux tâches peuvent avoir les mêmes paramètres.
- Une tâche active ou interrompue conserve Reprendre/Réessayer pour ses fichiers et points de reprise. Terminez ou annulez son transfert avant de modifier ses paramètres.

Le débit récent sert à estimer le temps de copie restant. Entre les phases et après la fin, la dernière mesure reste visible avec son libellé explicite ; elle ne produit pas d’estimation lorsque la copie n’est plus active. Les connexions SSH sont réutilisées pendant le traitement d’un titre puis fermées, y compris après interruption. Chaque opération utilise un canal distinct, les identités SSH épinglées et les vérifications d’intégrité restent obligatoires.

Supprimer un brouillon ou une tâche terminée retire son historique. Pour une tâche active ou arrêtée avec des fichiers partiels, la demande de suppression est persistée : le moteur termine l’annulation sûre et le nettoyage des seuls fichiers temporaires avant de retirer la tâche. Un échec conserve la tâche et son motif pour réessayer. Les originaux et les copies complètes ne sont pas supprimés par cette action.


Pendant un transfert rsync actif, les mesures sont recalculées environ chaque seconde, avec une moyenne glissante courte pour stabiliser le débit. L’interface visible lit chaque seconde un endpoint limité aux mesures des tâches actives. Cette lecture n’interroge ni les stockages, ni Arr/Plex, et ne retransmet pas les inventaires ou les preuves. Le rafraîchissement complet reste à cinq secondes. Une requête lente n’est pas doublée ; les mesures précédentes sont conservées en cas d’erreur réseau.

## Parcours et suivi

La page propose Transferts, Stockages et Historique avec les composants communs de navigation, cartes et tableaux. Les détails d'une tâche terminée restent dans Historique.

La préparation commence par l'objectif, puis les médias et le trajet. Aucune vérification distante n'est requise pour enregistrer les réglages. Les contrôles de sécurité restent effectués à l'aperçu et au démarrage.

Les cartes utilisent le catalogue local pour les affiches et les manifestes enregistrés pour les épisodes et saisons restant à copier. Les fichiers dont le nom ne permet pas d'identifier les épisodes restent sans compte estimé. L'ETA affichée concerne la copie, sans promettre la durée de finalisation Plex. Le débit est actualisé chaque seconde par le suivi existant.

L'historique compte les titres effectivement terminés. Le débit moyen utilise les échantillons de copie, sans les pauses ni les vérifications. Les anciennes tâches sans ces mesures affichent « Non mesuré ».

## Stockages et connexions

La réserve d'espace libre est désactivée par défaut pour un nouveau stockage. Une valeur en Go ou en pourcentage peut être activée ; l'équivalent est affiché lorsque la capacité est connue. La migration `0046_storage_reserve` conserve les réserves existantes.

Une connexion SSH peut conserver une clé privée et un mot de passe, avec une méthode prioritaire. Le recours à l'autre méthode est facultatif et intervient uniquement après un refus d'authentification. Une identité serveur différente ou une erreur réseau interrompt le contrôle. Les secrets enregistrés ne sont jamais renvoyés au formulaire.

Les stockages peuvent être attribués depuis la connexion. Les chemins accessibles sont explicites ; une nouvelle attribution remplace uniquement la connexion de même méthode, sans supprimer l'autre méthode. Une connexion utilisée par une tâche active ne peut pas être modifiée.
