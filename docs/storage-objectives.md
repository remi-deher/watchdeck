# Objectifs de déplacement

- **Libérer une quantité d’espace** : quantité globale pour les sources et instances choisies. Le plan cherche à atteindre cette valeur avec le moins de dépassement possible. La recherche est bornée pour les grandes bibliothèques ; elle ne garantit pas une combinaison mathématiquement optimale.
- **Atteindre un espace libre minimum** : seuil contrôlé séparément sur chaque source. Une source déjà au-dessus du seuil ne nécessite aucun déplacement.
- **Déplacer des titres choisis** : sélection explicite sans objectif d’espace.

Une option permet de répartir la quantité demandée sur un nombre exact de titres. Une série entière compte pour un titre. En mode par source, cette répartition est appliquée séparément à chaque source. Si la combinaison demandée est impossible, l’aperçu le signale. Les alternatives sont proposées sans être appliquées automatiquement. Un dépassement supérieur à 25 % ou un nombre de titres différent nécessite une acceptation dans l’aperçu.

Les critères facultatifs utilisent la date d’ajout Arr ou la dernière lecture connue de Plex. Un historique Plex incomplet entraîne un message explicite ; aucun historique n’est inventé. Les titres protégés sont stockés dans la base et exclus des futurs aperçus, même d’une sélection explicite. Ils peuvent être réautorisés dans Objectif.

L’espace de l’aperçu est une estimation. Les données copiées et celles en attente de suppression ne sont pas encore de l’espace réellement libéré. Le suivi ne compte cet espace qu’après la fin du déplacement et du nettoyage. Les validations de chemins, les contrôles des lectures et les règles de bascule Arr/Plex restent applicables.
