# Objectifs de déplacement

- **Libérer une quantité d’espace** : quantité globale pour les sources et instances choisies. Le plan cherche à atteindre cette valeur avec le moins de dépassement possible. La recherche est bornée pour les grandes bibliothèques ; elle ne garantit pas une combinaison mathématiquement optimale.
- **Atteindre un espace libre minimum** : seuil contrôlé séparément sur chaque source. Une source déjà au-dessus du seuil ne nécessite aucun déplacement.
- **Déplacer des titres choisis** : sélection explicite sans objectif d’espace.

Une option permet de répartir la quantité demandée sur un nombre exact de titres. Une série entière compte pour un titre. En mode par source, cette répartition est appliquée séparément à chaque source. Si la combinaison demandée est impossible, l’aperçu le signale. Les alternatives sont proposées sans être appliquées automatiquement. Un dépassement supérieur à 25 % ou un nombre de titres différent nécessite une acceptation dans l’aperçu.

Les critères facultatifs utilisent la date d’ajout Arr ou la dernière lecture connue de Plex. Un historique Plex incomplet entraîne un message explicite ; aucun historique n’est inventé. Les titres protégés sont stockés dans la base et exclus des futurs aperçus, même d’une sélection explicite. Ils peuvent être réautorisés dans Objectif.

L’espace de l’aperçu est une estimation. Les données copiées et celles en attente de suppression ne sont pas encore de l’espace réellement libéré. Le suivi ne compte cet espace qu’après la fin du déplacement et du nettoyage. Les validations de chemins, les contrôles des lectures et les règles de bascule Arr/Plex restent applicables.


## Gestion des tâches

Le menu d’une tâche terminée ou annulée propose une relance avec les mêmes paramètres : un nouvel aperçu est calculé avec les chemins et les titres disponibles actuellement, sans reprendre les anciennes preuves de copie ni lancer automatiquement un transfert. La relance avec de nouveaux paramètres ouvre la préparation. Une tâche en pause conserve aussi son action Reprendre pour continuer ses propres fichiers et points de reprise.

Supprimer un brouillon ou une tâche terminée retire son historique. Pour une tâche active ou arrêtée avec des fichiers partiels, la demande de suppression est persistée : le moteur termine l’annulation sûre et le nettoyage des seuls fichiers temporaires avant de retirer la tâche. Un échec conserve la tâche et son motif pour réessayer. Les originaux et les copies complètes ne sont pas supprimés par cette action.
